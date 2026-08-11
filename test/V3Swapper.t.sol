// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PoolSwapper} from "../contracts/PoolSwapper.sol";
import {V3Swapper} from "../contracts/V3Swapper.sol";

/// @dev The whole contract rests on deriving the right pool address. If that is
///      wrong every swap reverts with no data — which is exactly how the
///      Universal Router fails on this chain (D35), and it took a live failure
///      to notice. These are the addresses that failure produced, so the
///      derivation is pinned against real X Layer pools rather than against
///      itself.
contract V3SwapperTest is Test {
    address constant XLAYER_FACTORY = 0x4B2ab38DBF28D31D467aA8993f6c2585981D6804;
    address constant CANONICAL_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;

    address constant WOKB = 0xe538905cf8410324e03A5A23C1c177a474D59b2b;
    address constant USDT0 = 0x779Ded0c9e1022225f8E0630b35a9b54bE713736;
    address constant USDG = 0x4ae46a509F6b1D9056937BA4500cb143933D2dc8;

    // Read from the X Layer factory on mainnet, 2026-08-11.
    address constant WOKB_USDT0_500 = 0xe3BE6A0137f1b0602Fc1a4841686f43B340a5082;
    address constant USDT0_USDG_100 = 0x0cBe0dBE1400e57f371a38BD3b9bC80F7C3676dA;

    PoolSwapper swapper;

    function setUp() public {
        swapper = new PoolSwapper(XLAYER_FACTORY);
    }

    function test_DerivesLiveXLayerPools() public view {
        assertEq(swapper.poolFor(WOKB, USDT0, 500), WOKB_USDT0_500, "WOKB/USDT0 0.05%");
        assertEq(swapper.poolFor(USDT0, USDG, 100), USDT0_USDG_100, "USDT0/USDG 0.01%");
    }

    /// @dev Token order must not matter — the pool sorts, and so must we.
    function test_TokenOrderDoesNotChangeTheAddress() public view {
        assertEq(swapper.poolFor(USDT0, WOKB, 500), swapper.poolFor(WOKB, USDT0, 500));
    }

    /// @dev The bug itself, pinned: the canonical factory derives an address
    ///      that is not the live pool. This is why the router cannot swap here.
    function test_CanonicalFactoryDerivesTheWrongPool() public {
        PoolSwapper wrong = new PoolSwapper(CANONICAL_FACTORY);
        assertTrue(wrong.poolFor(WOKB, USDT0, 500) != WOKB_USDT0_500);
    }

    function test_RejectsAnUnsolicitedCallback() public {
        vm.expectRevert(
            abi.encodeWithSelector(V3Swapper.UnexpectedCallback.selector, address(this))
        );
        swapper.uniswapV3SwapCallback(1, -1, abi.encode(WOKB, address(this)));
    }
}
