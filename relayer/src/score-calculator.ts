/**
 * TypeScript port of ScoreCalculator.sol — feedback-count-weighted average
 * with decimal normalization.
 *
 * Uses bigint for int128 precision. Steps:
 *   1. Find max decimals across all chains
 *   2. Normalize each chain's value to max decimals
 *   3. Weighted sum: sum(normalizedValue_i * count_i) / sum(count_i)
 *   4. Return { unifiedValue, decimals, totalCount }
 */

export interface ChainReputation {
  summaryValue: bigint;
  summaryValueDecimals: number;
  feedbackCount: bigint;
}

export interface UnifiedReputation {
  unifiedValue: bigint;
  decimals: number;
  totalCount: bigint;
}

export function computeWeightedAverage(reps: ChainReputation[]): UnifiedReputation {
  if (reps.length === 0) {
    return { unifiedValue: 0n, decimals: 0, totalCount: 0n };
  }

  // Step 1: Find max decimals and total weight
  let maxDecimals = 0;
  let totalWeight = 0n;

  for (const rep of reps) {
    if (rep.summaryValueDecimals > maxDecimals) {
      maxDecimals = rep.summaryValueDecimals;
    }
    totalWeight += rep.feedbackCount;
  }

  if (totalWeight === 0n) {
    return { unifiedValue: 0n, decimals: maxDecimals, totalCount: 0n };
  }

  // Step 2 + 3: Normalize and compute weighted sum
  let weightedSum = 0n;

  for (const rep of reps) {
    if (rep.feedbackCount > 0n) {
      const decimalDiff = maxDecimals - rep.summaryValueDecimals;
      const normalizedValue = rep.summaryValue * 10n ** BigInt(decimalDiff);
      weightedSum += normalizedValue * rep.feedbackCount;
    }
  }

  // Step 4: Divide by total weight
  const result = weightedSum / totalWeight;

  return {
    unifiedValue: result,
    decimals: maxDecimals,
    totalCount: totalWeight,
  };
}
