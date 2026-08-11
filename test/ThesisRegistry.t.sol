// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ThesisRegistry} from "../contracts/ThesisRegistry.sol";

contract ThesisRegistryTest is Test {
    ThesisRegistry registry;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    bytes32 constant HASH_A = keccak256("HBM supply stays tight");
    bytes32 constant HASH_B = keccak256("on-device AI drives replacement");

    function setUp() public {
        vm.warp(1_786_368_600);
        registry = new ThesisRegistry();
    }

    function test_PublishRecordsAuthorAndTime() public {
        vm.prank(alice);
        uint256 id = registry.publish(HASH_A, "ipfs://bundle-a");

        ThesisRegistry.Thesis memory t = registry.get(id);
        assertEq(t.author, alice);
        assertEq(t.contentHash, HASH_A);
        assertEq(t.publishedAt, uint64(block.timestamp));
        assertEq(t.cid, "ipfs://bundle-a");
        assertEq(registry.count(), 1);
    }

    /// @dev The whole point. Anyone could otherwise watch a thesis perform and
    ///      then publish the same text as their own.
    function test_TheSameThesisCannotBeClaimedTwice() public {
        vm.prank(alice);
        uint256 id = registry.publish(HASH_A, "ipfs://a");

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(ThesisRegistry.AlreadyPublished.selector, id, alice)
        );
        registry.publish(HASH_A, "ipfs://bobs-copy");

        assertEq(registry.authorOf(HASH_A), alice, "first publisher keeps the claim");
    }

    /// @dev Not even the original author may republish — that would let someone
    ///      move a thesis's timestamp forward after seeing how it did.
    function test_NotEvenTheAuthorMayRepublish() public {
        vm.startPrank(alice);
        registry.publish(HASH_A, "ipfs://a");
        vm.expectRevert(
            abi.encodeWithSelector(ThesisRegistry.AlreadyPublished.selector, uint256(0), alice)
        );
        registry.publish(HASH_A, "ipfs://a-again");
        vm.stopPrank();
    }

    function test_RejectsAnEmptyHash() public {
        vm.expectRevert(ThesisRegistry.EmptyHash.selector);
        registry.publish(bytes32(0), "ipfs://nothing");
    }

    /// @dev A receipt carrying an unknown hash means the trade was made without a
    ///      published thesis. That is an answer, not an error.
    function test_UnknownHashResolvesToNothingWithoutReverting() public view {
        (uint256 id, bool exists) = registry.idOf(keccak256("never published"));
        assertEq(id, 0);
        assertFalse(exists);
        assertEq(registry.authorOf(keccak256("never published")), address(0));
    }

    function test_ResolvesAReceiptHashBackToItsThesis() public {
        vm.prank(alice);
        uint256 published = registry.publish(HASH_A, "ipfs://a");

        (uint256 id, bool exists) = registry.idOf(HASH_A);
        assertTrue(exists);
        assertEq(id, published);
        assertEq(registry.get(id).author, alice);
    }

    function test_TracksThesesPerAuthor() public {
        vm.startPrank(alice);
        registry.publish(HASH_A, "");
        registry.publish(HASH_B, "");
        vm.stopPrank();

        uint256[] memory ids = registry.thesesOf(alice);
        assertEq(ids.length, 2);
        assertEq(ids[0], 0);
        assertEq(ids[1], 1);
        assertEq(registry.thesesOf(bob).length, 0);
    }

    /// @dev The bundle can be pinned after the claim is staked; the hash binds.
    function test_CidMayBeEmpty() public {
        vm.prank(alice);
        uint256 id = registry.publish(HASH_A, "");
        assertEq(registry.get(id).cid, "");
    }

    /// @dev What a verifier actually does: a thesis published before a fill is
    ///      evidence of intent; one published after is hindsight.
    function test_TimestampSeparatesIntentFromHindsight() public {
        vm.prank(alice);
        registry.publish(HASH_A, "");
        uint64 publishedAt = registry.get(0).publishedAt;

        vm.warp(block.timestamp + 1 hours);
        uint64 fillTime = uint64(block.timestamp);

        assertLt(publishedAt, fillTime, "reasoning predates the outcome");
    }
}
