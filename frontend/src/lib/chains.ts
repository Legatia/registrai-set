export const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  8453: "Base",
  42161: "Arbitrum",
  10: "Optimism",
  11155111: "Sepolia",
  84532: "Base Sepolia",
};

export const EXPLORER_URLS: Record<number, string> = {
  1: "https://etherscan.io",
  8453: "https://basescan.org",
  42161: "https://arbiscan.io",
  10: "https://optimistic.etherscan.io",
  11155111: "https://sepolia.etherscan.io",
  84532: "https://sepolia.basescan.org",
};

export function getChainName(chainId: number | bigint): string {
  return CHAIN_NAMES[Number(chainId)] || `Chain ${chainId}`;
}

export function getExplorerUrl(chainId: number | bigint): string {
  return EXPLORER_URLS[Number(chainId)] || "";
}

export function getAddressExplorerUrl(
  chainId: number | bigint,
  address: string
): string {
  const base = getExplorerUrl(chainId);
  return base ? `${base}/address/${address}` : "";
}
