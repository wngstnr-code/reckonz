// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FeeCollector} from "../contracts/FeeCollector.sol";

contract Token {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }
}

contract FeeCollectorTest is Test {
    FeeCollector fees;
    Token usdg;

    address admin = address(0xA11CE);
    address treasury = address(0x7EA5);
    address stranger = address(0xBAD);

    function setUp() public {
        usdg = new Token();
        fees = new FeeCollector(admin, treasury, 15);
    }

    function test_FeeIsBpsOfNotional() public view {
        // 15 bps of 1,000 USDG (6dp) = 1.5 USDG
        assertEq(fees.feeOn(1_000_000000), 1_500000);
    }

    /// @dev A fee that rounds up would take more than it is charged on at dust
    ///      sizes, which is indistinguishable from theft.
    function test_DustPaysNothingRatherThanRoundingUp() public view {
        assertEq(fees.feeOn(1), 0);
        assertEq(fees.feeOn(666), 0); // 15bps of 666 is 0.999
        assertEq(fees.feeOn(667), 1);
    }

    /// @dev The ceiling is the point. An admin who can raise the fee without
    ///      limit can take the whole trade.
    function test_TheCeilingIsNotSettable() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(FeeCollector.FeeTooHigh.selector, uint16(51), uint16(50)));
        fees.setFeeBps(51);

        vm.prank(admin);
        fees.setFeeBps(50);
        assertEq(fees.feeBps(), 50);
    }

    function test_ConstructorRefusesAFeeAboveTheCeiling() public {
        vm.expectRevert(abi.encodeWithSelector(FeeCollector.FeeTooHigh.selector, uint16(100), uint16(50)));
        new FeeCollector(admin, treasury, 100);
    }

    function test_OnlyAdminMayChangeAnything() public {
        vm.startPrank(stranger);
        vm.expectRevert(FeeCollector.NotAdmin.selector);
        fees.setFeeBps(10);
        vm.expectRevert(FeeCollector.NotAdmin.selector);
        fees.setTreasury(stranger);
        vm.expectRevert(FeeCollector.NotAdmin.selector);
        fees.setAdmin(stranger);
        vm.stopPrank();
    }

    /// @dev Withdrawal is open because the destination is fixed. Anyone may pay
    ///      the gas; only the treasury can receive.
    function test_AnyoneMaySweepButOnlyToTheTreasury() public {
        usdg.mint(address(fees), 42_000000);

        vm.prank(stranger);
        uint256 swept = fees.withdraw(address(usdg));

        assertEq(swept, 42_000000);
        assertEq(usdg.balanceOf(treasury), 42_000000);
        assertEq(usdg.balanceOf(address(fees)), 0);
        assertEq(usdg.balanceOf(stranger), 0);
    }

    function test_SweepingNothingIsNotAnError() public {
        assertEq(fees.withdraw(address(usdg)), 0);
    }

    function test_ZeroFeeCollectsNothing() public {
        vm.prank(admin);
        fees.setFeeBps(0);
        assertEq(fees.feeOn(1_000_000000), 0);
    }
}
