// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {V3Swapper} from "./V3Swapper.sol";

/// @title PoolSwapper
/// @notice Multi-hop exact-input swaps for an EOA, without a router.
///
/// @dev A wallet cannot swap V3 directly — the pool pays out first and calls
///      `uniswapV3SwapCallback` on its counterparty, which an EOA cannot answer.
///      A router normally fills that role; on X Layer the deployed one cannot
///      (D35), so this is the smallest contract that can.
///
///      It is deliberately not a general-purpose router. It holds nothing
///      between transactions: the first hop pulls from the caller, intermediate
///      output lands here only for the duration of the call, and the final hop
///      pays the recipient directly. Anything left behind would be sweepable by
///      the next caller, so `minAmountOut` is checked against what the recipient
///      actually received.
contract PoolSwapper is V3Swapper {
    struct Hop {
        address tokenIn;
        address tokenOut;
        uint24 fee;
    }

    error NoHops();
    error HopsNotContiguous(uint256 index);

    constructor(address factory_) V3Swapper(factory_) {}

    /// @param hops Ordered, each hop's output feeding the next hop's input.
    /// @param amountIn Amount of `hops[0].tokenIn` to spend. Caller must have
    ///        approved this contract for at least this much.
    /// @param minAmountOut Floor on the final output, enforced here rather than
    ///        left to the pool's price limit.
    function swapExactInput(
        Hop[] calldata hops,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external returns (uint256 amountOut) {
        if (hops.length == 0) revert NoHops();

        amountOut = amountIn;
        for (uint256 i; i < hops.length; ++i) {
            if (i > 0 && hops[i].tokenIn != hops[i - 1].tokenOut) revert HopsNotContiguous(i);

            bool last = i == hops.length - 1;
            amountOut = _swapHop(
                hops[i].tokenIn,
                hops[i].tokenOut,
                hops[i].fee,
                amountOut,
                last ? recipient : address(this),
                // Only the first hop is funded by the caller; every later hop
                // spends what the previous one delivered here.
                i == 0 ? msg.sender : address(this)
            );
        }

        if (amountOut < minAmountOut) revert InsufficientOutput(amountOut, minAmountOut);
    }
}
