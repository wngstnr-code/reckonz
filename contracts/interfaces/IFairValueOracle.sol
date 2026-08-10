// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFairValueOracle {
    struct Observation {
        uint128 fairValueE8;
        uint32 confidenceBps;
        int32 basisBps;
        uint128 capacityUsdg;
        uint8 gapRisk;
        uint8 state;
        uint64 anchorAt;
        uint64 updatedAt;
        bool hasValue;
    }

    /// @notice Fresh observation or revert. Does not require a defensible value —
    ///         gap risk and capacity stay meaningful when the value is withheld.
    function observation(address asset) external view returns (Observation memory);

    /// @return valueE8       fair value, 8 decimals
    /// @return confidenceBps half-width of the 95% band, basis points
    /// @return gapRisk       0-100
    /// @dev Reverts when there is no data, the data is stale, or the oracle
    ///      deliberately withheld a value.
    function fairValue(address asset)
        external
        view
        returns (uint128 valueE8, uint32 confidenceBps, uint8 gapRisk);

    /// @return ok     whether the trade is permitted
    /// @return reason machine-readable rejection code, zero when ok
    function checkExecution(
        address asset,
        uint256 executionPriceE8,
        uint8 maxGapRisk,
        uint32 maxDeviationBps
    ) external view returns (bool ok, bytes32 reason);
}
