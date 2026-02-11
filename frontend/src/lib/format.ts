import type { ParsedGlobalAgentId } from "./types";

/**
 * Format a reputation value with its decimals.
 * e.g. summaryValue=4500n, decimals=2 → "45.00"
 *      summaryValue=-123n, decimals=1 → "-12.3"
 */
export function formatReputation(value: bigint, decimals: number): string {
  const isNegative = value < 0n;
  const abs = isNegative ? -value : value;
  const str = abs.toString().padStart(decimals + 1, "0");
  const intPart = str.slice(0, str.length - decimals) || "0";
  const fracPart = decimals > 0 ? "." + str.slice(str.length - decimals) : "";
  return (isNegative ? "-" : "") + intPart + fracPart;
}

/**
 * Format a unix timestamp to a locale date string.
 */
export function formatTimestamp(timestamp: number): string {
  if (timestamp === 0) return "Never";
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Shorten a hex string: 0x1234...abcd
 */
export function shortenHex(hex: string, chars = 4): string {
  if (hex.length <= chars * 2 + 2) return hex;
  return `${hex.slice(0, chars + 2)}...${hex.slice(-chars)}`;
}

/**
 * Parse a global agent ID into its 4 segments.
 * Format: eip155:{chainId}:{registryAddr}:{agentId}
 */
export function parseGlobalAgentId(
  globalAgentId: string
): ParsedGlobalAgentId | null {
  const parts = globalAgentId.split(":");
  if (parts.length !== 4 || parts[0] !== "eip155") return null;
  return {
    prefix: parts[0],
    chainId: parts[1],
    registryAddress: parts[2],
    agentId: parts[3],
  };
}

/**
 * Validate that a string is a valid 4-segment global agent ID.
 */
export function isValidGlobalAgentId(value: string): boolean {
  return parseGlobalAgentId(value) !== null;
}
