// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IUniswapV3Pool {
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
}

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title V3Swapper
/// @notice Exact-input Uniswap V3 swaps by calling the pool directly.
///
/// @dev This exists because the Universal Router on X Layer **cannot swap here
///      at all**. Uniswap's router does not look a pool up, it derives the
///      address — CREATE2 from a factory fixed in its own bytecode. The router
///      deployed at 0x66a9… carries the *canonical* factory, X Layer's factory
///      is not canonical, so every swap resolves to an address with no code and
///      reverts with no data. See D35.
///
///      Deriving the address here instead is not a workaround, it is strictly
///      better: the factory is a constructor argument we verified against live
///      pools, and there is no external router that can be misconfigured,
///      upgraded, or drained between transactions.
///
///      The init code hash is the standard Uniswap V3 one. That is not assumed —
///      it was confirmed by deriving a live X Layer pool address both ways: with
///      X Layer's factory it reproduces the real pool exactly, with the canonical
///      factory it produces an address with no code.
abstract contract V3Swapper {
    /// @dev keccak256 of UniswapV3Pool's creation code. Confirmed against live
    ///      X Layer pools rather than recalled (D5).
    bytes32 internal constant POOL_INIT_CODE_HASH =
        0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54;

    /// @dev Uniswap's own bounds. Passing the extreme means "no price limit",
    ///      which is correct for exact-input: `minAmountOut` is the protection,
    ///      and a price limit would silently fill less than asked instead.
    uint160 internal constant MIN_SQRT_RATIO_PLUS_ONE = 4295128740;
    uint160 internal constant MAX_SQRT_RATIO_MINUS_ONE =
        1461446703485210103287273052203988822378723970341;

    address public immutable factory;

    error PoolHasNoCode(address pool);
    error UnexpectedCallback(address caller);
    error InsufficientOutput(uint256 received, uint256 minimum);
    error ZeroAmountIn();

    /// @dev Set for the duration of one swap so the callback can tell a genuine
    ///      pool call from an arbitrary one. Zero outside a swap, which means an
    ///      unsolicited callback is rejected before it can move anything.
    address private expectedPool;

    constructor(address factory_) {
        factory = factory_;
    }

    /// @notice The pool address for a pair and fee tier, derived rather than looked up.
    function poolFor(address tokenA, address tokenB, uint24 fee) public view returns (address) {
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex"ff",
                            factory,
                            keccak256(abi.encode(token0, token1, fee)),
                            POOL_INIT_CODE_HASH
                        )
                    )
                )
            )
        );
    }

    /// @dev One hop. `payer` funds it from this contract's balance when it is
    ///      `address(this)`, otherwise via transferFrom — the caller must have
    ///      approved this contract.
    function _swapHop(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        address recipient,
        address payer
    ) internal returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmountIn();

        address pool = poolFor(tokenIn, tokenOut, fee);
        // A derived address that holds no code is the failure mode that made the
        // router useless. Say so, rather than reverting with nothing to read.
        if (pool.code.length == 0) revert PoolHasNoCode(pool);

        bool zeroForOne = tokenIn < tokenOut;

        expectedPool = pool;
        (int256 amount0, int256 amount1) = IUniswapV3Pool(pool).swap(
            recipient,
            zeroForOne,
            int256(amountIn),
            zeroForOne ? MIN_SQRT_RATIO_PLUS_ONE : MAX_SQRT_RATIO_MINUS_ONE,
            abi.encode(tokenIn, payer)
        );
        expectedPool = address(0);

        // The pool reports what it sent as a negative delta.
        amountOut = uint256(-(zeroForOne ? amount1 : amount0));
    }

    /// @notice Pool callback. Pays for the swap the pool has just performed.
    /// @dev The pool is trusted only because we derived its address and were
    ///      mid-swap with it. Both checks matter: the address check alone would
    ///      let a real pool call us unprompted and drain whatever we hold.
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data)
        external
    {
        if (msg.sender != expectedPool || expectedPool == address(0)) {
            revert UnexpectedCallback(msg.sender);
        }

        (address tokenIn, address payer) = abi.decode(data, (address, address));
        uint256 owed = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);

        if (payer == address(this)) {
            IERC20Minimal(tokenIn).transfer(msg.sender, owed);
        } else {
            IERC20Minimal(tokenIn).transferFrom(payer, msg.sender, owed);
        }
    }
}
