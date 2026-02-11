// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IMasterRegistry} from "../interfaces/IMasterRegistry.sol";

library ScoreCalculator {
    /// @notice Compute feedback-count-weighted average with decimal normalization
    /// @dev Steps:
    ///   1. Find max decimals across all chains
    ///   2. Normalize each chain's value to max decimals
    ///   3. Weighted sum: sum(normalizedValue_i * count_i) / sum(count_i)
    ///   4. Return (int128 unifiedValue, uint8 decimals, uint64 totalCount)
    /// @param reps Array of chain reputation snapshots
    /// @return unifiedValue Weighted average value at max decimal precision
    /// @return decimals The max decimal places used
    /// @return totalCount Total feedback entries across all chains
    function computeWeightedAverage(IMasterRegistry.ChainReputation[] memory reps)
        internal
        pure
        returns (int128, uint8, uint64)
    {
        if (reps.length == 0) return (0, 0, 0);

        // Step 1: Find max decimals and total count
        uint8 maxDecimals;
        uint256 totalWeight;

        for (uint256 i; i < reps.length;) {
            if (reps[i].summaryValueDecimals > maxDecimals) {
                maxDecimals = reps[i].summaryValueDecimals;
            }
            totalWeight += uint256(reps[i].feedbackCount);
            unchecked { ++i; }
        }

        if (totalWeight == 0) return (0, maxDecimals, 0);

        // Step 2 + 3: Normalize and compute weighted sum using int256 for safety
        int256 weightedSum;

        for (uint256 i; i < reps.length;) {
            if (reps[i].feedbackCount > 0) {
                uint8 decimalDiff = maxDecimals - reps[i].summaryValueDecimals;
                int256 normalizedValue = int256(reps[i].summaryValue) * int256(uint256(10 ** decimalDiff));
                weightedSum += normalizedValue * int256(uint256(reps[i].feedbackCount));
            }
            unchecked { ++i; }
        }

        // Step 4: Divide by total weight
        int256 result = weightedSum / int256(totalWeight);

        return (int128(result), maxDecimals, uint64(totalWeight));
    }
}
