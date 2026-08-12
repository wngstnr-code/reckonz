// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ExitTriggers} from "./ExitTriggers.sol";
import {FeeCollector} from "./FeeCollector.sol";
import {V3Swapper} from "./V3Swapper.sol";
import {IFairValueOracle} from "./interfaces/IFairValueOracle.sol";
import {PolicyGuard} from "./PolicyGuard.sol";
import {ReceiptRegistry} from "./ReceiptRegistry.sol";

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function decimals() external view returns (uint8);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface ISignatureTransfer {
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    struct PermitBatchTransferFrom {
        TokenPermissions[] permitted;
        uint256 nonce;
        uint256 deadline;
    }

    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    function permitTransferFrom(
        PermitBatchTransferFrom memory permit,
        SignatureTransferDetails[] calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;
}

/// @title Executor
/// @notice Pulls the user's settlement currency for exactly one batch of swaps,
///         routes them, delivers the output straight back to the user, and then
///         submits the realised fills to PolicyGuard — all in one transaction.
///
/// @dev Two properties make this contract worth having, and both come from
///      doing everything in a single transaction:
///
///      1. **The guard becomes binding.** `validateAndRecord` runs last. If the
///         mandate is violated it reverts, and the Permit2 pull and every swap
///         revert with it. There is no state in which a rule was broken and the
///         trade stood.
///
///      2. **The receipt cannot be authored by the agent.** Prices and shortfall
///         are derived here from measured balance deltas and the oracle's own
///         fair value. The agent supplies routing, never numbers.
///
///      Non-custodial: funds are pulled per execution against a signed,
///      amount-bounded, expiring Permit2 authorisation — never a standing
///      allowance — and the contract asserts it holds nothing when it returns.
contract Executor is V3Swapper {
    ISignatureTransfer public immutable permit2;
    /// @dev Zero disables fees entirely. Immutable so the fee path cannot be
    ///      switched on after users have read the contract they are trusting.
    FeeCollector public immutable feeCollector;
    PolicyGuard public immutable guard;
    IFairValueOracle public immutable oracle;
    address public immutable cash;
    uint8 private immutable cashDecimals;

    struct Leg {
        address asset;
        /// @dev settlement currency to spend on this leg
        uint128 amountInUsdg;
        /// @dev floor on this leg's output; the guard applies the real limits after
        uint256 minAmountOut;
        /// @dev fee tier of the cash/asset pool. Was a Uniswap path when this
        ///      contract went through the Universal Router; the pool is now
        ///      derived from the pair and this tier, so there is no encoded
        ///      route left to get wrong.
        uint24 fee;
    }

    /// @dev One position being sold back to the settlement currency.
    ///
    ///      Mirror of `Leg` with the direction reversed, and the reversal is not
    ///      cosmetic: here the *asset* is what gets pulled and what the amount is
    ///      denominated in, so `PermitBatchTransferFrom` must permit the asset,
    ///      never `cash`. A single struct with a flag would have made that
    ///      distinction a runtime condition inside `_pull`, where getting it
    ///      wrong means a signature intended to sell one token authorises
    ///      spending another.
    struct ExitLeg {
        address asset;
        /// @dev asset units to sell, in the asset's own decimals
        uint128 amountIn;
        /// @dev floor on settlement currency out for this leg, before the fee
        uint256 minAmountOutUsdg;
        /// @dev fee tier of the cash/asset pool
        uint24 fee;
    }

    error NotAgent(address caller, address agent);
    error NotThisExecutor(address configured);
    error NoLegs();
    error PermitMismatch();
    error NothingReceived(address asset);
    error ResidualBalance(address token, uint256 amount);
    error AmountOverflow(address asset, uint256 amount);

    event Executed(uint256 indexed mandateId, uint256 indexed receiptId, uint256 legs);

    constructor(
        ISignatureTransfer permit2_,
        address factory_,
        PolicyGuard guard_,
        IFairValueOracle oracle_,
        address cash_,
        FeeCollector feeCollector_
    ) V3Swapper(factory_) {
        permit2 = permit2_;
        feeCollector = feeCollector_;
        guard = guard_;
        oracle = oracle_;
        cash = cash_;
        cashDecimals = IERC20(cash_).decimals();
    }

    /// @param permit Permit2 authorisation signed by the mandate owner. It must
    ///        permit exactly the settlement currency, and its amount caps what
    ///        this call can ever pull — the user's real spending limit.
    function execute(
        uint256 mandateId,
        Leg[] calldata legs,
        ISignatureTransfer.PermitBatchTransferFrom calldata permit,
        bytes calldata signature,
        bytes32 thesisHash,
        bytes32 evidenceHash,
        string calldata evidenceCID
    ) external returns (uint256 receiptId) {
        if (legs.length == 0) revert NoLegs();

        PolicyGuard.Mandate memory m = guard.getMandate(mandateId);
        if (msg.sender != m.agent) revert NotAgent(msg.sender, m.agent);
        if (m.executor != address(this)) revert NotThisExecutor(m.executor);

        uint256 total = _pull(permit, signature, m.owner, legs);

        ReceiptRegistry.Fill[] memory fills = new ReceiptRegistry.Fill[](legs.length);
        for (uint256 i; i < legs.length; ++i) {
            fills[i] = _swap(legs[i], m.owner, mandateId);
        }

        // Nothing may rest here. Asserted rather than assumed: a residual
        // balance would mean this contract had become custodial.
        uint256 left = IERC20(cash).balanceOf(address(this));
        if (left != 0) revert ResidualBalance(cash, left);
        for (uint256 i; i < legs.length; ++i) {
            uint256 stuck = IERC20(legs[i].asset).balanceOf(address(this));
            if (stuck != 0) revert ResidualBalance(legs[i].asset, stuck);
        }

        // Last: a violation here reverts the pull and every swap above.
        receiptId =
            guard.validateAndRecord(mandateId, fills, thesisHash, evidenceHash, evidenceCID);

        emit Executed(mandateId, receiptId, legs.length);
        require(total > 0, "no notional");
    }

    /// @notice Sell positions back to the settlement currency.
    ///
    /// @dev The mirror of `execute`, and the half that was missing: `Leg` only
    ///      ever describes cash going in, `_swap` hardcodes `isExit: false`, and
    ///      `_pull` refuses any permitted token that is not `cash`. So until
    ///      this function existed the system could *detect* an exit condition —
    ///      `ExitTriggers` evaluates it, `PolicyGuard.firedTriggers` reports it —
    ///      and could not act on one. A guard that can only ever say "do not buy
    ///      more" is not risk tooling.
    ///
    ///      `PolicyGuard` needed no change: `validateAndRecord` already takes
    ///      `isExit`, already skips the trigger check for exits on the grounds
    ///      that a mandate which cannot sell is worse than one with no triggers,
    ///      and `ExitTriggers.applyFill` already decrements the position. Only
    ///      the executor was missing.
    ///
    /// @param permit Permit2 authorisation signed by the mandate owner, over the
    ///        **assets being sold** — one permitted token per leg, in the same
    ///        order. Its amounts cap what this call can ever pull.
    function exit(
        uint256 mandateId,
        ExitLeg[] calldata legs,
        ISignatureTransfer.PermitBatchTransferFrom calldata permit,
        bytes calldata signature,
        bytes32 thesisHash,
        bytes32 evidenceHash,
        string calldata evidenceCID
    ) external returns (uint256 receiptId) {
        if (legs.length == 0) revert NoLegs();

        PolicyGuard.Mandate memory m = guard.getMandate(mandateId);
        if (msg.sender != m.agent) revert NotAgent(msg.sender, m.agent);
        if (m.executor != address(this)) revert NotThisExecutor(m.executor);

        _pullAssets(permit, signature, m.owner, legs);

        ReceiptRegistry.Fill[] memory fills = new ReceiptRegistry.Fill[](legs.length);
        for (uint256 i; i < legs.length; ++i) {
            fills[i] = _exitSwap(legs[i], m.owner, mandateId);
        }

        // Same assertion as `execute`, and it earns its place twice over here:
        // an exit routes the proceeds through this contract in order to split
        // the fee off them, so there is a moment when it does hold cash.
        uint256 left = IERC20(cash).balanceOf(address(this));
        if (left != 0) revert ResidualBalance(cash, left);
        for (uint256 i; i < legs.length; ++i) {
            uint256 stuck = IERC20(legs[i].asset).balanceOf(address(this));
            if (stuck != 0) revert ResidualBalance(legs[i].asset, stuck);
        }

        // Last, so a violation reverts the pull and every swap above.
        receiptId =
            guard.validateAndRecord(mandateId, fills, thesisHash, evidenceHash, evidenceCID);

        emit Executed(mandateId, receiptId, legs.length);
    }

    // ---------------------------------------------------------------- internal

    function _pull(
        ISignatureTransfer.PermitBatchTransferFrom calldata permit,
        bytes calldata signature,
        address owner,
        Leg[] calldata legs
    ) internal returns (uint256 total) {
        for (uint256 i; i < legs.length; ++i) {
            total += legs[i].amountInUsdg;
        }

        // One permitted token, and it must be the settlement currency. Anything
        // else would let a signature intended for this flow move another asset.
        if (permit.permitted.length != 1) revert PermitMismatch();
        if (permit.permitted[0].token != cash) revert PermitMismatch();
        if (permit.permitted[0].amount < total) revert PermitMismatch();

        ISignatureTransfer.SignatureTransferDetails[] memory details =
            new ISignatureTransfer.SignatureTransferDetails[](1);
        details[0] = ISignatureTransfer.SignatureTransferDetails({
            to: address(this),
            requestedAmount: total
        });

        permit2.permitTransferFrom(permit, details, owner, signature);
    }

    /// @dev Pulls the assets being sold, one permitted token per leg.
    ///
    ///      Deliberately index-for-index with `legs` rather than summed per
    ///      token: a permit is a statement about what may be moved, and matching
    ///      it positionally keeps that statement readable in the wallet the user
    ///      is signing in. Two legs in the same asset simply carry two entries.
    function _pullAssets(
        ISignatureTransfer.PermitBatchTransferFrom calldata permit,
        bytes calldata signature,
        address owner,
        ExitLeg[] calldata legs
    ) internal {
        if (permit.permitted.length != legs.length) revert PermitMismatch();

        ISignatureTransfer.SignatureTransferDetails[] memory details =
            new ISignatureTransfer.SignatureTransferDetails[](legs.length);

        for (uint256 i; i < legs.length; ++i) {
            // The settlement currency is never a position. Allowing it here
            // would let an exit signature move the user's cash.
            if (legs[i].asset == cash) revert PermitMismatch();
            if (permit.permitted[i].token != legs[i].asset) revert PermitMismatch();
            if (permit.permitted[i].amount < legs[i].amountIn) revert PermitMismatch();

            details[i] = ISignatureTransfer.SignatureTransferDetails({
                to: address(this),
                requestedAmount: legs[i].amountIn
            });
        }

        permit2.permitTransferFrom(permit, details, owner, signature);
    }

    /// @dev One position sold. The proceeds land here rather than with the owner
    ///      so the fee can be taken off them before the remainder is forwarded —
    ///      the entry path takes its fee before the swap instead, because there
    ///      the cash is what arrives.
    function _exitSwap(ExitLeg calldata leg, address owner, uint256 mandateId)
        internal
        returns (ReceiptRegistry.Fill memory fill)
    {
        uint256 received =
            _swapHop(leg.asset, cash, leg.fee, leg.amountIn, address(this), address(this));

        if (received == 0) revert NothingReceived(leg.asset);
        if (received < leg.minAmountOutUsdg) {
            revert InsufficientOutput(received, leg.minAmountOutUsdg);
        }
        if (received > type(uint128).max) revert AmountOverflow(cash, received);

        // The receipt records what the market paid — gross, before our fee —
        // for the same reason the entry path records the net amount that
        // actually reached a pool: `executionPriceE8` must describe a price a
        // pool really quoted, or the guard's slippage check starts rejecting
        // fills for a cost that is ours rather than the market's.
        uint128 proceeds = uint128(received);
        if (address(feeCollector) != address(0)) {
            uint256 fee = feeCollector.feeOn(received);
            if (fee > 0) {
                IERC20(cash).transfer(address(feeCollector), fee);
                feeCollector.record(mandateId, leg.asset, received, fee);
                proceeds = uint128(received - fee);
            }
        }
        IERC20(cash).transfer(owner, proceeds);

        uint128 priceE8 = _priceE8(received, leg.amountIn, IERC20(leg.asset).decimals());

        fill = ReceiptRegistry.Fill({
            asset: leg.asset,
            isExit: true,
            // On an exit these two fields keep their names and swap their roles:
            // the cash is what comes out, and `amountOut` carries the asset units
            // sold — which is what `ExitTriggers.applyFill` subtracts from the
            // position. Writing the cash amount here would decrement the
            // position by a number denominated in the wrong token.
            amountInUsdg: uint128(received),
            amountOut: leg.amountIn,
            executionPriceE8: priceE8,
            slippageBps: _exitShortfallBps(leg.asset, priceE8),
            fairValueE8: 0, // stamped by the guard from the oracle
            gapRisk: 0
        });
    }

    /// @dev Output is measured as the owner's balance delta, so the recorded
    ///      amount is what the user actually received — not what a pool
    ///      returned, and not what the agent said.
    function _swap(Leg calldata leg, address owner, uint256 mandateId)
        internal
        returns (ReceiptRegistry.Fill memory fill)
    {
        uint256 before = IERC20(leg.asset).balanceOf(owner);

        // The execution fee, taken off the top before anything reaches a pool.
        //
        // The receipt records what was actually traded, not what was pulled: the
        // fee never enters the market, so folding it into `amountInUsdg` would
        // make `executionPriceE8` describe a price no pool quoted and push the
        // guard's slippage check into rejecting fills for a cost that is ours,
        // not the market's. The fee is a separate fact, and `FeeTaken` carries
        // it with the mandate it came from.
        uint128 swapAmount = leg.amountInUsdg;
        if (address(feeCollector) != address(0)) {
            uint256 fee = feeCollector.feeOn(leg.amountInUsdg);
            if (fee > 0) {
                swapAmount = leg.amountInUsdg - uint128(fee);
                IERC20(cash).transfer(address(feeCollector), fee);
                feeCollector.record(mandateId, leg.asset, leg.amountInUsdg, fee);
            }
        }

        // Straight to the pool. This used to fund the Universal Router and hand
        // it a command; that router derives pool addresses from the canonical
        // v3 factory, X Layer's is not canonical, and every swap through it
        // reverts with no data (D35). Deriving the pool here from the factory we
        // verified removes the dependency rather than repairing it — and with it
        // the window where this contract's money sat in a contract anyone could
        // sweep.
        _swapHop(cash, leg.asset, leg.fee, swapAmount, owner, address(this));

        uint256 received = IERC20(leg.asset).balanceOf(owner) - before;
        if (received == 0) revert NothingReceived(leg.asset);
        // The pool enforces no floor of its own on an exact-input swap, so the
        // leg's minimum is checked here or nowhere.
        if (received < leg.minAmountOut) revert InsufficientOutput(received, leg.minAmountOut);
        // Solidity does not check explicit casts. A truncated amount here would
        // be written into the receipt and into the position the exit triggers
        // are measured against — wrong numbers that look deliberate.
        if (received > type(uint128).max) revert AmountOverflow(leg.asset, received);

        uint128 priceE8 = _priceE8(swapAmount, received, IERC20(leg.asset).decimals());

        fill = ReceiptRegistry.Fill({
            asset: leg.asset,
            isExit: false,
            amountInUsdg: swapAmount,
            amountOut: uint128(received),
            executionPriceE8: priceE8,
            slippageBps: _shortfallBps(leg.asset, priceE8),
            fairValueE8: 0, // stamped by the guard from the oracle
            gapRisk: 0
        });
    }

    /// @dev Settlement currency paid per whole asset unit, 8 decimals.
    function _priceE8(uint256 amountIn, uint256 received, uint8 assetDecimals)
        internal
        view
        returns (uint128)
    {
        // price = (amountIn / 10^cashDec) / (received / 10^assetDec), scaled to 8dp
        uint256 numerator = amountIn * (10 ** assetDecimals) * 1e8;
        uint256 denominator = received * (10 ** cashDecimals);
        return uint128(numerator / denominator);
    }

    /// @dev Realised shortfall against the oracle's fair value at execution, in
    ///      basis points, zero when the fill landed at or better than fair value.
    ///
    ///      Deliberately not measured against a quote the agent supplies. Every
    ///      number in a receipt has to be derived from something the agent
    ///      cannot author, or the track record the product sells is worthless.
    ///      Distinct from the mandate's `maxDeviationBps`, which is widened by
    ///      the oracle's own confidence band; this figure is not.
    ///      `try` rather than a bare call: `observation` reverts on stale, and a
    ///      raw `Stale()` from inside the executor is a worse refusal than the
    ///      guard's own `OracleRejected(asset, "STALE")` — the entry is rejected
    ///      either way, but only one of the two says which rule stopped it. The
    ///      guard still runs `checkExecution` after this, so returning 0 here
    ///      cannot let a stale entry through.
    function _shortfallBps(address asset, uint128 priceE8) internal view returns (uint16) {
        IFairValueOracle.Observation memory o;
        try oracle.observation(asset) returns (IFairValueOracle.Observation memory fresh) {
            o = fresh;
        } catch {
            return 0;
        }
        if (!o.hasValue || o.fairValueE8 == 0) return 0;
        if (priceE8 <= o.fairValueE8) return 0;
        uint256 bps = ((uint256(priceE8) - o.fairValueE8) * 10_000) / o.fairValueE8;
        return bps > type(uint16).max ? type(uint16).max : uint16(bps);
    }

    /// @dev The same measurement for an exit, and the comparison is **inverted**.
    ///
    ///      Buying badly means paying *above* fair value; selling badly means
    ///      receiving *below* it. Reusing `_shortfallBps` for exits would have
    ///      returned zero for every sale at any price beneath fair value — so a
    ///      position dumped 30% under would have recorded 0 bps of slippage, and
    ///      `PolicyGuard`'s `maxSlippageBps` check would never once have bound on
    ///      an exit. The guard would have looked like it was working.
    ///      `peek` rather than `observation`, because `observation` reverts on
    ///      stale — and an exit that cannot even measure its own shortfall
    ///      because the publisher stopped running is an exit that cannot happen
    ///      (D51, D56). With no defensible value there is no shortfall anyone
    ///      can compute, so this reports 0 and the leg's `minAmountOutUsdg`
    ///      becomes the only price protection. That is stated in `PolicyGuard`
    ///      too, because it is the trade the whole change rests on.
    function _exitShortfallBps(address asset, uint128 priceE8) internal view returns (uint16) {
        // `try observation` and not `peek`. `peek` hands back a stale value with
        // `hasValue` still true, so measuring against it computes a shortfall
        // from a price the oracle refuses to stand behind — and if the value is
        // stale *because the market moved*, that shortfall is enormous and
        // false, and `maxSlippageBps` blocks the exit. That is the D51 trap
        // rebuilt one layer down, which is exactly how it was found here.
        IFairValueOracle.Observation memory o;
        try oracle.observation(asset) returns (IFairValueOracle.Observation memory fresh) {
            o = fresh;
        } catch {
            return 0;
        }
        if (!o.hasValue || o.fairValueE8 == 0) return 0;
        if (priceE8 >= o.fairValueE8) return 0;
        uint256 bps = ((uint256(o.fairValueE8) - priceE8) * 10_000) / o.fairValueE8;
        return bps > type(uint16).max ? type(uint16).max : uint16(bps);
    }
}
