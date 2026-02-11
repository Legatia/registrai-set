import { getAttestationOutcomeCounts } from "./db.js";

// Outcome scoring: Positive(2)=+100, Neutral(1)=0, Negative(0)=-100
export function outcomeToScore(outcome: number): number {
  switch (outcome) {
    case 2: return 100;
    case 1: return 0;
    case 0: return -100;
    default: return 0;
  }
}

/**
 * Recompute reputation from all indexed SATI attestations for an agent.
 * Returns values compatible with the reputation_latest table schema.
 */
export async function recomputeReputation(
  masterAgentId: string
): Promise<{
  summaryValue: string;
  decimals: number;
  feedbackCount: string;
}> {
  const counts = await getAttestationOutcomeCounts(masterAgentId);
  const total = counts.positive + counts.neutral + counts.negative;

  if (total === 0) {
    return { summaryValue: "0", decimals: 0, feedbackCount: "0" };
  }

  // Weighted average: positive=+100, neutral=0, negative=-100
  const sum = counts.positive * 100 + counts.neutral * 0 + counts.negative * -100;
  const average = Math.round(sum / total);

  return {
    summaryValue: String(average),
    decimals: 0,
    feedbackCount: String(total),
  };
}
