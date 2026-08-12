// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Executor, ISignatureTransfer} from "../contracts/Executor.sol";
import {V3Swapper} from "../contracts/V3Swapper.sol";
import {FeeCollector} from "../contracts/FeeCollector.sol";
import {ExitTriggers} from "../contracts/ExitTriggers.sol";
import {FairValueOracle} from "../contracts/FairValueOracle.sol";
import {IFairValueOracle} from "../contracts/interfaces/IFairValueOracle.sol";
import {PolicyGuard} from "../contracts/PolicyGuard.sol";
import {ReceiptRegistry} from "../contracts/ReceiptRegistry.sol";

contract Token {
    string public name;
    uint8 public immutable decimals;
    mapping(address => uint256) public balanceOf;

    constructor(string memory n, uint8 d) {
        name = n;
        decimals = d;
    }

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function move(address from, address to, uint256 a) external {
        balanceOf[from] -= a;
        balanceOf[to] += a;
    }
}

/// Moves the requested amount from owner to `to`. Signature checking is the
/// real Permit2's job; what matters here is that the pull is inside the same
/// transaction as everything else, so it unwinds when the guard reverts.
contract MockPermit2 is ISignatureTransfer {
    function permitTransferFrom(
        PermitBatchTransferFrom memory permit,
        SignatureTransferDetails[] calldata details,
        address owner,
        bytes calldata
    ) external {
        // Every entry, not just the first: an exit permits one token per leg,
        // and a mock that moved only `permitted[0]` would let a multi-leg exit
        // pass here while failing against the real Permit2.
        for (uint256 i; i < details.length; ++i) {
            Token(permit.permitted[i].token).move(owner, details[i].to, details[i].requestedAmount);
        }
    }
}

/// A Uniswap V3 pool, reduced to what the executor actually depends on: it pays
/// the recipient first and then calls back for payment. That ordering is the
/// whole reason a wallet cannot swap V3 unaided, and the reason the executor
/// needs a callback at all — so the mock has to preserve it rather than settle
/// both sides at once.
///
/// `spendBps` lets the pool charge less than it was offered, which is how the
/// executor's residual-balance assertion stays reachable now that no router
/// holds funds.
contract MockPool {
    Token public immutable cash;
    Token public immutable asset;
    uint256 public priceE8; // cash per whole asset unit
    uint256 public spendBps;

    constructor(Token cash_, Token asset_) {
        cash = cash_;
        asset = asset_;
    }

    function setPrice(uint256 p) external {
        priceE8 = p;
    }

    function setSpendBps(uint256 b) external {
        spendBps = b;
    }

    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1) {
        // Which way round this swap goes is decided by the token being paid in,
        // which the swapper encodes in the callback data. Deriving it from
        // `zeroForOne` instead would tie the mock to how the two mock token
        // addresses happen to sort.
        (address tokenIn,) = abi.decode(data, (address, address));

        uint256 offered = uint256(amountSpecified);
        uint256 spent = (offered * (spendBps == 0 ? 10_000 : spendBps)) / 10_000;

        uint256 out;
        Token paid;
        if (tokenIn == address(cash)) {
            // cash: 6dp, asset: 18dp, price 8dp
            out = (spent * 1e18 * 1e8) / (priceE8 * 1e6);
            asset.mint(recipient, out);
            paid = cash;
        } else {
            out = (spent * priceE8 * 1e6) / (1e18 * 1e8);
            cash.mint(recipient, out);
            paid = asset;
        }

        (amount0, amount1) = zeroForOne
            ? (int256(spent), -int256(out))
            : (-int256(out), int256(spent));

        uint256 held = paid.balanceOf(address(this));
        V3Swapper(msg.sender).uniswapV3SwapCallback(amount0, amount1, data);
        require(paid.balanceOf(address(this)) >= held + spent, "pool was not paid");
    }
}

contract ExecutorTest is Test {
    FairValueOracle oracle;
    ReceiptRegistry receipts;
    PolicyGuard guard;
    Executor executor;
    MockPermit2 permit2;
    MockPool pool;
    FeeCollector fees;

    Token usdg;
    Token wNVDAx;

    address owner = address(0xA11CE);
    address agent = address(0xA6E7);
    address stranger = address(0xBAD);
    address treasury = address(0x7EA5);

    uint256 mandateId;
    uint128 constant NVDA_FV = 223_51000000;
    uint24 constant FEE = 500;
    /// @dev Arbitrary here — what matters is that the executor derives from it.
    address constant V3_FACTORY = address(0xFAC7);

    function setUp() public {
        vm.warp(1_786_368_600);

        usdg = new Token("Global Dollar", 6);
        wNVDAx = new Token("Wrapped NVIDIA xStock", 18);

        oracle = new FairValueOracle(address(this));
        receipts = new ReceiptRegistry(address(this));
        guard = new PolicyGuard(IFairValueOracle(address(oracle)), receipts, address(usdg));
        receipts.setWriter(address(guard), true);

        permit2 = new MockPermit2();

        fees = new FeeCollector(address(this), treasury, 0); // fee off unless a test turns it on
        executor = new Executor(
            permit2,
            V3_FACTORY,
            guard,
            IFairValueOracle(address(oracle)),
            address(usdg),
            fees
        );

        // The executor derives the pool address rather than being handed one, so
        // the mock has to live at the derived address. Immutables ride along in
        // the bytecode; storage does not, hence the setters afterwards.
        MockPool impl = new MockPool(usdg, wNVDAx);
        pool = MockPool(executor.poolFor(address(usdg), address(wNVDAx), FEE));
        vm.etch(address(pool), address(impl).code);
        pool.setPrice(NVDA_FV);

        _publish(NVDA_FV, 5_000_000000);

        address[] memory assets = new address[](1);
        assets[0] = address(wNVDAx);
        vm.prank(owner);
        mandateId = guard.createMandate(agent, address(executor), _policy(), assets);

        usdg.mint(owner, 10_000_000000);
    }

    function _policy() internal pure returns (PolicyGuard.Policy memory) {
        return PolicyGuard.Policy({
            maxWeightBps: 10_000,
            minCashBufferBps: 0,
            maxSlippageBps: 200,
            maxDeviationBps: 200,
            maxGapRisk: 60,
            maxNotionalPerTrade: 5_000_000000,
            maxFillsPerEpoch: 8,
            epochDuration: 1 days,
            minRebalanceInterval: 0,
            enforceWeights: false
        });
    }

    function _publish(uint128 fv, uint128 capacity) internal {
        oracle.publish(
            FairValueOracle.Publication({
                asset: address(wNVDAx),
                fairValueE8: fv,
                confidenceBps: 100,
                basisBps: 0,
                capacityUsdg: capacity,
                gapRisk: 20,
                state: FairValueOracle.MarketState.PRE,
                anchorAt: uint64(block.timestamp),
                hasValue: true
            })
        );
    }

    function _legs(uint128 amountIn) internal view returns (Executor.Leg[] memory legs) {
        legs = new Executor.Leg[](1);
        legs[0] = Executor.Leg({
            asset: address(wNVDAx),
            amountInUsdg: amountIn,
            minAmountOut: 0,
            fee: FEE
        });
    }

    function _permit(uint256 amount)
        internal
        view
        returns (ISignatureTransfer.PermitBatchTransferFrom memory p)
    {
        ISignatureTransfer.TokenPermissions[] memory perms =
            new ISignatureTransfer.TokenPermissions[](1);
        perms[0] = ISignatureTransfer.TokenPermissions({token: address(usdg), amount: amount});
        p = ISignatureTransfer.PermitBatchTransferFrom({
            permitted: perms,
            nonce: 1,
            deadline: block.timestamp + 1 hours
        });
    }

    function _exec(uint128 amountIn) internal returns (uint256) {
        vm.prank(agent);
        return executor.execute(
            mandateId,
            _legs(amountIn),
            _permit(amountIn),
            "",
            keccak256("thesis"),
            keccak256("evidence"),
            "ipfs://cid"
        );
    }

    function _exitLegs(uint128 units) internal view returns (Executor.ExitLeg[] memory legs) {
        legs = new Executor.ExitLeg[](1);
        legs[0] = Executor.ExitLeg({
            asset: address(wNVDAx),
            amountIn: units,
            minAmountOutUsdg: 0,
            fee: FEE
        });
    }

    /// @dev Permits the **asset**, not the settlement currency — the direction
    ///      is the whole difference between this and `_permit`.
    function _exitPermit(uint256 amount)
        internal
        view
        returns (ISignatureTransfer.PermitBatchTransferFrom memory p)
    {
        ISignatureTransfer.TokenPermissions[] memory perms =
            new ISignatureTransfer.TokenPermissions[](1);
        perms[0] = ISignatureTransfer.TokenPermissions({token: address(wNVDAx), amount: amount});
        p = ISignatureTransfer.PermitBatchTransferFrom({
            permitted: perms,
            nonce: 2,
            deadline: block.timestamp + 1 hours
        });
    }

    function _exit(uint128 units) internal returns (uint256) {
        vm.prank(agent);
        return executor.exit(
            mandateId,
            _exitLegs(units),
            _exitPermit(units),
            "",
            keccak256("thesis"),
            keccak256("evidence"),
            "ipfs://cid"
        );
    }

    // -------------------------------------------------------- happy path

    function test_SettlesTheSwapAndWritesTheReceipt() public {
        uint256 receiptId = _exec(1_000_000000); // 1,000 USDG

        // The user holds the asset; the executor holds nothing.
        assertGt(wNVDAx.balanceOf(owner), 0);
        assertEq(usdg.balanceOf(owner), 9_000_000000);
        assertEq(usdg.balanceOf(address(executor)), 0);
        assertEq(wNVDAx.balanceOf(address(executor)), 0);

        (ReceiptRegistry.Receipt memory r, ReceiptRegistry.Fill[] memory f) =
            receipts.get(receiptId);
        assertEq(r.mandateId, mandateId);
        assertEq(f.length, 1);
        assertEq(f[0].amountInUsdg, 1_000_000000);
        assertEq(f[0].amountOut, uint128(wNVDAx.balanceOf(owner)));
        assertEq(f[0].fairValueE8, NVDA_FV, "guard stamps the oracle's own value");
        assertEq(f[0].executionPriceE8, NVDA_FV, "price derived from the measured delta");
    }

    function test_PositionIsOpenedFromTheSettledFill() public {
        _exec(1_000_000000);
        ExitTriggers.Position memory p = guard.getPosition(mandateId, address(wNVDAx));
        assertEq(p.units, uint128(wNVDAx.balanceOf(owner)));
        assertEq(p.costBasisE8, NVDA_FV);
        assertEq(p.entryFairValueE8, NVDA_FV);
    }

    // ------------------------------------------------- the atomicity claim

    /// The property the whole design rests on: when the mandate is violated,
    /// the swap does not stand. Not "is flagged" — does not stand.
    function test_GuardViolationUnwindsThePullAndTheSwap() public {
        vm.prank(owner);
        ExitTriggers.Trigger[] memory ts = new ExitTriggers.Trigger[](1);
        ts[0] = ExitTriggers.Trigger({
            metric: ExitTriggers.Metric.capacityUsdg,
            comparator: ExitTriggers.Comparator.lt,
            threshold: 1_000_000000,
            assets: new address[](0)
        });
        guard.setTriggers(mandateId, ts);

        _publish(NVDA_FV, 400_000000); // capacity below the floor

        uint256 cashBefore = usdg.balanceOf(owner);
        uint256 assetBefore = wNVDAx.balanceOf(owner);

        vm.expectRevert();
        _exec(1_000_000000);

        assertEq(usdg.balanceOf(owner), cashBefore, "no cash left the wallet");
        assertEq(wNVDAx.balanceOf(owner), assetBefore, "no asset was acquired");
        assertEq(receipts.count(), 0, "no receipt was written");
    }

    function test_SlippageBeyondTheMandateUnwindsEverything() public {
        // Router fills 5% worse than fair value; the mandate allows 2%.
        pool.setPrice( (NVDA_FV * 105) / 100);

        uint256 cashBefore = usdg.balanceOf(owner);
        vm.expectRevert();
        _exec(1_000_000000);
        assertEq(usdg.balanceOf(owner), cashBefore);
    }

    // ------------------------------------------------------ access control

    function test_OnlyTheMandatesAgentMayExecute() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Executor.NotAgent.selector, stranger, agent));
        executor.execute(
            mandateId, _legs(100_000000), _permit(100_000000), "", bytes32(0), bytes32(0), ""
        );
    }

    function test_RefusesWhenItIsNotTheMandatesExecutor() public {
        vm.prank(owner);
        guard.setExecutor(mandateId, stranger);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Executor.NotThisExecutor.selector, stranger));
        executor.execute(
            mandateId, _legs(100_000000), _permit(100_000000), "", bytes32(0), bytes32(0), ""
        );
    }

    // -------------------------------------------------------- permit scope

    function test_PermitMustCoverTheTotalAndNameTheSettlementCurrency() public {
        vm.prank(agent);
        vm.expectRevert(Executor.PermitMismatch.selector);
        executor.execute(
            mandateId, _legs(1_000_000000), _permit(999_000000), "", bytes32(0), bytes32(0), ""
        );

        ISignatureTransfer.PermitBatchTransferFrom memory wrong = _permit(1_000_000000);
        wrong.permitted[0].token = address(wNVDAx);
        vm.prank(agent);
        vm.expectRevert(Executor.PermitMismatch.selector);
        executor.execute(mandateId, _legs(1_000_000000), wrong, "", bytes32(0), bytes32(0), "");
    }

    // -------------------------------------------------- non-custodial claim

    function test_RefusesToEndTheCallHoldingAnything() public {
        pool.setSpendBps(9_000); // the pool takes 90%, leaving cash in the executor

        vm.expectRevert(
            abi.encodeWithSelector(Executor.ResidualBalance.selector, address(usdg), 100_000000)
        );
        _exec(1_000_000000);
    }

    // ------------------------------------------ derived, not agent-authored

    function test_PriceAndShortfallComeFromTheMeasuredDelta() public {
        // Fill 1% worse than fair value — inside the mandate, so it settles.
        uint128 worse = uint128((uint256(NVDA_FV) * 101) / 100);
        pool.setPrice( worse);

        uint256 receiptId = _exec(1_000_000000);
        (, ReceiptRegistry.Fill[] memory f) = receipts.get(receiptId);

        assertApproxEqAbs(f[0].executionPriceE8, worse, 1, "price follows what was received");
        assertApproxEqAbs(f[0].slippageBps, 100, 1, "shortfall measured against the oracle");
    }

    // ---------------------------------------------------------------- fees

    /// @dev The fee never reaches a pool, so the receipt must describe the trade
    ///      that happened rather than the amount that was pulled. Folding the fee
    ///      into `amountInUsdg` would make `executionPriceE8` a price no pool
    ///      quoted, and push the guard into rejecting fills for a cost that is
    ///      ours rather than the market's.
    function test_FeeIsTakenOffTheTopAndExcludedFromTheReceipt() public {
        vm.prank(address(this));
        fees.setFeeBps(15);

        uint128 notional = 1_000_000000; // 1,000 USDG
        uint256 fee = fees.feeOn(notional); // 1.5 USDG

        vm.prank(agent);
        uint256 receiptId = executor.execute(
            mandateId, _legs(notional), _permit(notional), "", bytes32(0), bytes32(0), ""
        );

        (, ReceiptRegistry.Fill[] memory fills) = receipts.get(receiptId);
        assertEq(fills[0].amountInUsdg, notional - uint128(fee), "receipt records what was traded");
        assertEq(usdg.balanceOf(address(fees)), fee, "fee landed in the collector");
        assertEq(fills[0].executionPriceE8, NVDA_FV, "price is the market's, not inflated by the fee");
    }

    function test_ZeroFeeLeavesTheFillUntouched() public {
        uint128 notional = 1_000_000000;

        vm.prank(agent);
        uint256 receiptId = executor.execute(
            mandateId, _legs(notional), _permit(notional), "", bytes32(0), bytes32(0), ""
        );

        (, ReceiptRegistry.Fill[] memory fills) = receipts.get(receiptId);
        assertEq(fills[0].amountInUsdg, notional);
        assertEq(usdg.balanceOf(address(fees)), 0);
    }

    /// @dev The executor must still hold nothing afterwards. A fee that left dust
    ///      behind would make this contract custodial by accident.
    function test_ExecutorHoldsNothingAfterAFee() public {
        fees.setFeeBps(15);
        uint128 notional = 1_000_000000;

        vm.prank(agent);
        executor.execute(mandateId, _legs(notional), _permit(notional), "", bytes32(0), bytes32(0), "");

        assertEq(usdg.balanceOf(address(executor)), 0);
        assertEq(wNVDAx.balanceOf(address(executor)), 0);
    }

    // ---------------------------------------------------------------- exits

    function test_ExitSellsThePositionBackAndWritesAnExitFill() public {
        _exec(1_000_000000);

        uint128 held = uint128(wNVDAx.balanceOf(owner));
        uint128 selling = held / 2;
        uint256 cashBefore = usdg.balanceOf(owner);

        uint256 receiptId = _exit(selling);

        assertEq(wNVDAx.balanceOf(owner), held - selling, "the asset left the user");
        assertGt(usdg.balanceOf(owner), cashBefore, "the cash came back");
        assertEq(usdg.balanceOf(address(executor)), 0);
        assertEq(wNVDAx.balanceOf(address(executor)), 0);

        (, ReceiptRegistry.Fill[] memory f) = receipts.get(receiptId);
        assertTrue(f[0].isExit, "recorded as an exit");
        assertEq(f[0].amountOut, selling, "amountOut carries the asset units sold");
        assertEq(
            f[0].amountInUsdg,
            uint128(usdg.balanceOf(owner) - cashBefore),
            "amountInUsdg carries the cash the pool paid"
        );
        // Not exact, and it should not be. An exit divides twice — the pool
        // computes cash from units, then `_priceE8` computes a price back out of
        // both — so the round trip truncates by a few parts per billion. The
        // entry path compares equal only because it divides once. Asserting
        // equality here would be asserting that integer division is lossless.
        assertApproxEqAbs(
            f[0].executionPriceE8, NVDA_FV, 100, "price derived from the measured amounts"
        );
        assertEq(f[0].fairValueE8, NVDA_FV, "guard stamps the oracle's own value");
    }

    function test_ExitDecrementsThePosition() public {
        _exec(1_000_000000);
        uint128 opened = guard.getPosition(mandateId, address(wNVDAx)).units;

        _exit(opened / 2);

        assertEq(
            guard.getPosition(mandateId, address(wNVDAx)).units,
            opened - opened / 2,
            "the position shrank by the units sold"
        );
    }

    function test_ExitingEverythingClosesThePosition() public {
        _exec(1_000_000000);
        uint128 opened = guard.getPosition(mandateId, address(wNVDAx)).units;

        _exit(opened);

        ExitTriggers.Position memory p = guard.getPosition(mandateId, address(wNVDAx));
        assertEq(p.units, 0);
        assertEq(p.costBasisE8, 0, "cost basis is cleared with the last unit");
        assertEq(p.entryFairValueE8, 0);
    }

    /// @dev The direction of this measurement is the trap. Buying badly means
    ///      paying above fair value; selling badly means receiving below it. If
    ///      an exit reused the entry's comparison it would report 0 bps for
    ///      every sale under fair value, and `maxSlippageBps` would never bind on
    ///      an exit while appearing to.
    function test_ExitShortfallIsMeasuredBelowFairValue() public {
        _exec(1_000_000000);
        uint128 held = uint128(wNVDAx.balanceOf(owner));

        pool.setPrice((uint256(NVDA_FV) * 99) / 100); // sell 1% under fair value

        uint256 receiptId = _exit(held / 2);

        (, ReceiptRegistry.Fill[] memory f) = receipts.get(receiptId);
        assertLt(f[0].executionPriceE8, NVDA_FV, "sold below fair value");
        assertApproxEqAbs(f[0].slippageBps, 100, 1, "and the shortfall says so");
    }

    /// The claim `PolicyGuard` makes in its own comment — "a mandate whose
    /// triggers fire but which cannot sell would be worse than having no
    /// triggers at all" — was untestable while the executor had no exit path.
    function test_ExitIsNotBlockedByAFiredTrigger() public {
        _exec(1_000_000000);
        uint128 held = uint128(wNVDAx.balanceOf(owner));

        // capacityUsdg < 10,000 fires: the oracle published 5,000.
        ExitTriggers.Trigger[] memory ts = new ExitTriggers.Trigger[](1);
        ts[0] = ExitTriggers.Trigger({
            metric: ExitTriggers.Metric.capacityUsdg,
            comparator: ExitTriggers.Comparator.lt,
            threshold: int256(10_000_000000),
            assets: new address[](0)
        });
        vm.prank(owner);
        guard.setTriggers(mandateId, ts);

        // Adding to the position is refused…
        vm.prank(agent);
        vm.expectRevert();
        executor.execute(
            mandateId, _legs(100_000000), _permit(100_000000), "", bytes32(0), bytes32(0), ""
        );

        // …and leaving it is not.
        _exit(held / 2);
        assertEq(wNVDAx.balanceOf(owner), held - held / 2, "the exit went through");
    }

    /// @dev The kill switch stops exits too, and that is deliberate rather than
    ///      an oversight of the kind D51 found. A fired *trigger* must never
    ///      block an exit — the mandate is telling you to leave. A tripped
    ///      *breaker* is the owner saying stop everything, and an attacker who
    ///      can only sell is still an attacker selling your position into a
    ///      market of their choosing.
    ///
    ///      What makes that acceptable is custody: the assets are the owner's,
    ///      in the owner's wallet, and any DEX will still trade them. The
    ///      breaker stops this system acting, not the owner.
    function test_CircuitBreakerStopsExitsToo() public {
        _exec(1_000_000000);
        uint128 held = uint128(wNVDAx.balanceOf(owner));

        vm.prank(owner);
        guard.setCircuitBreaker(mandateId, true);

        vm.prank(agent);
        vm.expectRevert(PolicyGuard.Tripped.selector);
        executor.exit(
            mandateId, _exitLegs(held / 2), _exitPermit(held / 2), "", bytes32(0), bytes32(0), ""
        );

        // And releasing it puts the exit back within reach.
        vm.prank(owner);
        guard.setCircuitBreaker(mandateId, false);
        _exit(held / 2);
        assertEq(wNVDAx.balanceOf(owner), held - held / 2);
    }

    // ------------------------------------- the oracle must not trap a position

    /// The defect D51 found and D56 fixes, as the scenario that produced it: the
    /// publisher stops running, the observation ages past `maxAge`, and every
    /// open position becomes unsellable through the system that opened it.
    function test_ExitSurvivesAStaleOracle() public {
        _exec(1_000_000000);
        uint128 held = uint128(wNVDAx.balanceOf(owner));

        vm.warp(block.timestamp + 16 minutes); // maxAge is 15

        // An entry is still refused, and must be: buying against a price nobody
        // can defend is exactly what the oracle exists to prevent.
        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(PolicyGuard.OracleRejected.selector, address(wNVDAx), bytes32("STALE"))
        );
        executor.execute(
            mandateId, _legs(100_000000), _permit(100_000000), "", bytes32(0), bytes32(0), ""
        );

        // Leaving is not.
        uint256 receiptId = _exit(held / 2);
        (, ReceiptRegistry.Fill[] memory f) = receipts.get(receiptId);
        assertTrue(f[0].isExit);
        assertEq(wNVDAx.balanceOf(owner), held - held / 2, "the position could be sold");
    }

    /// The sharper half: a gap-risk trigger fires *because* gap risk is high, and
    /// the same number used to make the guard refuse the exit it was demanding.
    function test_ExitSurvivesGapRiskAboveTheMandateCeiling() public {
        _exec(1_000_000000);
        uint128 held = uint128(wNVDAx.balanceOf(owner));

        // Republish with gap risk above the mandate's ceiling of 60.
        oracle.publish(
            FairValueOracle.Publication({
                asset: address(wNVDAx),
                fairValueE8: NVDA_FV,
                confidenceBps: 100,
                basisBps: 0,
                capacityUsdg: 5_000_000000,
                gapRisk: 90,
                state: FairValueOracle.MarketState.PRE,
                anchorAt: uint64(block.timestamp),
                hasValue: true
            })
        );

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(PolicyGuard.OracleRejected.selector, address(wNVDAx), bytes32("GAP_RISK"))
        );
        executor.execute(
            mandateId, _legs(100_000000), _permit(100_000000), "", bytes32(0), bytes32(0), ""
        );

        uint256 receiptId = _exit(held / 2);
        (, ReceiptRegistry.Fill[] memory f) = receipts.get(receiptId);
        assertEq(f[0].gapRisk, 90, "the receipt still records how bad it was");
        assertTrue(f[0].isExit);
    }

    /// @dev With no defensible fair value there is no shortfall to compute, so
    ///      the guard's slippage ceiling cannot bind and `minAmountOutUsdg` is
    ///      the whole of the price protection. Asserting it rather than leaving
    ///      it implied, because it is the concession the fix makes.
    function test_StaleExitRecordsNoFairValueAndNoShortfall() public {
        _exec(1_000_000000);
        uint128 held = uint128(wNVDAx.balanceOf(owner));

        vm.warp(block.timestamp + 16 minutes);
        pool.setPrice((uint256(NVDA_FV) * 70) / 100); // sell 30% under

        uint256 receiptId = _exit(held / 2);
        (, ReceiptRegistry.Fill[] memory f) = receipts.get(receiptId);
        assertEq(f[0].fairValueE8, 0, "no value the oracle would stand behind");
        assertEq(f[0].slippageBps, 0, "and therefore nothing to measure against");
    }

    function test_ExitFloorStillBindsWhenTheOracleCannotHelp() public {
        _exec(1_000_000000);
        uint128 held = uint128(wNVDAx.balanceOf(owner));

        vm.warp(block.timestamp + 16 minutes);
        pool.setPrice((uint256(NVDA_FV) * 70) / 100);

        Executor.ExitLeg[] memory legs = _exitLegs(held / 2);
        legs[0].minAmountOutUsdg = 1_000_000000; // far above what 30%-under pays

        vm.prank(agent);
        vm.expectRevert();
        executor.exit(
            mandateId, legs, _exitPermit(held / 2), "", bytes32(0), bytes32(0), ""
        );
    }

    function test_DryRunAgreesWithTheRealCallOnAStaleExit() public {
        _exec(1_000_000000);
        uint128 held = uint128(wNVDAx.balanceOf(owner));
        vm.warp(block.timestamp + 16 minutes);

        ReceiptRegistry.Fill[] memory fills = new ReceiptRegistry.Fill[](1);
        fills[0] = ReceiptRegistry.Fill({
            asset: address(wNVDAx),
            isExit: true,
            amountInUsdg: 100_000000,
            amountOut: held / 2,
            executionPriceE8: NVDA_FV,
            slippageBps: 0,
            fairValueE8: 0,
            gapRisk: 0
        });

        (bool ok,,) = guard.dryRun(mandateId, fills);
        assertTrue(ok, "a dryRun that refuses what execute allows is worse than none");

        fills[0].isExit = false;
        (bool okEntry, bytes32 reason,) = guard.dryRun(mandateId, fills);
        assertFalse(okEntry, "entries are still checked");
        assertEq(reason, bytes32("STALE"));
    }

    /// @dev `_checkWeights` prices the portfolio through `oracle.fairValue`,
    ///      which reverts on stale — so leaving it on for an all-exit batch
    ///      would reinstate the trap for any mandate with weights enforced.
    function test_EnforcedWeightsDoNotTrapAnExit() public {
        _exec(1_000_000000);
        uint128 held = uint128(wNVDAx.balanceOf(owner));

        PolicyGuard.Policy memory p = _policy();
        p.enforceWeights = true;
        vm.prank(owner);
        guard.updatePolicy(mandateId, p);

        vm.warp(block.timestamp + 16 minutes);

        _exit(held / 2);
        assertEq(wNVDAx.balanceOf(owner), held - held / 2);
    }

    function test_ExitPermitMustNameTheAssetNotTheCash() public {
        _exec(1_000_000000);
        uint128 held = uint128(wNVDAx.balanceOf(owner));

        // A permit over the settlement currency would let an exit signature
        // move the user's cash instead of the position it names.
        vm.prank(agent);
        vm.expectRevert(Executor.PermitMismatch.selector);
        executor.exit(
            mandateId, _exitLegs(held / 2), _permit(held / 2), "", bytes32(0), bytes32(0), ""
        );
    }

    function test_ExitRefusesToSellTheSettlementCurrency() public {
        Executor.ExitLeg[] memory legs = new Executor.ExitLeg[](1);
        legs[0] = Executor.ExitLeg({
            asset: address(usdg),
            amountIn: 1_000000,
            minAmountOutUsdg: 0,
            fee: FEE
        });

        ISignatureTransfer.TokenPermissions[] memory perms =
            new ISignatureTransfer.TokenPermissions[](1);
        perms[0] = ISignatureTransfer.TokenPermissions({token: address(usdg), amount: 1_000000});

        vm.prank(agent);
        vm.expectRevert(Executor.PermitMismatch.selector);
        executor.exit(
            mandateId,
            legs,
            ISignatureTransfer.PermitBatchTransferFrom({
                permitted: perms,
                nonce: 3,
                deadline: block.timestamp + 1 hours
            }),
            "",
            bytes32(0),
            bytes32(0),
            ""
        );
    }

    function test_OnlyTheMandatesAgentMayExit() public {
        _exec(1_000_000000);
        uint128 held = uint128(wNVDAx.balanceOf(owner));

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Executor.NotAgent.selector, stranger, agent));
        executor.exit(
            mandateId, _exitLegs(held / 2), _exitPermit(held / 2), "", bytes32(0), bytes32(0), ""
        );
    }

    /// @dev An exit routes its proceeds through this contract so the fee can be
    ///      split off them, so there is genuinely a moment when it holds cash.
    ///      That makes the residual assertion matter more here than on entry.
    function test_ExitTakesItsFeeAndStillHoldsNothing() public {
        _exec(1_000_000000);
        fees.setFeeBps(15);

        uint128 held = uint128(wNVDAx.balanceOf(owner));
        uint256 cashBefore = usdg.balanceOf(owner);

        uint256 receiptId = _exit(held / 2);

        (, ReceiptRegistry.Fill[] memory f) = receipts.get(receiptId);
        uint256 fee = fees.feeOn(f[0].amountInUsdg);

        assertGt(fee, 0, "the fee was actually charged");
        assertEq(usdg.balanceOf(address(fees)), fee, "fee landed in the collector");
        assertEq(
            usdg.balanceOf(owner) - cashBefore,
            f[0].amountInUsdg - fee,
            "the user received the proceeds net of the fee"
        );
        assertApproxEqAbs(
            f[0].executionPriceE8,
            NVDA_FV,
            100,
            "the recorded price is the market's, not net of the fee"
        );
        assertEq(usdg.balanceOf(address(executor)), 0);
        assertEq(wNVDAx.balanceOf(address(executor)), 0);
    }
}
