// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FairValueOracle} from "../contracts/FairValueOracle.sol";

/// The publish-time bound.
///
/// The threat is a leaked publisher key. Publishing runs every fifteen minutes
/// from a machine, so it cannot sit behind a multisig — the contract has to be
/// the constraint. These tests are about whether it actually constrains, and
/// several of them exist because the obvious implementation does not.
contract FairValueOracleBoundTest is Test {
    FairValueOracle oracle;
    address constant ASSET = address(0xA55E7);
    address constant OTHER = address(0xB0B);
    uint128 constant BASE = 100e8;

    function setUp() public {
        vm.warp(1_786_368_600);
        oracle = new FairValueOracle(address(this));
    }

    function _publish(address asset, uint128 fv, bool hasValue) internal {
        oracle.publish(
            FairValueOracle.Publication({
                asset: asset,
                fairValueE8: fv,
                confidenceBps: 100,
                basisBps: 0,
                capacityUsdg: 5_000_000000,
                gapRisk: 20,
                state: FairValueOracle.MarketState.PRE,
                anchorAt: uint64(block.timestamp),
                hasValue: hasValue
            })
        );
    }

    function _publish(uint128 fv) internal {
        _publish(ASSET, fv, true);
    }

    function _value(address asset) internal view returns (uint128) {
        return oracle.peek(asset).fairValueE8;
    }

    /// `MAX_JUMP_BPS` away from `from`, plus or minus one basis point of room.
    function _atBound(uint128 from, int256 extraBps) internal view returns (uint128) {
        uint256 bps = oracle.MAX_JUMP_BPS();
        int256 moveBps = int256(bps) + extraBps;
        return uint128((uint256(from) * uint256(10_000 + moveBps)) / 10_000);
    }

    // ------------------------------------------------------------ genesis

    function test_FirstPublicationHasNothingToBeMeasuredAgainst() public {
        // Honest limit, not an oversight: a first value cannot be bounded
        // without an outside reference. Recorded so nobody reads the bound as
        // protecting more than it does.
        _publish(BASE);
        assertEq(_value(ASSET), BASE);
        assertTrue(oracle.peek(ASSET).hasValue);
    }

    function test_OrdinaryMovementIsPublishedImmediately() public {
        _publish(BASE);
        _publish(105e8); // +5%
        assertEq(_value(ASSET), 105e8);
    }

    // -------------------------------------------------------------- bound

    function test_ExactlyAtTheBoundIsStillBelieved() public {
        _publish(BASE);
        uint128 edge = _atBound(BASE, 0); // +20.00%
        _publish(edge);
        assertEq(_value(ASSET), edge, "a move exactly at the bound is inside it");
    }

    function test_OneBasisPointPastTheBoundIsWithheld() public {
        _publish(BASE);
        uint128 over = _atBound(BASE, 1); // +20.01%
        _publish(over);
        assertFalse(oracle.peek(ASSET).hasValue, "past the bound the value is withheld");
        assertEq(_value(ASSET), 0);
        assertEq(oracle.anchorOf(ASSET).valueE8, BASE, "the anchor does not move");
        assertEq(oracle.anchorOf(ASSET).pendingE8, over, "the jump is announced");
    }

    function test_TheBoundIsSymmetric() public {
        _publish(BASE);
        _publish(70e8); // -30%
        assertFalse(oracle.peek(ASSET).hasValue, "a crash is as unbelievable as a spike");
    }

    function test_WithholdingByBoundStillCarriesTheRestOfTheObservation() public {
        // publishMany writes 28 assets at once. A refused value must not throw
        // away gap risk and capacity, which are exactly what a mandate wants to
        // see at the moment the oracle stops trusting its own price.
        _publish(BASE);
        _publish(200e8);
        FairValueOracle.Observation memory o = oracle.peek(ASSET);
        assertFalse(o.hasValue);
        assertEq(o.gapRisk, 20);
        assertEq(o.capacityUsdg, 5_000_000000);
    }

    // ------------------------------------------------------- confirmation

    function test_ConfirmingTooEarlyChangesNothing() public {
        _publish(BASE);
        _publish(200e8);
        vm.warp(block.timestamp + oracle.JUMP_CONFIRM_DELAY() - 1);
        _publish(200e8);
        assertFalse(oracle.peek(ASSET).hasValue, "one second short is still short");
    }

    function test_ConfirmingAfterTheDelayTakesEffect() public {
        _publish(BASE);
        _publish(200e8);
        vm.warp(block.timestamp + oracle.JUMP_CONFIRM_DELAY());
        _publish(200e8);
        assertTrue(oracle.peek(ASSET).hasValue);
        assertEq(_value(ASSET), 200e8);
        assertEq(oracle.anchorOf(ASSET).valueE8, 200e8, "the anchor follows");
        assertEq(oracle.anchorOf(ASSET).pendingAt, 0, "the announcement is cleared");
    }

    function test_AConfirmationMustAgreeWithWhatWasAnnounced() public {
        // Otherwise announcing one jump would license publishing any other, and
        // the delay would buy nothing at all.
        _publish(BASE);
        _publish(200e8);
        vm.warp(block.timestamp + oracle.JUMP_CONFIRM_DELAY());
        _publish(1_000_000e8);
        assertFalse(oracle.peek(ASSET).hasValue, "a different value is a new announcement");
        assertEq(oracle.anchorOf(ASSET).pendingE8, 1_000_000e8);
        assertEq(oracle.anchorOf(ASSET).valueE8, BASE, "the anchor still has not moved");
    }

    function test_AnAbandonedAnnouncementExpires() public {
        _publish(BASE);
        _publish(200e8);
        vm.warp(block.timestamp + oracle.PENDING_TTL() + 1);
        _publish(200e8);
        assertFalse(oracle.peek(ASSET).hasValue, "a stale announcement cannot be confirmed");
        // Still measured against the original anchor, not re-anchored: the TTL
        // has to be reachable inside ANCHOR_MAX_AGE or it never runs at all.
        assertEq(oracle.anchorOf(ASSET).valueE8, BASE, "the anchor is still live");
        assertLt(oracle.PENDING_TTL(), oracle.ANCHOR_MAX_AGE(), "otherwise the TTL is dead code");
    }

    function test_ReturningInsideTheBoundAbandonsTheAnnouncement() public {
        _publish(BASE);
        _publish(200e8);
        _publish(101e8); // back to normal — the spike is forgotten
        assertTrue(oracle.peek(ASSET).hasValue);
        assertEq(oracle.anchorOf(ASSET).pendingAt, 0);

        // And the forgotten announcement must not become confirmable later.
        vm.warp(block.timestamp + oracle.JUMP_CONFIRM_DELAY());
        _publish(200e8);
        assertFalse(oracle.peek(ASSET).hasValue, "no announcement left to confirm");
    }

    // --------------------------------------------------------- the bypass

    function test_WithholdingDoesNotEraseTheAnchor() public {
        // The obvious implementation keeps the anchor inside `Observation`. A
        // withheld observation zeroes the value, so publishing a withhold and
        // then any price at all would walk straight past the bound. This is the
        // reason `Anchor` is separate storage.
        _publish(BASE);
        _publish(ASSET, 0, false); // a legitimate withhold
        _publish(1_000_000e8);
        assertFalse(oracle.peek(ASSET).hasValue, "the bound survived the withhold");
        assertEq(oracle.anchorOf(ASSET).valueE8, BASE);
    }

    function test_ALapsedFeedReAnchorsRatherThanWithholdingForever() public {
        // Past ANCHOR_MAX_AGE the tolerance is no longer calibrated for the
        // elapsed time, and consumers have been rejecting on STALE throughout.
        _publish(BASE);
        vm.warp(block.timestamp + oracle.ANCHOR_MAX_AGE() + 1);
        _publish(1_000e8);
        assertTrue(oracle.peek(ASSET).hasValue, "a restarting feed re-anchors");
        assertEq(oracle.anchorOf(ASSET).valueE8, 1_000e8);
    }

    // -------------------------------------------------------------- batch

    function test_OneGappingAssetDoesNotSpoilTheBatch() public {
        _publish(ASSET, BASE, true);
        _publish(OTHER, BASE, true);

        FairValueOracle.Publication[] memory items = new FairValueOracle.Publication[](2);
        items[0] = FairValueOracle.Publication({
            asset: ASSET,
            fairValueE8: 500e8, // way past the bound
            confidenceBps: 100,
            basisBps: 0,
            capacityUsdg: 1,
            gapRisk: 20,
            state: FairValueOracle.MarketState.PRE,
            anchorAt: uint64(block.timestamp),
            hasValue: true
        });
        items[1] = FairValueOracle.Publication({
            asset: OTHER,
            fairValueE8: 102e8, // ordinary
            confidenceBps: 100,
            basisBps: 0,
            capacityUsdg: 1,
            gapRisk: 20,
            state: FairValueOracle.MarketState.PRE,
            anchorAt: uint64(block.timestamp),
            hasValue: true
        });
        oracle.publishMany(items);

        assertFalse(oracle.peek(ASSET).hasValue, "the gapping asset is withheld");
        assertEq(_value(OTHER), 102e8, "the other 27 still publish");
    }

    // ---------------------------------------------------------- staleness

    function test_MaxAgeCannotBeWidenedIntoUselessness() public {
        // An admin who can set maxAge to a year makes every stale observation
        // usable again — the freshness check defeated without touching a price.
        uint64 ceiling = oracle.MAX_MAX_AGE();
        vm.expectRevert(abi.encodeWithSelector(FairValueOracle.MaxAgeOutOfRange.selector, ceiling + 1));
        oracle.setMaxAge(ceiling + 1);

        vm.expectRevert(abi.encodeWithSelector(FairValueOracle.MaxAgeOutOfRange.selector, uint64(0)));
        oracle.setMaxAge(0);

        oracle.setMaxAge(ceiling);
        assertEq(oracle.maxAge(), ceiling);
    }

    // ------------------------------------------------------- what it isn't

    function test_APatientAttackerStillGetsThere() public {
        // Recorded as a test rather than a comment so nobody reads the bound as
        // prevention. Holding the key long enough walks the value anywhere in
        // confirmed steps; this caps the rate and forces an event trail. The
        // admin multisig is the other half, and the gap stays on the record.
        _publish(BASE);
        uint128 v = BASE;
        for (uint256 i; i < 12; ++i) {
            uint128 next = _atBound(v, 0);
            _publish(next);
            v = next;
        }
        assertGt(_value(ASSET), BASE * 8, "twelve bounded steps is still an 8x");
        assertLe(uint256(oracle.MAX_JUMP_BPS()), 2_000, "each step was bounded");
    }
}
