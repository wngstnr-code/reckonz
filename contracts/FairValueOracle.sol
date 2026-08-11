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

    /// @notice What a published value is measured against, so a jump can be
    ///         recognised. Kept separately from `Observation` because a
    ///         withheld observation must not erase the anchor: if it did,
    ///         publishing a withhold and then any value at all would walk
    ///         straight past the bound below.
    struct Anchor {
        /// @dev last fair value that actually took effect
        uint128 valueE8;
        uint64 at;
        /// @dev a jump awaiting confirmation, and when it was announced
        uint128 pendingE8;
        uint64 pendingAt;
    }

    /// @notice asset token address on X Layer => latest observation
    mapping(address => Observation) private _obs;
    mapping(address => Anchor) private _anchor;

    mapping(address => bool) public isPublisher;
    address public admin;

    /// @notice Consumers must reject data older than this.
    uint64 public maxAge = 15 minutes;

    /// @notice How far a published value may move from the last one that took
    ///         effect before it must be confirmed rather than believed.
    ///
    /// @dev Measured, not chosen. Across 14,484 one-day moves — every
    ///      close-to-open gap and daily return of the 29 reference listings over
    ///      a year — a 20% bound trips on **0.159%** of them (23), 15% on 0.42%,
    ///      30% on 0.021%. The largest legitimate one-day move in the sample was
    ///      31.86% (AMD). So this withholds roughly one publication in 600 for a
    ///      genuinely gapping asset, and a 20%+ move is exactly when automated
    ///      execution should stop anyway.
    ///
    ///      A `constant`, deliberately. An admin who can raise the bound has no
    ///      bound — the same argument that makes `MAX_FEE_BPS` constant in
    ///      `FeeCollector` (D37).
    uint256 public constant MAX_JUMP_BPS = 2_000;

    /// @notice How long a jump must sit announced before it can take effect.
    /// @dev Twice `maxAge`, so an asset waiting on confirmation is already
    ///      stale to consumers and nothing executes against the old value
    ///      either. It does not stop a patient attacker; it caps the rate of
    ///      change and forces two transactions and a loud event.
    uint64 public constant JUMP_CONFIRM_DELAY = 30 minutes;

    /// @notice An announced jump this old can no longer be confirmed.
    /// @dev Four confirmation delays — enough that an honest publisher on a
    ///      fifteen-minute cycle has several attempts, short enough that an
    ///      announcement is a window rather than a standing permission.
    ///
    ///      It must be strictly inside `ANCHOR_MAX_AGE` or it is unreachable:
    ///      set to the same day, the anchor always expires first and this
    ///      constant never runs. A test found that, which is the argument for
    ///      testing the expiry paths rather than reasoning about them.
    uint64 public constant PENDING_TTL = 2 hours;

    /// @notice Beyond this the anchor is not a meaningful comparison.
    /// @dev One day, because `MAX_JUMP_BPS` is calibrated against one-day moves.
    ///      Bounding a fresh value against a week-old anchor would apply a
    ///      one-day tolerance to a week of price movement and withhold
    ///      constantly. Past it, the feed is restarting rather than continuing,
    ///      and consumers have been rejecting on `STALE` throughout.
    uint64 public constant ANCHOR_MAX_AGE = 1 days;

    /// @notice Ceiling on `maxAge`.
    /// @dev Also constant. An admin who can set `maxAge` to a year makes every
    ///      stale observation usable again, which defeats the freshness check
    ///      without touching a single price.
    uint64 public constant MAX_MAX_AGE = 1 hours;

    event Published(address indexed asset, uint128 fairValueE8, uint8 gapRisk, MarketState state);
    event PublisherSet(address indexed publisher, bool allowed);
    event MaxAgeSet(uint64 maxAge);
    event AdminSet(address indexed admin);
    /// @notice A value too far from the anchor to be believed on sight. The
    ///         observation was written with its value withheld.
    event JumpPending(
        address indexed asset, uint128 fromE8, uint128 toE8, uint256 jumpBps, uint64 confirmableAt
    );
    /// @notice A previously announced jump took effect.
    event JumpConfirmed(address indexed asset, uint128 fromE8, uint128 toE8);

    error NotAdmin();
    error NotPublisher();
    error NoData();
    error Stale(uint64 updatedAt, uint64 nowTs);
    error ValueWithheld();
    error ValuelessPublication(address asset);
    error GapRiskOutOfRange(uint8 gapRisk);
    error ZeroAddress();
    error MaxAgeOutOfRange(uint64 maxAge);

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
        // Zero would make every observation instantly stale and brick the
        // guard; anything large would make stale data usable, which is the
        // freshness check defeated without touching a price.
        if (newMaxAge == 0 || newMaxAge > MAX_MAX_AGE) revert MaxAgeOutOfRange(newMaxAge);
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

        bool takesEffect = p.hasValue && _admitValue(p.asset, p.fairValueE8);

        _obs[p.asset] = Observation({
            // A value the bound refused is withheld, not published. The rest of
            // the observation still lands: gap risk, capacity and state remain
            // true and are exactly what a mandate wants to see at that moment.
            fairValueE8: takesEffect ? p.fairValueE8 : 0,
            confidenceBps: p.confidenceBps,
            basisBps: p.basisBps,
            capacityUsdg: p.capacityUsdg,
            gapRisk: p.gapRisk,
            state: p.state,
            anchorAt: p.anchorAt,
            updatedAt: uint64(block.timestamp),
            hasValue: takesEffect
        });

        emit Published(p.asset, takesEffect ? p.fairValueE8 : 0, p.gapRisk, p.state);
    }

    /// @notice Decide whether a value may take effect, and record the anchor.
    ///
    /// @dev The threat this bounds is a leaked publisher key. Publishing runs
    ///      every fifteen minutes from a machine, so it cannot sit behind a
    ///      multisig — a human cannot co-sign it and an automated co-signer's
    ///      key lives on the same box. The contract has to be the constraint.
    ///
    ///      A refused value is **withheld, not reverted**, on purpose:
    ///      `publishMany` writes 28 assets in one transaction, and one asset
    ///      gapping must not throw away the other 27. Withholding is also the
    ///      vocabulary the whole system already speaks — when it cannot defend
    ///      a number it declines to publish one.
    ///
    ///      This bounds and slows a compromise. It does not prevent one: an
    ///      attacker holding the key long enough can walk the value in
    ///      confirmed steps. That is why it is one half of the answer and the
    ///      admin multisig is the other, and why the gap stays on the record.
    function _admitValue(address asset, uint128 valueE8) private returns (bool) {
        Anchor storage a = _anchor[asset];

        // No usable anchor: genesis, or a feed that has lapsed past the window
        // its tolerance was calibrated for. Nothing to compare against, so the
        // value re-anchors. This is a real limit, not an oversight — a first
        // publication cannot be bounded without an outside reference.
        if (a.valueE8 == 0 || block.timestamp > uint256(a.at) + ANCHOR_MAX_AGE) {
            _anchorTo(a, valueE8);
            return true;
        }

        uint256 jumpBps = _jumpBps(a.valueE8, valueE8);
        if (jumpBps <= MAX_JUMP_BPS) {
            // Back inside the bound: any announced jump is abandoned, so a
            // stale announcement can never be confirmed later by accident.
            _anchorTo(a, valueE8);
            return true;
        }

        // The confirmation must agree with what was announced, within the
        // ordinary bound. Otherwise announcing one jump would license
        // publishing any other, and the delay would buy nothing.
        bool confirmable = a.pendingAt != 0 && block.timestamp >= uint256(a.pendingAt) + JUMP_CONFIRM_DELAY
            && block.timestamp <= uint256(a.pendingAt) + PENDING_TTL
            && _jumpBps(a.pendingE8, valueE8) <= MAX_JUMP_BPS;

        if (confirmable) {
            emit JumpConfirmed(asset, a.valueE8, valueE8);
            _anchorTo(a, valueE8);
            return true;
        }

        a.pendingE8 = valueE8;
        a.pendingAt = uint64(block.timestamp);
        // uint64 + uint64 under checked arithmetic, rather than casting a
        // uint256 sum down. The cast is unreachable in practice and that is
        // exactly what was said about the two that turned into D31 and D36.
        emit JumpPending(asset, a.valueE8, valueE8, jumpBps, a.pendingAt + JUMP_CONFIRM_DELAY);
        return false;
    }

    function _anchorTo(Anchor storage a, uint128 valueE8) private {
        a.valueE8 = valueE8;
        a.at = uint64(block.timestamp);
        a.pendingE8 = 0;
        a.pendingAt = 0;
    }

    /// @dev Relative to `from`, so the bound is symmetric in ratio rather than
    ///      in absolute price. `from` is never zero on this path.
    function _jumpBps(uint128 from, uint128 to) private pure returns (uint256) {
        uint256 diff = to > from ? uint256(to) - from : uint256(from) - to;
        return (diff * 10_000) / uint256(from);
    }

    /// @notice What a value is currently measured against, and any jump waiting
    ///         on confirmation. Exposed so the refusal is inspectable rather
    ///         than something a publisher has to be believed about.
    function anchorOf(address asset) external view returns (Anchor memory) {
        return _anchor[asset];
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
