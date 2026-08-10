// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ExitTriggers} from "./ExitTriggers.sol";
import {IFairValueOracle} from "./interfaces/IFairValueOracle.sol";
import {ReceiptRegistry} from "./ReceiptRegistry.sol";

interface IERC20Meta {
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

/// @title PolicyGuard
/// @notice A user-authored mandate, stored on-chain, enforced in the same
///         transaction as the trades it governs.
///
/// @dev The design point that matters: `validateAndRecord` is called at the end
///      of the execution transaction, *after* the swaps. If any rule fails it
///      reverts, and the swaps revert with it. An off-chain check is decoration
///      — a compromised agent simply skips it. This one cannot be skipped,
///      because without it the transaction does not settle.
///
///      The system is non-custodial: this contract never holds user funds and
///      has no transfer path. It constrains what may happen to assets that stay
///      in the user's own wallet.
///
///      The agent key can only ever cause a rebalance *inside* the mandate. The
///      worst case from a hallucinating or prompt-injected agent is a bounded
///      loss, not a drained wallet.
contract PolicyGuard {
    using ExitTriggers for ExitTriggers.Trigger;
    using ExitTriggers for ExitTriggers.Position;

    // ------------------------------------------------------------- types

    struct Policy {
        /// @dev max share of portfolio value in any single asset
        uint16 maxWeightBps;
        /// @dev min share that must remain in USDG
        uint16 minCashBufferBps;
        /// @dev ceiling on realised slippage per fill
        uint16 maxSlippageBps;
        /// @dev tolerance around oracle fair value, widened by the oracle's own band
        uint16 maxDeviationBps;
        /// @dev ceiling on the oracle's gap-risk score
        uint8 maxGapRisk;
        /// @dev ceiling on a single fill, USDG 6 decimals
        uint128 maxNotionalPerTrade;
        uint16 maxFillsPerEpoch;
        uint32 epochDuration;
        uint32 minRebalanceInterval;
        /// @dev when false, portfolio-level weight checks are skipped. Off by
        ///      default because they cost a balance read per allowed asset.
        bool enforceWeights;
    }

    struct Mandate {
        address owner;
        /// @dev the only key permitted to propose; may be the owner
        address agent;
        /// @dev contract permitted to call validateAndRecord for this mandate
        address executor;
        uint32 version;
        bool active;
        bool circuitBreaker;
        uint64 lastActionAt;
        uint64 epochStart;
        uint16 fillsThisEpoch;
        Policy policy;
    }

    // ----------------------------------------------------------- storage

    IFairValueOracle public immutable oracle;
    ReceiptRegistry public immutable receipts;
    /// @dev settlement currency; the cash leg of every mandate
    address public immutable cash;

    uint256 public nextMandateId = 1;
    mapping(uint256 => Mandate) private _mandates;
    /// @dev mandateId => exit triggers compiled from the thesis
    mapping(uint256 => ExitTriggers.Trigger[]) private _triggers;
    /// @dev mandateId => asset => running position, maintained from settled fills
    mapping(uint256 => mapping(address => ExitTriggers.Position)) private _positions;

    /// @dev mandateId => asset => allowed
    mapping(uint256 => mapping(address => bool)) public isAllowedAsset;
    /// @dev mandateId => allowlist, needed for portfolio-level checks
    mapping(uint256 => address[]) private _assetList;
    /// @dev mandateId => asset => already present in `_assetList`. Distinct from
    ///      `isAllowedAsset`, which toggles: an asset that is disallowed stays in
    ///      the list, and re-allowing it must not append a second entry.
    mapping(uint256 => mapping(address => bool)) private _listed;
    mapping(uint256 => mapping(address => uint8)) private _assetDecimals;

    uint256 public constant MAX_ASSETS = 24;
    uint256 public constant MAX_TRIGGERS = 16;

    // ------------------------------------------------------------ events

    event MandateCreated(uint256 indexed mandateId, address indexed owner, address indexed agent);
    event PolicyUpdated(uint256 indexed mandateId, uint32 version);
    event AgentChanged(uint256 indexed mandateId, address agent);
    event ExecutorChanged(uint256 indexed mandateId, address executor);
    event AssetAllowed(uint256 indexed mandateId, address indexed asset, bool allowed);
    event CircuitBreakerSet(uint256 indexed mandateId, bool tripped);
    event TriggersSet(uint256 indexed mandateId, uint256 count, uint32 version);
    event MandateClosed(uint256 indexed mandateId);
    event Executed(uint256 indexed mandateId, uint256 indexed receiptId, uint256 fills);

    // ------------------------------------------------------------ errors

    error NotOwner();
    error NotExecutor();
    error Inactive();
    error Tripped();
    error AssetNotAllowed(address asset);
    error TooManyAssets();
    error NotionalTooLarge(address asset, uint128 amount, uint128 limit);
    error SlippageTooHigh(address asset, uint16 realised, uint16 limit);
    error OracleRejected(address asset, bytes32 reason);
    error TooSoon(uint64 lastActionAt, uint32 minInterval);
    error EpochFillLimit(uint16 used, uint16 limit);
    error WeightExceeded(address asset, uint256 weightBps, uint16 limit);
    error CashBufferBreached(uint256 weightBps, uint16 limit);
    error NoFills();
    error BadPolicy();
    error TriggerFired(uint256 triggerIndex, address asset, int256 value, int256 threshold);
    error TooManyTriggers();
    error DecimalsUnknown(address asset);

    // ------------------------------------------------------------- init

    constructor(IFairValueOracle oracle_, ReceiptRegistry receipts_, address cash_) {
        oracle = oracle_;
        receipts = receipts_;
        cash = cash_;
    }

    modifier onlyOwner(uint256 mandateId) {
        if (_mandates[mandateId].owner != msg.sender) revert NotOwner();
        _;
    }

    // -------------------------------------------------------- lifecycle

    function createMandate(
        address agent,
        address executor,
        Policy calldata policy,
        address[] calldata assets
    ) external returns (uint256 mandateId) {
        _validatePolicy(policy);
        if (assets.length > MAX_ASSETS) revert TooManyAssets();

        mandateId = nextMandateId++;
        Mandate storage m = _mandates[mandateId];
        m.owner = msg.sender;
        m.agent = agent;
        m.executor = executor;
        m.version = 1;
        m.active = true;
        m.epochStart = uint64(block.timestamp);
        m.policy = policy;

        for (uint256 i; i < assets.length; ++i) {
            _allowAsset(mandateId, assets[i], true);
        }

        emit MandateCreated(mandateId, msg.sender, agent);
    }

    /// @dev Bumps the version so receipts record which policy was in force.
    function updatePolicy(uint256 mandateId, Policy calldata policy)
        external
        onlyOwner(mandateId)
    {
        _validatePolicy(policy);
        Mandate storage m = _mandates[mandateId];
        m.policy = policy;
        unchecked {
            m.version += 1;
        }
        emit PolicyUpdated(mandateId, m.version);
    }

    function setAgent(uint256 mandateId, address agent) external onlyOwner(mandateId) {
        _mandates[mandateId].agent = agent;
        emit AgentChanged(mandateId, agent);
    }

    function setExecutor(uint256 mandateId, address executor) external onlyOwner(mandateId) {
        _mandates[mandateId].executor = executor;
        emit ExecutorChanged(mandateId, executor);
    }

    function setAssetAllowed(uint256 mandateId, address asset, bool allowed)
        external
        onlyOwner(mandateId)
    {
        _allowAsset(mandateId, asset, allowed);
    }

    /// @notice Owner kill switch. Deliberately not delegable to the agent.
    function setCircuitBreaker(uint256 mandateId, bool tripped)
        external
        onlyOwner(mandateId)
    {
        _mandates[mandateId].circuitBreaker = tripped;
        emit CircuitBreakerSet(mandateId, tripped);
    }

    /// @notice Install the exit triggers compiled from the thesis.
    /// @dev Owner only — the agent must never be able to remove the rules that
    ///      bound it. Bumps the version so receipts record which rule set was in
    ///      force. Replaces wholesale; there is no append.
    function setTriggers(uint256 mandateId, ExitTriggers.Trigger[] calldata triggers)
        external
        onlyOwner(mandateId)
    {
        if (triggers.length > MAX_TRIGGERS) revert TooManyTriggers();

        delete _triggers[mandateId];
        for (uint256 i; i < triggers.length; ++i) {
            _triggers[mandateId].push(triggers[i]);
        }

        Mandate storage m = _mandates[mandateId];
        unchecked {
            m.version += 1;
        }
        emit TriggersSet(mandateId, triggers.length, m.version);
    }

    function closeMandate(uint256 mandateId) external onlyOwner(mandateId) {
        _mandates[mandateId].active = false;
        emit MandateClosed(mandateId);
    }

    // --------------------------------------------------------- the gate

    /// @notice Validate a completed batch of fills against the mandate and
    ///         record it. Reverts the entire transaction on any violation.
    /// @dev Called by the executor AFTER the swaps have settled, so the prices
    ///      and slippage passed in are realised, not predicted.
    function validateAndRecord(
        uint256 mandateId,
        ReceiptRegistry.Fill[] calldata fills,
        bytes32 thesisHash,
        bytes32 evidenceHash,
        string calldata evidenceCID
    ) external returns (uint256 receiptId) {
        Mandate storage m = _mandates[mandateId];

        if (msg.sender != m.executor) revert NotExecutor();
        if (!m.active) revert Inactive();
        if (m.circuitBreaker) revert Tripped();
        if (fills.length == 0) revert NoFills();

        Policy memory p = m.policy;

        // --- rate limits -------------------------------------------------
        if (m.lastActionAt != 0 && block.timestamp < m.lastActionAt + p.minRebalanceInterval) {
            revert TooSoon(m.lastActionAt, p.minRebalanceInterval);
        }

        uint16 used = m.fillsThisEpoch;
        if (block.timestamp >= m.epochStart + p.epochDuration) {
            m.epochStart = uint64(block.timestamp);
            used = 0;
        }
        uint16 wouldUse = used + uint16(fills.length);
        if (wouldUse > p.maxFillsPerEpoch) revert EpochFillLimit(used, p.maxFillsPerEpoch);

        // --- per-fill checks ---------------------------------------------
        ReceiptRegistry.Fill[] memory recorded = new ReceiptRegistry.Fill[](fills.length);

        for (uint256 i; i < fills.length; ++i) {
            ReceiptRegistry.Fill calldata f = fills[i];

            if (!isAllowedAsset[mandateId][f.asset]) revert AssetNotAllowed(f.asset);
            if (f.amountInUsdg > p.maxNotionalPerTrade) {
                revert NotionalTooLarge(f.asset, f.amountInUsdg, p.maxNotionalPerTrade);
            }
            if (f.slippageBps > p.maxSlippageBps) {
                revert SlippageTooHigh(f.asset, f.slippageBps, p.maxSlippageBps);
            }

            (bool ok, bytes32 reason) = oracle.checkExecution(
                f.asset, f.executionPriceE8, p.maxGapRisk, p.maxDeviationBps
            );
            if (!ok) revert OracleRejected(f.asset, reason);

            // Stamp the oracle's own view into the receipt so the record shows
            // what the guard was looking at, not just what the agent claimed.
            (uint128 fv,, uint8 gapRisk) = oracle.fairValue(f.asset);
            recorded[i] = ReceiptRegistry.Fill({
                asset: f.asset,
                isExit: f.isExit,
                amountInUsdg: f.amountInUsdg,
                amountOut: f.amountOut,
                executionPriceE8: f.executionPriceE8,
                slippageBps: f.slippageBps,
                fairValueE8: fv,
                gapRisk: gapRisk
            });
        }

        // --- exit triggers -----------------------------------------------
        // Checked against the position as it stood BEFORE these fills. Adding to
        // a position whose own thesis says to leave it is the case this catches,
        // and a post-fill blended cost basis would mask exactly that.
        //
        // Exits are never blocked: a mandate whose triggers fire but which
        // cannot sell would be worse than having no triggers at all.
        for (uint256 i; i < fills.length; ++i) {
            if (fills[i].isExit) continue;
            _requireNoTriggerFired(mandateId, fills[i].asset);
        }

        // --- position accounting ------------------------------------------
        for (uint256 i; i < fills.length; ++i) {
            ExitTriggers.applyFill(
                _positions[mandateId][fills[i].asset],
                fills[i].isExit,
                fills[i].amountOut,
                fills[i].executionPriceE8,
                recorded[i].fairValueE8
            );
        }

        // --- portfolio-level checks --------------------------------------
        if (p.enforceWeights) {
            _checkWeights(mandateId, m.owner, p);
        }

        m.lastActionAt = uint64(block.timestamp);
        m.fillsThisEpoch = wouldUse;

        receiptId = receipts.append(
            mandateId, m.version, thesisHash, evidenceHash, evidenceCID, m.agent, recorded
        );
        emit Executed(mandateId, receiptId, fills.length);
    }

    /// @notice Same checks, no state change. The executor and the off-chain
    ///         planner both call this first so a rejection costs no gas.
    function dryRun(uint256 mandateId, ReceiptRegistry.Fill[] calldata fills)
        external
        view
        returns (bool ok, bytes32 reason, address offendingAsset)
    {
        Mandate storage m = _mandates[mandateId];
        if (!m.active) return (false, "INACTIVE", address(0));
        if (m.circuitBreaker) return (false, "CIRCUIT_BREAKER", address(0));
        if (fills.length == 0) return (false, "NO_FILLS", address(0));

        Policy memory p = m.policy;
        if (m.lastActionAt != 0 && block.timestamp < m.lastActionAt + p.minRebalanceInterval) {
            return (false, "TOO_SOON", address(0));
        }

        uint16 used = block.timestamp >= m.epochStart + p.epochDuration ? 0 : m.fillsThisEpoch;
        if (used + fills.length > p.maxFillsPerEpoch) return (false, "EPOCH_LIMIT", address(0));

        for (uint256 i; i < fills.length; ++i) {
            ReceiptRegistry.Fill calldata f = fills[i];
            if (!isAllowedAsset[mandateId][f.asset]) return (false, "ASSET_NOT_ALLOWED", f.asset);
            if (f.amountInUsdg > p.maxNotionalPerTrade) return (false, "NOTIONAL", f.asset);
            if (f.slippageBps > p.maxSlippageBps) return (false, "SLIPPAGE", f.asset);

            (bool o, bytes32 r) =
                oracle.checkExecution(f.asset, f.executionPriceE8, p.maxGapRisk, p.maxDeviationBps);
            if (!o) return (false, r, f.asset);
        }
        return (true, bytes32(0), address(0));
    }

    // ---------------------------------------------------------- internal

    /// @dev Reverts naming the trigger, the asset, and both sides of the
    ///      comparison — a rejection the user can act on, not a bare revert.
    function _requireNoTriggerFired(uint256 mandateId, address asset) internal view {
        ExitTriggers.Trigger[] storage triggers = _triggers[mandateId];
        if (triggers.length == 0) return;

        IFairValueOracle.Observation memory o = oracle.observation(asset);
        ExitTriggers.Position memory pos = _positions[mandateId][asset];

        for (uint256 i; i < triggers.length; ++i) {
            ExitTriggers.Trigger memory t = triggers[i];
            if (!ExitTriggers.covers(t, asset)) continue;
            if (ExitTriggers.fired(t, o, pos)) {
                revert TriggerFired(
                    i, asset, ExitTriggers.evaluate(t.metric, o, pos), t.threshold
                );
            }
        }
    }

    /// @notice Which triggers are firing right now, and for which assets.
    /// @dev The read the UI and the off-chain planner both use, so a rebalance
    ///      is never proposed that the guard would reject. Assets whose oracle
    ///      data is missing or stale are reported as `staleAssets` rather than
    ///      silently treated as fine.
    function firedTriggers(uint256 mandateId)
        external
        view
        returns (uint256[] memory triggerIndexes, address[] memory assets, address[] memory staleAssets)
    {
        address[] storage list = _assetList[mandateId];
        ExitTriggers.Trigger[] storage triggers = _triggers[mandateId];

        uint256 maxHits = list.length * triggers.length;
        uint256[] memory idxBuf = new uint256[](maxHits);
        address[] memory assetBuf = new address[](maxHits);
        address[] memory staleBuf = new address[](list.length);
        uint256 n;
        uint256 stale;

        for (uint256 a; a < list.length; ++a) {
            address asset = list[a];
            if (!isAllowedAsset[mandateId][asset]) continue;

            try oracle.observation(asset) returns (IFairValueOracle.Observation memory o) {
                ExitTriggers.Position memory pos = _positions[mandateId][asset];
                for (uint256 i; i < triggers.length; ++i) {
                    ExitTriggers.Trigger memory t = triggers[i];
                    if (!ExitTriggers.covers(t, asset)) continue;
                    if (ExitTriggers.fired(t, o, pos)) {
                        idxBuf[n] = i;
                        assetBuf[n] = asset;
                        ++n;
                    }
                }
            } catch {
                staleBuf[stale++] = asset;
            }
        }

        triggerIndexes = new uint256[](n);
        assets = new address[](n);
        staleAssets = new address[](stale);
        for (uint256 i; i < n; ++i) {
            triggerIndexes[i] = idxBuf[i];
            assets[i] = assetBuf[i];
        }
        for (uint256 i; i < stale; ++i) {
            staleAssets[i] = staleBuf[i];
        }
    }

    function getTriggers(uint256 mandateId)
        external
        view
        returns (ExitTriggers.Trigger[] memory)
    {
        return _triggers[mandateId];
    }

    function getPosition(uint256 mandateId, address asset)
        external
        view
        returns (ExitTriggers.Position memory)
    {
        return _positions[mandateId][asset];
    }


    /// @dev Weights are measured from the owner's actual wallet balances at the
    ///      end of the transaction, priced by the oracle. Nothing is taken on
    ///      the agent's word — but note this only works while every allowed
    ///      asset has a publishable oracle value. If one does not, the check
    ///      reverts rather than silently skipping the asset, which would leave
    ///      a hole exactly where the risk is highest.
    function _checkWeights(uint256 mandateId, address owner, Policy memory p) internal view {
        address[] storage list = _assetList[mandateId];
        uint256 n = list.length;

        uint256[] memory values = new uint256[](n);
        uint256 total;

        for (uint256 i; i < n; ++i) {
            address asset = list[i];
            if (!isAllowedAsset[mandateId][asset]) continue;
            uint8 dec = _assetDecimals[mandateId][asset];
            if (dec == 0) revert DecimalsUnknown(asset);
            uint256 bal = IERC20Meta(asset).balanceOf(owner);
            if (bal == 0) continue;
            (uint128 fv,,) = oracle.fairValue(asset);
            uint256 v = (bal * fv) / (10 ** dec);
            values[i] = v;
            total += v;
        }

        // cash is 6 decimals, prices are 8 — scale to the same E8 basis
        uint256 cashValue = IERC20Meta(cash).balanceOf(owner) * 1e2;
        total += cashValue;
        if (total == 0) return;

        for (uint256 i; i < n; ++i) {
            if (values[i] == 0) continue;
            uint256 wBps = (values[i] * 10_000) / total;
            if (wBps > p.maxWeightBps) revert WeightExceeded(list[i], wBps, p.maxWeightBps);
        }

        uint256 cashBps = (cashValue * 10_000) / total;
        if (cashBps < p.minCashBufferBps) revert CashBufferBreached(cashBps, p.minCashBufferBps);
    }

    /// @dev `decimals()` is only needed for portfolio-level weight checks, so a
    ///      token that cannot answer must not block mandate creation — that
    ///      would couple every mandate to a call it may not need. Unknown
    ///      decimals are recorded as 0 and `_checkWeights` refuses to run
    ///      against them, so the capability degrades loudly instead of silently
    ///      pricing a position with a guessed scale.
    ///
    ///      Membership in `_assetList` is tracked separately from the allow flag.
    ///      Keying the append off `isAllowedAsset` meant allow → disallow → allow
    ///      pushed the asset twice, and `_checkWeights` then counted the same
    ///      balance twice: the inflated total shrinks every computed weight, so
    ///      the cap silently stops binding at exactly the moment it matters.
    function _allowAsset(uint256 mandateId, address asset, bool allowed) internal {
        if (allowed && !_listed[mandateId][asset]) {
            if (_assetList[mandateId].length >= MAX_ASSETS) revert TooManyAssets();
            _assetList[mandateId].push(asset);
            _listed[mandateId][asset] = true;
            // Low-level on purpose: a high-level call to an address with no
            // code reverts on Solidity's own extcodesize check, in this
            // contract's frame, where try/catch cannot reach it.
            (bool ok, bytes memory data) =
                asset.staticcall(abi.encodeWithSelector(IERC20Meta.decimals.selector));
            _assetDecimals[mandateId][asset] =
                ok && data.length >= 32 ? abi.decode(data, (uint8)) : 0;
        }
        isAllowedAsset[mandateId][asset] = allowed;
        emit AssetAllowed(mandateId, asset, allowed);
    }

    function _validatePolicy(Policy calldata p) internal pure {
        if (p.maxWeightBps == 0 || p.maxWeightBps > 10_000) revert BadPolicy();
        if (p.minCashBufferBps > 10_000) revert BadPolicy();
        if (p.maxGapRisk > 100) revert BadPolicy();
        if (p.maxFillsPerEpoch == 0) revert BadPolicy();
        if (p.epochDuration == 0) revert BadPolicy();
    }

    // ----------------------------------------------------------- reading

    function getMandate(uint256 mandateId) external view returns (Mandate memory) {
        return _mandates[mandateId];
    }

    function allowedAssets(uint256 mandateId) external view returns (address[] memory) {
        return _assetList[mandateId];
    }
}
