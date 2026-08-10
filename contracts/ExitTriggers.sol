// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IFairValueOracle} from "./interfaces/IFairValueOracle.sol";

/// @title ExitTriggers
/// @notice The on-chain half of the observable-metric contract.
///
/// @dev `Metric` mirrors `OBSERVABLE_METRICS` in `src/thesis.ts` exactly, in the
///      same order. That correspondence is the whole point: the Thesis Compiler
///      may only emit a trigger naming one of these, and every one of them is
///      evaluated here. A metric the enum can express but this library cannot
///      evaluate would be a rule that silently never fires — the failure the
///      design exists to prevent — so the two must be changed together.
library ExitTriggers {
    enum Metric {
        gapRisk,
        basisBps,
        confidenceBps,
        stalenessHours,
        drawdownBpsFromEntry,
        capacityUsdg,
        priceVsThesisEntryBps
    }

    enum Comparator {
        gt,
        lt
    }

    struct Trigger {
        Metric metric;
        Comparator comparator;
        /// @dev Signed, because basis and price moves can be negative.
        int256 threshold;
        /// @dev Empty means every asset the mandate allows.
        address[] assets;
    }

    /// @notice Per (mandate, asset) state the guard maintains as fills settle.
    struct Position {
        /// @dev asset units held, in the asset's own decimals
        uint128 units;
        /// @dev weighted-average entry price, USDG per whole unit, 8 decimals
        uint128 costBasisE8;
        /// @dev fair value at the moment the position was first opened, 8 decimals
        uint128 entryFairValueE8;
    }

    error MetricUnavailable(Metric metric);

    /// @notice Evaluate one metric for one asset. Reverts rather than returning
    ///         a sentinel when the input it needs does not exist — a trigger
    ///         that cannot be evaluated must stop the transaction, not quietly
    ///         read as "not fired".
    function evaluate(
        Metric metric,
        IFairValueOracle.Observation memory o,
        Position memory p
    ) internal view returns (int256) {
        if (metric == Metric.gapRisk) return int256(uint256(o.gapRisk));
        if (metric == Metric.basisBps) return int256(o.basisBps);
        if (metric == Metric.confidenceBps) return int256(uint256(o.confidenceBps));
        if (metric == Metric.capacityUsdg) return int256(uint256(o.capacityUsdg));

        if (metric == Metric.stalenessHours) {
            if (o.anchorAt == 0) revert MetricUnavailable(metric);
            uint256 elapsed = block.timestamp > o.anchorAt ? block.timestamp - o.anchorAt : 0;
            return int256(elapsed / 1 hours);
        }

        if (metric == Metric.drawdownBpsFromEntry) {
            // No position means no drawdown to measure. Requiring a defensible
            // fair value here is deliberate: a withheld value cannot be used to
            // claim the position is fine.
            if (p.units == 0 || p.costBasisE8 == 0) return 0;
            if (!o.hasValue) revert MetricUnavailable(metric);
            int256 basis = int256(uint256(p.costBasisE8));
            int256 fv = int256(uint256(o.fairValueE8));
            return ((basis - fv) * 10_000) / basis; // positive = loss
        }

        if (metric == Metric.priceVsThesisEntryBps) {
            if (p.entryFairValueE8 == 0) return 0;
            if (!o.hasValue) revert MetricUnavailable(metric);
            int256 entry = int256(uint256(p.entryFairValueE8));
            int256 fv = int256(uint256(o.fairValueE8));
            return ((fv - entry) * 10_000) / entry;
        }

        revert MetricUnavailable(metric);
    }

    function fired(
        Trigger memory t,
        IFairValueOracle.Observation memory o,
        Position memory p
    ) internal view returns (bool) {
        int256 value = evaluate(t.metric, o, p);
        return t.comparator == Comparator.gt ? value > t.threshold : value < t.threshold;
    }

    /// @notice Whether a trigger governs a given asset. An empty asset list is
    ///         basket-wide.
    function covers(Trigger memory t, address asset) internal pure returns (bool) {
        if (t.assets.length == 0) return true;
        for (uint256 i; i < t.assets.length; ++i) {
            if (t.assets[i] == asset) return true;
        }
        return false;
    }

    /// @notice Fold a settled fill into the position.
    /// @dev Entry is a weighted average over executed price, so the cost basis
    ///      reflects what was actually paid — including slippage — rather than
    ///      a quoted price. Exits reduce units and leave the basis alone, so
    ///      partial exits do not flatter the remaining position's drawdown.
    function applyFill(
        Position storage p,
        bool isExit,
        uint128 units,
        uint128 executionPriceE8,
        uint128 fairValueE8
    ) internal {
        if (isExit) {
            p.units = units >= p.units ? 0 : p.units - units;
            if (p.units == 0) {
                p.costBasisE8 = 0;
                p.entryFairValueE8 = 0;
            }
            return;
        }

        if (p.units == 0) {
            p.costBasisE8 = executionPriceE8;
            p.entryFairValueE8 = fairValueE8;
            p.units = units;
            return;
        }

        uint256 total = uint256(p.units) + uint256(units);
        p.costBasisE8 = uint128(
            (uint256(p.units) * uint256(p.costBasisE8) + uint256(units) * uint256(executionPriceE8))
                / total
        );
        p.units = uint128(total);
    }
}
