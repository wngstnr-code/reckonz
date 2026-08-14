// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ExitTriggers} from "../contracts/ExitTriggers.sol";
import {FairValueOracle} from "../contracts/FairValueOracle.sol";
import {IFairValueOracle} from "../contracts/interfaces/IFairValueOracle.sol";
import {PolicyGuard} from "../contracts/PolicyGuard.sol";
import {ReceiptRegistry} from "../contracts/ReceiptRegistry.sol";

contract MockToken {
    string public name;
    uint8 public immutable decimals;
    mapping(address => uint256) public balanceOf;

    constructor(string memory name_, uint8 decimals_) {
        name = name_;
        decimals = decimals_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
}

/// Exercises the library's metric semantics directly. The guard cannot reach
/// these paths with a withheld value — `checkExecution` rejects first — but the
/// library must still behave correctly, because it is what a future exit path
/// and `firedTriggers` both call.
contract ExitTriggersHarness {
    function evaluate(
        ExitTriggers.Metric m,
        IFairValueOracle.Observation memory o,
        ExitTriggers.Position memory p
    ) external view returns (int256) {
        return ExitTriggers.evaluate(m, o, p);
    }
}

contract ExitTriggersTest is Test {
    ExitTriggersHarness h;

    function setUp() public {
        h = new ExitTriggersHarness();
        vm.warp(1_786_368_600);
    }

    function _obs(bool hasValue, uint128 fv, uint128 capacity)
        internal
        view
        returns (IFairValueOracle.Observation memory)
    {
        return IFairValueOracle.Observation({
            fairValueE8: fv,
            confidenceBps: 200,
            basisBps: -150,
            capacityUsdg: capacity,
            gapRisk: 42,
            state: 1,
            anchorAt: uint64(block.timestamp - 64 hours),
            updatedAt: uint64(block.timestamp),
            hasValue: hasValue
        });
    }

    function test_CapacityAndGapRiskDoNotNeedADefensibleValue() public view {
        IFairValueOracle.Observation memory o = _obs(false, 0, 100_000000);
        ExitTriggers.Position memory p;
        assertEq(h.evaluate(ExitTriggers.Metric.capacityUsdg, o, p), int256(100_000000));
        assertEq(h.evaluate(ExitTriggers.Metric.gapRisk, o, p), int256(42));
        assertEq(h.evaluate(ExitTriggers.Metric.basisBps, o, p), int256(-150));
        assertEq(h.evaluate(ExitTriggers.Metric.stalenessHours, o, p), int256(64));
    }

    function test_DrawdownRevertsRatherThanReadingZeroWhenValueWithheld() public {
        IFairValueOracle.Observation memory o = _obs(false, 0, 5_000_000000);
        ExitTriggers.Position memory p =
            ExitTriggers.Position({units: 1e18, costBasisE8: 100e8, entryFairValueE8: 100e8});

        vm.expectRevert(
            abi.encodeWithSelector(
                ExitTriggers.MetricUnavailable.selector, ExitTriggers.Metric.drawdownBpsFromEntry
            )
        );
        h.evaluate(ExitTriggers.Metric.drawdownBpsFromEntry, o, p);
    }

    function test_DrawdownIsZeroWithNoPosition() public view {
        IFairValueOracle.Observation memory o = _obs(true, 80e8, 5_000_000000);
        ExitTriggers.Position memory p;
        assertEq(h.evaluate(ExitTriggers.Metric.drawdownBpsFromEntry, o, p), 0);
    }

    function test_DrawdownAndPriceMoveAreSignedCorrectly() public view {
        IFairValueOracle.Observation memory o = _obs(true, 80e8, 5_000_000000);
        ExitTriggers.Position memory p =
            ExitTriggers.Position({units: 1e18, costBasisE8: 100e8, entryFairValueE8: 100e8});
        // 20% below entry: a loss is positive drawdown, a fall is negative move.
        assertEq(h.evaluate(ExitTriggers.Metric.drawdownBpsFromEntry, o, p), int256(2000));
        assertEq(h.evaluate(ExitTriggers.Metric.priceVsThesisEntryBps, o, p), int256(-2000));
    }
}

contract PolicyGuardTest is Test {
    FairValueOracle oracle;
    ReceiptRegistry receipts;
    PolicyGuard guard;

    MockToken usdg;
    MockToken wNVDAx;
    MockToken wSPYx;

    address owner = address(0xA11CE);
    address agent = address(0xA6E7);
    address executor = address(0xE9EC);
    address stranger = address(0xBAD);

    uint256 mandateId;

    // NVDA ≈ 223.51 USDG, 8 decimals
    uint128 constant NVDA_FV = 223_51000000;
    uint128 constant SPY_FV = 772_99000000;

    function setUp() public {
        vm.warp(1_786_368_600);

        oracle = new FairValueOracle(address(this));
        receipts = new ReceiptRegistry(address(this));

        usdg = new MockToken("Global Dollar", 6);
        wNVDAx = new MockToken("Wrapped NVIDIA xStock", 18);
        wSPYx = new MockToken("Wrapped SP500 xStock", 18);

        guard = new PolicyGuard(IFairValueOracle(address(oracle)), receipts, address(usdg));
        receipts.setWriter(address(guard), true);

        _publish(address(wNVDAx), NVDA_FV, 211, 38);
        _publish(address(wSPYx), SPY_FV, 24, 27);

        address[] memory assets = new address[](2);
        assets[0] = address(wNVDAx);
        assets[1] = address(wSPYx);

        vm.prank(owner);
        mandateId = guard.createMandate(agent, executor, _policy(), assets);
    }

    // ------------------------------------------------------------ helpers

    function _policy() internal pure returns (PolicyGuard.Policy memory) {
        return PolicyGuard.Policy({
            maxWeightBps: 4000,
            minCashBufferBps: 500,
            maxSlippageBps: 50,
            maxDeviationBps: 100,
            maxGapRisk: 60,
            maxNotionalPerTrade: 5_000_000000, // 5,000 USDG
            maxFillsPerEpoch: 4,
            epochDuration: 1 days,
            minRebalanceInterval: 1 hours,
            enforceWeights: false
        });
    }

    uint128 constant DEFAULT_CAPACITY = 5_000_000000; // 5,000 USDG

    function _publish(address asset, uint128 fv, uint32 confidenceBps, uint8 gapRisk) internal {
        _publish(asset, fv, confidenceBps, gapRisk, 0, DEFAULT_CAPACITY, true);
    }

    function _publish(
        address asset,
        uint128 fv,
        uint32 confidenceBps,
        uint8 gapRisk,
        int32 basisBps,
        uint128 capacityUsdg,
        bool hasValue
    ) internal {
        oracle.publish(
            FairValueOracle.Publication({
                asset: asset,
                fairValueE8: fv,
                confidenceBps: confidenceBps,
                basisBps: basisBps,
                capacityUsdg: capacityUsdg,
                gapRisk: gapRisk,
                state: FairValueOracle.MarketState.PRE,
                anchorAt: uint64(block.timestamp),
                hasValue: hasValue
            })
        );
    }

    /// Publish a value the bound will not believe on sight: announce it, wait
    /// out the confirmation delay, publish it again. Two transactions and
    /// thirty minutes is what a move past `MAX_JUMP_BPS` costs now, and tests
    /// that move a price hard have to pay it like anything else would.
    function _publishJump(address asset, uint128 fv, uint32 confidenceBps, uint8 gapRisk) internal {
        _publish(asset, fv, confidenceBps, gapRisk);
        vm.warp(block.timestamp + oracle.JUMP_CONFIRM_DELAY());
        _publish(asset, fv, confidenceBps, gapRisk);
    }

    function _trigger(
        ExitTriggers.Metric metric,
        ExitTriggers.Comparator comparator,
        int256 threshold,
        address[] memory assets
    ) internal pure returns (ExitTriggers.Trigger[] memory ts) {
        ts = new ExitTriggers.Trigger[](1);
        ts[0] = ExitTriggers.Trigger({
            metric: metric,
            comparator: comparator,
            threshold: threshold,
            assets: assets
        });
    }

    function _only(address a) internal pure returns (address[] memory out) {
        out = new address[](1);
        out[0] = a;
    }

    function _none() internal pure returns (address[] memory out) {
        out = new address[](0);
    }

    function _fill(address asset, uint128 usdgIn, uint128 priceE8, uint16 slippageBps)
        internal
        pure
        returns (ReceiptRegistry.Fill[] memory fills)
    {
        fills = new ReceiptRegistry.Fill[](1);
        fills[0] = ReceiptRegistry.Fill({
            asset: asset,
            isExit: false,
            amountInUsdg: usdgIn,
            amountOut: uint128((uint256(usdgIn) * 1e20) / priceE8), // 6dec -> 18dec
            executionPriceE8: priceE8,
            slippageBps: slippageBps,
            fairValueE8: 0,
            gapRisk: 0
        });
    }

    function _exec(ReceiptRegistry.Fill[] memory fills) internal returns (uint256) {
        vm.prank(executor);
        return guard.validateAndRecord(mandateId, fills, keccak256("thesis"), keccak256("evidence"), "ipfs://cid");
    }

    // ------------------------------------------- the allowlist is a set

    /// Toggling an asset off and on again used to append a second entry to the
    /// mandate's asset list. `_checkWeights` then read the same balance twice:
    /// the doubled total shrinks every computed weight, so the cap stops
    /// binding at precisely the moment it is supposed to.
    function test_ReAllowingAnAssetDoesNotDuplicateItInTheList() public {
        assertEq(guard.allowedAssets(mandateId).length, 2);

        vm.startPrank(owner);
        guard.setAssetAllowed(mandateId, address(wNVDAx), false);
        guard.setAssetAllowed(mandateId, address(wNVDAx), true);
        vm.stopPrank();

        address[] memory list = guard.allowedAssets(mandateId);
        assertEq(list.length, 2, "asset must appear once, however often it is toggled");
        assertTrue(guard.isAllowedAsset(mandateId, address(wNVDAx)));
    }

    function test_WeightCapStillBindsAfterAToggle() public {
        // A weight-enforcing mandate holding one asset and a little cash.
        PolicyGuard.Policy memory p = _policy();
        p.enforceWeights = true;
        p.maxWeightBps = 4000;
        p.minCashBufferBps = 0;
        p.maxSlippageBps = 200;

        address[] memory assets = new address[](1);
        assets[0] = address(wNVDAx);
        vm.prank(owner);
        uint256 id = guard.createMandate(agent, executor, p, assets);

        vm.startPrank(owner);
        guard.setAssetAllowed(id, address(wNVDAx), false);
        guard.setAssetAllowed(id, address(wNVDAx), true);
        vm.stopPrank();

        // 10 units at ~223 USDG is ~2,235 of a ~2,335 portfolio: ~95%, far past
        // the 40% cap. Double-counting the asset would have halved that to ~48%
        // — still over, so make the cash side large enough that only the
        // duplicate could rescue it.
        wNVDAx.mint(owner, 10e18);
        usdg.mint(owner, 2_100_000000);

        vm.expectRevert();
        vm.prank(executor);
        guard.validateAndRecord(
            id, _fill(address(wNVDAx), 100_000000, NVDA_FV, 10), bytes32(0), bytes32(0), ""
        );
    }

    // ------------------------------------ a published value of zero is not one

    /// `hasValue` with a zero price used to be publishable, and `checkExecution`
    /// then divided by it: the guard reverted with a panic and no reason code.
    function test_OracleRefusesToPublishAValueOfZero() public {
        vm.expectRevert(
            abi.encodeWithSelector(FairValueOracle.ValuelessPublication.selector, address(wNVDAx))
        );
        oracle.publish(
            FairValueOracle.Publication({
                asset: address(wNVDAx),
                fairValueE8: 0,
                confidenceBps: 100,
                basisBps: 0,
                capacityUsdg: DEFAULT_CAPACITY,
                gapRisk: 10,
                state: FairValueOracle.MarketState.PRE,
                anchorAt: uint64(block.timestamp),
                hasValue: true
            })
        );
    }

    function test_WithholdingIsStillTheWayToSayNoValue() public {
        _publish(address(wNVDAx), 0, 0, 10, 0, DEFAULT_CAPACITY, false);
        (bool ok, bytes32 reason) =
            oracle.checkExecution(address(wNVDAx), NVDA_FV, 60, 100);
        assertFalse(ok);
        assertEq(reason, bytes32("NO_REFERENCE"), "a clean reason, not a panic");
    }

    // -------------------------------------------------------- happy path

    function test_ValidFillIsRecorded() public {
        uint256 receiptId = _exec(_fill(address(wNVDAx), 2_000_000000, NVDA_FV, 41));

        (ReceiptRegistry.Receipt memory r, ReceiptRegistry.Fill[] memory f) = receipts.get(receiptId);
        assertEq(r.mandateId, mandateId);
        assertEq(r.policyVersion, 1);
        assertEq(r.agent, agent);
        assertEq(f.length, 1);
        assertEq(f[0].asset, address(wNVDAx));
        // the guard stamps the oracle's own view, not the agent's claim
        assertEq(f[0].fairValueE8, NVDA_FV);
        assertEq(f[0].gapRisk, 38);
    }

    function test_PerformanceIsDerivedFromFills() public {
        uint256 t0 = block.timestamp;
        _exec(_fill(address(wNVDAx), 2_000_000000, NVDA_FV, 40));

        vm.warp(t0 + 2 hours);
        _publish(address(wSPYx), SPY_FV, 24, 27); // observations expire after 15 minutes
        _exec(_fill(address(wSPYx), 1_000_000000, SPY_FV, 10));

        (uint256 notional, uint256 slippage, uint256 count) = receipts.performance(mandateId);
        assertEq(notional, 3_000_000000);
        assertEq(count, 2);
        // notional-weighted: (2000*40 + 1000*10) / 3000 = 30
        assertEq(slippage, 30);
    }

    /// `performance` counts exits, and that changes what the number means.
    ///
    /// Its doc comment calls it "the primitive a track record page reads" and
    /// notes it cannot be inflated by the agent. Both true, and neither is the
    /// hazard: on an exit `amountInUsdg` is the cash that came *back*, so the
    /// notional adds money out to money in, and an exit's shortfall is averaged
    /// into the slippage alongside an entry's.
    ///
    /// Found on 2026-08-14, the first time anything read the view: mainnet
    /// mandate #1 reports 6.620806 USDG at 17bp here against 3.545425 USDG at
    /// 25bp for its entries alone — the figure `src/track-record.ts` computes,
    /// deliberately, by filtering exits out.
    ///
    /// Pinned rather than changed. `ReceiptRegistry` is kept across every
    /// migration because it holds the whole history, so its semantics are not
    /// ours to revise; what was missing was anyone stating them. See D72.
    function test_PerformanceCountsExitsAsNotionalToo() public {
        uint256 t0 = block.timestamp;
        _exec(_fill(address(wNVDAx), 2_000_000000, NVDA_FV, 40));

        vm.warp(t0 + 2 hours);
        _publish(address(wNVDAx), NVDA_FV, 24, 27); // observations expire after 15 minutes

        // Selling the position back: 1,000 USDG of proceeds, and a shortfall of
        // zero because the oracle could not defend a value to measure against.
        ReceiptRegistry.Fill[] memory exitFill = _fill(address(wNVDAx), 1_000_000000, NVDA_FV, 0);
        exitFill[0].isExit = true;
        _exec(exitFill);

        (uint256 notional, uint256 slippage, uint256 count) = receipts.performance(mandateId);

        // 2,000 in and 1,000 back out reads as 3,000 of notional, not 2,000.
        assertEq(notional, 3_000_000000, "an exit adds to notional rather than closing it");
        assertEq(count, 2);
        // (2000*40 + 1000*0) / 3000 = 26, against 40 for the capital deployed.
        assertEq(slippage, 26, "the exit's zero shortfall drags the average down");
    }

    // ------------------------------------------------------- the refusals

    function test_RejectsUnknownAsset() public {
        MockToken other = new MockToken("wTSLAx", 18);
        _publish(address(other), 100e8, 100, 10);
        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.AssetNotAllowed.selector, address(other)));
        _exec(_fill(address(other), 100_000000, 100e8, 10));
    }

    function test_RejectsOversizedNotional() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                PolicyGuard.NotionalTooLarge.selector, address(wNVDAx), uint128(6_000_000000), uint128(5_000_000000)
            )
        );
        _exec(_fill(address(wNVDAx), 6_000_000000, NVDA_FV, 10));
    }

    function test_RejectsExcessSlippage() public {
        vm.expectRevert(
            abi.encodeWithSelector(PolicyGuard.SlippageTooHigh.selector, address(wNVDAx), uint16(118), uint16(50))
        );
        _exec(_fill(address(wNVDAx), 2_000_000000, NVDA_FV, 118));
    }

    function test_RejectsHighGapRisk() public {
        _publish(address(wNVDAx), NVDA_FV, 211, 69); // above the mandate's 60
        vm.expectRevert(
            abi.encodeWithSelector(PolicyGuard.OracleRejected.selector, address(wNVDAx), bytes32("GAP_RISK"))
        );
        _exec(_fill(address(wNVDAx), 2_000_000000, NVDA_FV, 10));
    }

    function test_RejectsWithheldValue() public {
        // wSPCXx case: oracle publishes an observation but withholds the value
        _publish(address(wNVDAx), 0, 0, 100, 0, DEFAULT_CAPACITY, false);
        vm.expectRevert(
            abi.encodeWithSelector(PolicyGuard.OracleRejected.selector, address(wNVDAx), bytes32("NO_REFERENCE"))
        );
        _exec(_fill(address(wNVDAx), 2_000_000000, NVDA_FV, 10));
    }

    function test_RejectsStaleOracle() public {
        vm.warp(block.timestamp + 1 hours); // oracle maxAge is 15 minutes
        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.OracleRejected.selector, address(wNVDAx), bytes32("STALE")));
        _exec(_fill(address(wNVDAx), 2_000_000000, NVDA_FV, 10));
    }

    function test_RejectsExecutionFarFromFairValue() public {
        // 5% above fair value; tolerance is 100bp + the oracle's 211bp band
        uint128 badPrice = uint128((uint256(NVDA_FV) * 105) / 100);
        vm.expectRevert(
            abi.encodeWithSelector(PolicyGuard.OracleRejected.selector, address(wNVDAx), bytes32("OFF_FAIR_VALUE"))
        );
        _exec(_fill(address(wNVDAx), 2_000_000000, badPrice, 10));
    }

    function test_ToleranceIsWidenedByOracleUncertainty() public {
        // 2.5% away: outside the mandate's 100bp on its own, but inside
        // 100bp + the oracle's admitted 211bp band, so it must pass.
        uint128 price = uint128((uint256(NVDA_FV) * 1025) / 1000);
        _exec(_fill(address(wNVDAx), 2_000_000000, price, 10));
    }

    function test_EnforcesMinRebalanceInterval() public {
        _exec(_fill(address(wNVDAx), 1_000_000000, NVDA_FV, 10));
        vm.expectRevert(
            abi.encodeWithSelector(PolicyGuard.TooSoon.selector, uint64(block.timestamp), uint32(1 hours))
        );
        _exec(_fill(address(wNVDAx), 1_000_000000, NVDA_FV, 10));
    }

    /// @dev Absolute timestamps on purpose: under via_ir the Yul optimiser
    ///      hoists `block.timestamp` out of a loop, so `warp(block.timestamp + …)`
    ///      inside one silently warps to the same instant every iteration.
    function test_EnforcesEpochFillLimit() public {
        uint256 t0 = block.timestamp;
        for (uint256 i; i < 4; ++i) {
            _exec(_fill(address(wNVDAx), 100_000000, NVDA_FV, 10));
            vm.warp(t0 + (i + 1) * 2 hours);
            _publish(address(wNVDAx), NVDA_FV, 211, 38);
        }
        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.EpochFillLimit.selector, uint16(4), uint16(4)));
        _exec(_fill(address(wNVDAx), 100_000000, NVDA_FV, 10));
    }

    function test_EpochResetsAfterEpochDuration() public {
        uint256 t0 = block.timestamp;
        for (uint256 i; i < 4; ++i) {
            _exec(_fill(address(wNVDAx), 100_000000, NVDA_FV, 10));
            vm.warp(t0 + (i + 1) * 2 hours);
            _publish(address(wNVDAx), NVDA_FV, 211, 38);
        }
        vm.warp(t0 + 2 days);
        _publish(address(wNVDAx), NVDA_FV, 211, 38);
        _exec(_fill(address(wNVDAx), 100_000000, NVDA_FV, 10)); // new epoch, allowed again
    }

    function test_OnlyExecutorMayCall() public {
        ReceiptRegistry.Fill[] memory fills = _fill(address(wNVDAx), 1_000_000000, NVDA_FV, 10);
        vm.prank(agent); // even the agent cannot settle directly
        vm.expectRevert(PolicyGuard.NotExecutor.selector);
        guard.validateAndRecord(mandateId, fills, bytes32(0), bytes32(0), "");
    }

    function test_CircuitBreakerStopsEverything() public {
        vm.prank(owner);
        guard.setCircuitBreaker(mandateId, true);
        vm.expectRevert(PolicyGuard.Tripped.selector);
        _exec(_fill(address(wNVDAx), 1_000_000000, NVDA_FV, 10));
    }

    function test_AgentCannotTripOrUntripOrRepoint() public {
        vm.startPrank(agent);
        vm.expectRevert(PolicyGuard.NotOwner.selector);
        guard.setCircuitBreaker(mandateId, true);
        vm.expectRevert(PolicyGuard.NotOwner.selector);
        guard.setExecutor(mandateId, stranger);
        vm.expectRevert(PolicyGuard.NotOwner.selector);
        guard.setAssetAllowed(mandateId, address(0xDEAD), true);
        vm.stopPrank();
    }

    /// The core claim of the design: a fully compromised agent still cannot
    /// exceed the mandate. Every escape route must fail.
    function test_CompromisedAgentIsBounded() public {
        MockToken attacker = new MockToken("EVIL", 18);
        _publish(address(attacker), 1e8, 0, 0);

        vm.startPrank(agent);
        // cannot widen its own policy
        vm.expectRevert(PolicyGuard.NotOwner.selector);
        guard.updatePolicy(mandateId, _policy());
        // cannot allowlist an asset to drain into
        vm.expectRevert(PolicyGuard.NotOwner.selector);
        guard.setAssetAllowed(mandateId, address(attacker), true);
        vm.stopPrank();

        // and cannot route value into it through the executor either
        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.AssetNotAllowed.selector, address(attacker)));
        _exec(_fill(address(attacker), 1_000_000000, 1e8, 0));
    }

    // ----------------------------------------------------------- triggers

    function _exitFill(address asset, uint128 units, uint128 priceE8)
        internal
        pure
        returns (ReceiptRegistry.Fill[] memory fills)
    {
        fills = new ReceiptRegistry.Fill[](1);
        fills[0] = ReceiptRegistry.Fill({
            asset: asset,
            isExit: true,
            amountInUsdg: uint128((uint256(units) * priceE8) / 1e20),
            amountOut: units,
            executionPriceE8: priceE8,
            slippageBps: 10,
            fairValueE8: 0,
            gapRisk: 0
        });
    }

    function test_PositionTracksWeightedAverageCostBasis() public {
        uint256 t0 = block.timestamp;
        _exec(_fill(address(wNVDAx), 1_000_000000, NVDA_FV, 10)); // 1000 USDG @ 223.51

        vm.warp(t0 + 2 hours);
        uint128 higher = NVDA_FV * 2; // 447.02
        // A 100% move is far past MAX_JUMP_BPS, so it has to be confirmed
        // before it takes effect — see FairValueOracle.t.sol.
        _publishJump(address(wNVDAx), higher, 211, 38);
        _exec(_fill(address(wNVDAx), 1_000_000000, higher, 10)); // 1000 USDG @ 447.02

        ExitTriggers.Position memory p = guard.getPosition(mandateId, address(wNVDAx));
        // Same notional at 2x the price buys half the units, so the weighted
        // average sits nearer the cheaper entry — not the midpoint of the prices.
        assertGt(p.costBasisE8, NVDA_FV);
        assertLt(p.costBasisE8, (NVDA_FV + higher) / 2);
        assertEq(p.entryFairValueE8, NVDA_FV, "entry fair value is fixed at first open");
    }

    function test_DrawdownTriggerBlocksAddingToALosingPosition() public {
        uint256 t0 = block.timestamp;
        _exec(_fill(address(wNVDAx), 2_000_000000, NVDA_FV, 10));

        vm.prank(owner);
        guard.setTriggers(
            mandateId,
            _trigger(
                ExitTriggers.Metric.drawdownBpsFromEntry,
                ExitTriggers.Comparator.gt,
                1500,
                _only(address(wNVDAx))
            )
        );

        // fair value drops 20% — past the 15% threshold
        uint128 down = uint128((uint256(NVDA_FV) * 80) / 100);
        vm.warp(t0 + 2 hours);
        _publish(address(wNVDAx), down, 211, 38);

        vm.expectRevert(
            abi.encodeWithSelector(
                PolicyGuard.TriggerFired.selector, uint256(0), address(wNVDAx), int256(2000), int256(1500)
            )
        );
        _exec(_fill(address(wNVDAx), 1_000_000000, down, 10));
    }

    function test_ExitIsAlwaysAllowedEvenWhenATriggerHasFired() public {
        uint256 t0 = block.timestamp;
        _exec(_fill(address(wNVDAx), 2_000_000000, NVDA_FV, 10));

        vm.prank(owner);
        guard.setTriggers(
            mandateId,
            _trigger(
                ExitTriggers.Metric.drawdownBpsFromEntry,
                ExitTriggers.Comparator.gt,
                1500,
                _only(address(wNVDAx))
            )
        );

        uint128 down = uint128((uint256(NVDA_FV) * 80) / 100);
        vm.warp(t0 + 2 hours);
        _publish(address(wNVDAx), down, 211, 38);

        ExitTriggers.Position memory before = guard.getPosition(mandateId, address(wNVDAx));
        _exec(_exitFill(address(wNVDAx), before.units, down)); // must not revert

        assertEq(guard.getPosition(mandateId, address(wNVDAx)).units, 0);
        assertEq(guard.getPosition(mandateId, address(wNVDAx)).costBasisE8, 0);
    }

    function test_DrawdownTriggerDoesNotFireBeforeThreshold() public {
        uint256 t0 = block.timestamp;
        _exec(_fill(address(wNVDAx), 2_000_000000, NVDA_FV, 10));

        vm.prank(owner);
        guard.setTriggers(
            mandateId,
            _trigger(
                ExitTriggers.Metric.drawdownBpsFromEntry,
                ExitTriggers.Comparator.gt,
                1500,
                _only(address(wNVDAx))
            )
        );

        uint128 down = uint128((uint256(NVDA_FV) * 90) / 100); // 10% — inside the limit
        vm.warp(t0 + 2 hours);
        _publish(address(wNVDAx), down, 211, 38);
        _exec(_fill(address(wNVDAx), 1_000_000000, down, 10)); // must not revert
    }

    function test_CapacityTriggerBlocksWhenLiquidityThins() public {
        vm.prank(owner);
        guard.setTriggers(
            mandateId,
            _trigger(
                ExitTriggers.Metric.capacityUsdg, ExitTriggers.Comparator.lt, 500_000000, _none()
            )
        );

        // 400 USDG of capacity — below the 500 floor
        _publish(address(wNVDAx), NVDA_FV, 211, 38, 0, 400_000000, true);

        vm.expectRevert(
            abi.encodeWithSelector(
                PolicyGuard.TriggerFired.selector,
                uint256(0),
                address(wNVDAx),
                int256(400_000000),
                int256(500_000000)
            )
        );
        _exec(_fill(address(wNVDAx), 100_000000, NVDA_FV, 10));
    }

    function test_BasketWideTriggerCoversEveryAllowedAsset() public {
        vm.prank(owner);
        guard.setTriggers(
            mandateId,
            _trigger(ExitTriggers.Metric.basisBps, ExitTriggers.Comparator.gt, 400, _none())
        );

        _publish(address(wSPYx), SPY_FV, 24, 27, 600, DEFAULT_CAPACITY, true); // 6% basis

        vm.expectRevert(
            abi.encodeWithSelector(
                PolicyGuard.TriggerFired.selector, uint256(0), address(wSPYx), int256(600), int256(400)
            )
        );
        _exec(_fill(address(wSPYx), 100_000000, SPY_FV, 10));
    }

    /// A withheld value is caught by the per-fill oracle gate before any trigger
    /// is evaluated. Locking the ordering matters: it is the reason the library's
    /// withheld-value semantics are tested separately, in ExitTriggersTest.
    function test_WithheldValueIsRejectedBeforeTriggersAreEvaluated() public {
        vm.prank(owner);
        guard.setTriggers(
            mandateId,
            _trigger(
                ExitTriggers.Metric.capacityUsdg, ExitTriggers.Comparator.lt, 500_000000, _none()
            )
        );
        _publish(address(wNVDAx), 0, 0, 55, 0, 100_000000, false);

        vm.expectRevert(
            abi.encodeWithSelector(
                PolicyGuard.OracleRejected.selector, address(wNVDAx), bytes32("NO_REFERENCE")
            )
        );
        _exec(_fill(address(wNVDAx), 100_000000, NVDA_FV, 10));
    }

    function test_AgentCannotRemoveTheTriggersThatBoundIt() public {
        vm.prank(owner);
        guard.setTriggers(
            mandateId,
            _trigger(ExitTriggers.Metric.gapRisk, ExitTriggers.Comparator.gt, 40, _none())
        );

        vm.prank(agent);
        vm.expectRevert(PolicyGuard.NotOwner.selector);
        guard.setTriggers(mandateId, new ExitTriggers.Trigger[](0));

        assertEq(guard.getTriggers(mandateId).length, 1);
    }

    function test_FiredTriggersReportsScopeAndStaleness() public {
        vm.prank(owner);
        guard.setTriggers(
            mandateId,
            _trigger(ExitTriggers.Metric.gapRisk, ExitTriggers.Comparator.gt, 30, _none())
        );

        // wNVDAx gap 38 fires; wSPYx gap 27 does not.
        (uint256[] memory idx, address[] memory assets, address[] memory stale) =
            guard.firedTriggers(mandateId);
        assertEq(idx.length, 1);
        assertEq(assets[0], address(wNVDAx));
        assertEq(stale.length, 0);

        // Let both observations age out — they become stale, not "fine".
        vm.warp(block.timestamp + 1 hours);
        (idx,, stale) = guard.firedTriggers(mandateId);
        assertEq(idx.length, 0);
        assertEq(stale.length, 2, "stale assets are reported, not silently passed");
    }

    // ------------------------------------------------------------ weights

    function test_EnforcesWeightsFromRealBalances() public {
        PolicyGuard.Policy memory p = _policy();
        p.enforceWeights = true;
        vm.prank(owner);
        guard.updatePolicy(mandateId, p);

        // 10 NVDA ≈ 2,235 USDG against 100 USDG cash → ~96% weight
        wNVDAx.mint(owner, 10e18);
        usdg.mint(owner, 100_000000);

        vm.expectRevert(
            abi.encodeWithSelector(PolicyGuard.WeightExceeded.selector, address(wNVDAx), uint256(9571), uint16(4000))
        );
        _exec(_fill(address(wNVDAx), 1_000_000000, NVDA_FV, 10));
    }

    function test_WeightsPassWhenPortfolioIsBalanced() public {
        PolicyGuard.Policy memory p = _policy();
        p.enforceWeights = true;
        vm.prank(owner);
        guard.updatePolicy(mandateId, p);

        wNVDAx.mint(owner, 4e18); // ~894 USDG
        wSPYx.mint(owner, 1e18); // ~773 USDG
        usdg.mint(owner, 2_000_000000); // 2,000 USDG cash

        _exec(_fill(address(wNVDAx), 500_000000, NVDA_FV, 10));
    }

    function test_AssetWithoutDecimalsIsAllowedButBlocksWeightChecks() public {
        // The testnet case: an allowlisted address with no deployed token behind
        // it. Mandate creation must still work; weight enforcement must refuse.
        address ghost = address(0xF00D);
        vm.prank(owner);
        guard.setAssetAllowed(mandateId, ghost, true);
        assertTrue(guard.isAllowedAsset(mandateId, ghost));

        PolicyGuard.Policy memory p = _policy();
        p.enforceWeights = true;
        vm.prank(owner);
        guard.updatePolicy(mandateId, p);

        wNVDAx.mint(owner, 1e18);
        usdg.mint(owner, 1_000_000000);

        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.DecimalsUnknown.selector, ghost));
        _exec(_fill(address(wNVDAx), 100_000000, NVDA_FV, 10));
    }

    // ------------------------------------------------------------ dry run

    function test_DryRunMatchesTheRealCheck() public view {
        (bool ok,, address asset) =
            guard.dryRun(mandateId, _fill(address(wNVDAx), 2_000_000000, NVDA_FV, 41));
        assertTrue(ok);
        assertEq(asset, address(0));

        (bool ok2, bytes32 reason,) =
            guard.dryRun(mandateId, _fill(address(wNVDAx), 2_000_000000, NVDA_FV, 118));
        assertFalse(ok2);
        assertEq(reason, bytes32("SLIPPAGE"));
    }

    // --------------------------------------------------------- immutable

    function test_ReceiptsAreAppendOnly() public {
        _exec(_fill(address(wNVDAx), 1_000_000000, NVDA_FV, 10));
        assertEq(receipts.count(), 1);

        // Only the guard may write, and nothing anywhere can rewrite.
        vm.expectRevert(ReceiptRegistry.NotWriter.selector);
        receipts.append(mandateId, 1, bytes32(0), bytes32(0), "", agent, _fill(address(wNVDAx), 1, 1, 0));
    }

    function test_PolicyVersionIsStampedIntoReceipts() public {
        uint256 first = _exec(_fill(address(wNVDAx), 1_000_000000, NVDA_FV, 10));

        PolicyGuard.Policy memory p = _policy();
        p.maxSlippageBps = 20;
        vm.prank(owner);
        guard.updatePolicy(mandateId, p);

        vm.warp(block.timestamp + 2 hours);
        _publish(address(wNVDAx), NVDA_FV, 211, 38);
        uint256 second = _exec(_fill(address(wNVDAx), 1_000_000000, NVDA_FV, 10));
        assertEq(receipts.count(), 2);

        (ReceiptRegistry.Receipt memory r1,) = receipts.get(first);
        (ReceiptRegistry.Receipt memory r2,) = receipts.get(second);
        assertEq(r1.policyVersion, 1);
        assertEq(r2.policyVersion, 2);
    }
}
