// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Executor, ISignatureTransfer, IUniversalRouter} from "../contracts/Executor.sol";
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
        Token(permit.permitted[0].token).move(owner, details[0].to, details[0].requestedAmount);
    }
}

/// Swaps at a settable price and can be told to under-spend, so the executor's
/// residual-balance assertion is reachable in a test.
contract MockRouter is IUniversalRouter {
    Token public immutable cash;
    mapping(address => uint256) public priceE8; // cash per whole asset unit
    uint256 public spendBps = 10_000;

    constructor(Token cash_) {
        cash = cash_;
    }

    function setPrice(address asset, uint256 p) external {
        priceE8[asset] = p;
    }

    function setSpendBps(uint256 b) external {
        spendBps = b;
    }

    function execute(bytes calldata, bytes[] calldata inputs, uint256) external payable {
        (address recipient, uint256 amountIn,, bytes memory path,) =
            abi.decode(inputs[0], (address, uint256, uint256, bytes, bool));
        address asset = address(bytes20(path));

        uint256 spent = (amountIn * spendBps) / 10_000;
        // cash: 6dp, asset: 18dp, price 8dp
        uint256 out = (spent * 1e18 * 1e8) / (priceE8[asset] * 1e6);
        cash.transfer(address(0xdead), spent);
        Token(asset).mint(recipient, out);
    }
}

contract ExecutorTest is Test {
    FairValueOracle oracle;
    ReceiptRegistry receipts;
    PolicyGuard guard;
    Executor executor;
    MockPermit2 permit2;
    MockRouter router;

    Token usdg;
    Token wNVDAx;

    address owner = address(0xA11CE);
    address agent = address(0xA6E7);
    address stranger = address(0xBAD);

    uint256 mandateId;
    uint128 constant NVDA_FV = 223_51000000;

    function setUp() public {
        vm.warp(1_786_368_600);

        usdg = new Token("Global Dollar", 6);
        wNVDAx = new Token("Wrapped NVIDIA xStock", 18);

        oracle = new FairValueOracle(address(this));
        receipts = new ReceiptRegistry(address(this));
        guard = new PolicyGuard(IFairValueOracle(address(oracle)), receipts, address(usdg));
        receipts.setWriter(address(guard), true);

        permit2 = new MockPermit2();
        router = new MockRouter(usdg);
        router.setPrice(address(wNVDAx), NVDA_FV);

        executor = new Executor(
            permit2,
            IUniversalRouter(address(router)),
            guard,
            IFairValueOracle(address(oracle)),
            address(usdg)
        );

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
            path: abi.encodePacked(address(wNVDAx))
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
        router.setPrice(address(wNVDAx), (NVDA_FV * 105) / 100);

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
        router.setSpendBps(9_000); // router leaves 10% behind

        vm.expectRevert(
            abi.encodeWithSelector(Executor.ResidualBalance.selector, address(usdg), 100_000000)
        );
        _exec(1_000_000000);
    }

    // ------------------------------------------ derived, not agent-authored

    function test_PriceAndShortfallComeFromTheMeasuredDelta() public {
        // Fill 1% worse than fair value — inside the mandate, so it settles.
        uint128 worse = uint128((uint256(NVDA_FV) * 101) / 100);
        router.setPrice(address(wNVDAx), worse);

        uint256 receiptId = _exec(1_000_000000);
        (, ReceiptRegistry.Fill[] memory f) = receipts.get(receiptId);

        assertApproxEqAbs(f[0].executionPriceE8, worse, 1, "price follows what was received");
        assertApproxEqAbs(f[0].slippageBps, 100, 1, "shortfall measured against the oracle");
    }
}
