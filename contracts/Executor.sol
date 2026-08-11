// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ExitTriggers} from "./ExitTriggers.sol";
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
        address cash_
    ) V3Swapper(factory_) {
        permit2 = permit2_;
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
            fills[i] = _swap(legs[i], m.owner);
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

    /// @dev Output is measured as the owner's balance delta, so the recorded
    ///      amount is what the user actually received — not what a pool
    ///      returned, and not what the agent said.
    function _swap(Leg calldata leg, address owner)
        internal
        returns (ReceiptRegistry.Fill memory fill)
    {
        uint256 before = IERC20(leg.asset).balanceOf(owner);

        // Straight to the pool. This used to fund the Universal Router and hand
        // it a command; that router derives pool addresses from the canonical
        // v3 factory, X Layer's is not canonical, and every swap through it
        // reverts with no data (D35). Deriving the pool here from the factory we
        // verified removes the dependency rather than repairing it — and with it
        // the window where this contract's money sat in a contract anyone could
        // sweep.
        _swapHop(cash, leg.asset, leg.fee, leg.amountInUsdg, owner, address(this));

        uint256 received = IERC20(leg.asset).balanceOf(owner) - before;
        if (received == 0) revert NothingReceived(leg.asset);
        // The pool enforces no floor of its own on an exact-input swap, so the
        // leg's minimum is checked here or nowhere.
        if (received < leg.minAmountOut) revert InsufficientOutput(received, leg.minAmountOut);
        // Solidity does not check explicit casts. A truncated amount here would
        // be written into the receipt and into the position the exit triggers
        // are measured against — wrong numbers that look deliberate.
        if (received > type(uint128).max) revert AmountOverflow(leg.asset, received);

        uint128 priceE8 = _priceE8(leg.amountInUsdg, received, IERC20(leg.asset).decimals());

        fill = ReceiptRegistry.Fill({
            asset: leg.asset,
            isExit: false,
            amountInUsdg: leg.amountInUsdg,
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
    function _shortfallBps(address asset, uint128 priceE8) internal view returns (uint16) {
        IFairValueOracle.Observation memory o = oracle.observation(asset);
        if (!o.hasValue || o.fairValueE8 == 0) return 0;
        if (priceE8 <= o.fairValueE8) return 0;
        uint256 bps = ((uint256(priceE8) - o.fairValueE8) * 10_000) / o.fairValueE8;
        return bps > type(uint16).max ? type(uint16).max : uint16(bps);
    }
}
