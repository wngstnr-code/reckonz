// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title FairValueOracle
/// @notice Publishes, for each tokenised equity on X Layer, a fair-value band
///         and a gap-risk score derived from instruments that are still trading
///         while the underlying market is closed.
///
/// @dev This contract deliberately does NOT claim to publish "the price". It
///      publishes an estimate, the width of its own uncertainty, and a risk
///      score — so consumers can refuse to execute rather than trust a number.
///      Any consumer that treats `fairValueE8` as truth while ignoring
///      `confidenceBps` and `gapRisk` is misusing it.
contract FairValueOracle {
    enum MarketState {
        OPEN,
        PRE,
        POST,
        CLOSED_OVERNIGHT,
        CLOSED_WEEKEND,
        NO_REFERENCE
    }

    struct Observation {
        /// @dev fair value, 8 decimals. Zero when withheld.
        uint128 fairValueE8;
        /// @dev half-width of the 95% band, in basis points
        uint32 confidenceBps;
        /// @dev on-chain price versus fair value, basis points. Signed:
        ///      negative means the pool trades below fair value.
        int32 basisBps;
        /// @dev USDG the asset absorbs at the reference impact limit, 6 decimals.
        ///      Measured by walking real pool liquidity off-chain — the tick walk
        ///      is far too expensive to do on-chain, so it is published here
        ///      under the same trust boundary and staleness rules as fair value
        ///      rather than taken on the executor's word.
        uint128 capacityUsdg;
        /// @dev 0-100
        uint8 gapRisk;
        MarketState state;
        /// @dev when the reference market last printed a regular-session price
        uint64 anchorAt;
        /// @dev when this observation was written on-chain
        uint64 updatedAt;
        /// @dev false when no defensible value exists (e.g. a private company)
        bool hasValue;
    }

    /// @notice One asset's measurements. Used by both publish paths so the
    ///         single and batch forms cannot drift apart.
    struct Publication {
        address asset;
        uint128 fairValueE8;
        uint32 confidenceBps;
        int32 basisBps;
        uint128 capacityUsdg;
        uint8 gapRisk;
        MarketState state;
        uint64 anchorAt;
        bool hasValue;
    }

    /// @notice asset token address on X Layer => latest observation
    mapping(address => Observation) private _obs;

    mapping(address => bool) public isPublisher;
    address public admin;

    /// @notice Consumers must reject data older than this.
    uint64 public maxAge = 15 minutes;

    event Published(address indexed asset, uint128 fairValueE8, uint8 gapRisk, MarketState state);
    event PublisherSet(address indexed publisher, bool allowed);
    event MaxAgeSet(uint64 maxAge);
    event AdminSet(address indexed admin);

    error NotAdmin();
    error NotPublisher();
    error NoData();
    error Stale(uint64 updatedAt, uint64 nowTs);
    error ValueWithheld();
    error ValuelessPublication(address asset);
    error GapRiskOutOfRange(uint8 gapRisk);
    error ZeroAddress();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor(address admin_) {
        admin = admin_;
        isPublisher[admin_] = true;
        emit PublisherSet(admin_, true);
    }

    // ------------------------------------------------------------ admin

    function setPublisher(address publisher, bool allowed) external onlyAdmin {
        isPublisher[publisher] = allowed;
        emit PublisherSet(publisher, allowed);
    }

    function setMaxAge(uint64 newMaxAge) external onlyAdmin {
        maxAge = newMaxAge;
        emit MaxAgeSet(newMaxAge);
    }

    function setAdmin(address newAdmin) external onlyAdmin {
        // Handing admin to the zero address would freeze the publisher set with
        // no way back, and this contract is the guard's only source of truth.
        if (newAdmin == address(0)) revert ZeroAddress();
        admin = newAdmin;
        emit AdminSet(newAdmin);
    }

    // -------------------------------------------------------- publishing

    function publish(Publication calldata p) public {
        if (!isPublisher[msg.sender]) revert NotPublisher();
        if (p.gapRisk > 100) revert GapRiskOutOfRange(p.gapRisk);
        // A published value of zero is not a value. Allowing `hasValue` with a
        // zero price would make `checkExecution` divide by zero and revert with
        // a panic instead of a rejection code — the guard would stop working in
        // the one way that gives no reason. Withholding is expressed by
        // `hasValue == false`, and it is the only way to express it.
        if (p.hasValue && p.fairValueE8 == 0) revert ValuelessPublication(p.asset);

        _obs[p.asset] = Observation({
            fairValueE8: p.hasValue ? p.fairValueE8 : 0,
            confidenceBps: p.confidenceBps,
            basisBps: p.basisBps,
            capacityUsdg: p.capacityUsdg,
            gapRisk: p.gapRisk,
            state: p.state,
            anchorAt: p.anchorAt,
            updatedAt: uint64(block.timestamp),
            hasValue: p.hasValue
        });

        emit Published(p.asset, p.fairValueE8, p.gapRisk, p.state);
    }

    function publishMany(Publication[] calldata items) external {
        for (uint256 i; i < items.length; ++i) {
            publish(items[i]);
        }
    }

    // ----------------------------------------------------------- reading

    /// @notice Raw observation, no checks. For UIs and analytics.
    function peek(address asset) external view returns (Observation memory) {
        return _obs[asset];
    }

    /// @notice Fresh, defensible fair value or revert. For contracts.
    function fairValue(address asset)
        external
        view
        returns (uint128 valueE8, uint32 confidenceBps, uint8 gapRisk)
    {
        Observation memory o = _obs[asset];
        if (o.updatedAt == 0) revert NoData();
        if (block.timestamp > o.updatedAt + maxAge) revert Stale(o.updatedAt, uint64(block.timestamp));
        if (!o.hasValue) revert ValueWithheld();
        return (o.fairValueE8, o.confidenceBps, o.gapRisk);
    }

    /// @notice Fresh observation or revert, without requiring a defensible
    ///         value. PolicyGuard uses this for metrics that remain meaningful
    ///         when the value itself is withheld — gap risk and capacity in
    ///         particular are exactly what a mandate wants to see then.
    function observation(address asset) external view returns (Observation memory) {
        Observation memory o = _obs[asset];
        if (o.updatedAt == 0) revert NoData();
        if (block.timestamp > o.updatedAt + maxAge) revert Stale(o.updatedAt, uint64(block.timestamp));
        return o;
    }

    /// @notice The check a PolicyGuard runs in the same transaction as the swap.
    /// @param asset            token being traded
    /// @param executionPriceE8 realised price of the trade, 8 decimals
    /// @param maxGapRisk       mandate's ceiling on gap risk
    /// @param maxDeviationBps  how far outside the fair-value band the mandate
    ///                         tolerates executing
    /// @return ok              whether the trade is permitted
    /// @return reason          machine-readable rejection code
    function checkExecution(
        address asset,
        uint256 executionPriceE8,
        uint8 maxGapRisk,
        uint32 maxDeviationBps
    ) external view returns (bool ok, bytes32 reason) {
        Observation memory o = _obs[asset];

        if (o.updatedAt == 0) return (false, "NO_DATA");
        if (block.timestamp > o.updatedAt + maxAge) return (false, "STALE");
        if (!o.hasValue) return (false, "NO_REFERENCE");
        // Defence in depth: `publish` now refuses this combination, but an
        // observation written before that rule must still reject cleanly rather
        // than divide by zero.
        if (o.fairValueE8 == 0) return (false, "NO_REFERENCE");
        if (o.gapRisk > maxGapRisk) return (false, "GAP_RISK");

        uint256 fv = o.fairValueE8;
        uint256 diff = executionPriceE8 > fv ? executionPriceE8 - fv : fv - executionPriceE8;
        uint256 deviationBps = (diff * 10_000) / fv;

        // The mandate's tolerance is widened by the oracle's own admitted
        // uncertainty — punishing a trade for landing inside the band the
        // oracle itself cannot resolve would be incoherent.
        if (deviationBps > uint256(maxDeviationBps) + o.confidenceBps) {
            return (false, "OFF_FAIR_VALUE");
        }

        return (true, bytes32(0));
    }
}
