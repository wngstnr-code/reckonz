// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Fees {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title FeeCollector
/// @notice Where the execution fee lands, and the ceiling on what it can be.
///
/// @dev The revenue model in `02-product.md` is "10–20 bps on notional routed".
///      Until now that was a sentence in a document. This makes it a number
///      anyone can read off the chain, which is a different kind of claim.
///
///      Deliberately not a router, an escrow, or an accounting system. It holds
///      fees and nothing else — never user funds in transit, never a position.
///      `Executor` sends the fee and keeps going; if this contract reverted it
///      could hold a fill hostage, so it is written so that it cannot.
///
///      **`MAX_FEE_BPS` is a constant, not a setting.** An admin who can raise
///      the fee without limit is an admin who can take the whole trade, and a
///      user reading this contract should be able to bound their worst case from
///      the source rather than from our intentions. 50 bps is already more than
///      twice the top of the published range.
contract FeeCollector {
    /// @dev Hard ceiling. Not settable, by design.
    uint16 public constant MAX_FEE_BPS = 50;

    address public admin;
    address public treasury;
    uint16 public feeBps;

    /// @dev The fee for one leg, tied to the mandate that produced it. Indexed on
    ///      mandate so a track record can be assembled from logs alone.
    event FeeTaken(
        uint256 indexed mandateId,
        address indexed asset,
        uint256 notionalUsdg,
        uint256 feeUsdg
    );
    event FeeBpsSet(uint16 feeBps);
    event TreasurySet(address indexed treasury);
    event AdminSet(address indexed admin);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    error NotAdmin();
    error FeeTooHigh(uint16 requested, uint16 maximum);
    error ZeroAddress();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor(address admin_, address treasury_, uint16 feeBps_) {
        if (admin_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh(feeBps_, MAX_FEE_BPS);
        admin = admin_;
        treasury = treasury_;
        feeBps = feeBps_;
        emit AdminSet(admin_);
        emit TreasurySet(treasury_);
        emit FeeBpsSet(feeBps_);
    }

    // --------------------------------------------------------------- admin

    function setFeeBps(uint16 newFeeBps) external onlyAdmin {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh(newFeeBps, MAX_FEE_BPS);
        feeBps = newFeeBps;
        emit FeeBpsSet(newFeeBps);
    }

    function setTreasury(address newTreasury) external onlyAdmin {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasurySet(newTreasury);
    }

    function setAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        admin = newAdmin;
        emit AdminSet(newAdmin);
    }

    /// @notice Sweep collected fees to the treasury. Callable by anyone: the
    ///         destination is fixed, so there is nothing to gain by front-running
    ///         it and no reason to gate it.
    function withdraw(address token) external returns (uint256 amount) {
        amount = IERC20Fees(token).balanceOf(address(this));
        if (amount == 0) return 0;
        IERC20Fees(token).transfer(treasury, amount);
        emit Withdrawn(token, treasury, amount);
    }

    // ----------------------------------------------------------- execution

    /// @notice The fee on a notional, at the current rate.
    /// @dev Rounds down, so a dust trade pays nothing rather than paying a
    ///      rounded-up minimum. A fee that exceeds what it is charged on would
    ///      be indistinguishable from theft at small sizes.
    function feeOn(uint256 notionalUsdg) public view returns (uint256) {
        return (notionalUsdg * feeBps) / 10_000;
    }

    /// @notice Record a fee that has already been transferred here.
    /// @dev Emitting only. It cannot revert on the executor's behalf, cannot
    ///      pull funds, and does not trust the caller with anything — a false
    ///      event costs its author gas and buys them nothing, while a `require`
    ///      here could block a legitimate fill.
    function record(uint256 mandateId, address asset, uint256 notionalUsdg, uint256 feeUsdg)
        external
    {
        emit FeeTaken(mandateId, asset, notionalUsdg, feeUsdg);
    }
}
