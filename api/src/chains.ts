export const CHAIN_NAMES: Record<number, string> = {
  // EVM Mainnets
  1: "Ethereum",
  8453: "Base",
  42161: "Arbitrum",
  10: "Optimism",
  137: "Polygon",
  56: "BNB Chain",
  43114: "Avalanche",
  143: "Monad",
  167000: "Taiko",
  100: "Gnosis",
  59144: "Linea",
  42220: "Celo",
  534352: "Scroll",
  2741: "Abstract",
  196: "X Layer",
  9745: "Plasma",
  4326: "MegaETH",
  2046399126: "Skale Europa",
  5000: "Mantle",
  1868: "Soneium",
  1088: "Metis",

  // EVM Testnets
  11155111: "Sepolia",
  84532: "Base Sepolia",

  // Solana
  900: "Solana",
  901: "Solana Devnet",
};

export function getChainName(chainId: number): string {
  return CHAIN_NAMES[chainId] || `Chain ${chainId}`;
}

export const REPUTATION_REGISTRIES: Record<number, string> = {
  1: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  8453: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  42161: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  10: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  137: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  56: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  43114: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  // Add other known registries or use default if identical
  11155111: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  84532: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
};

export function getReputationRegistry(chainId: number): string | undefined {
  return REPUTATION_REGISTRIES[chainId];
}

export function isEvmChain(chainId: number): boolean {
  return chainId in REPUTATION_REGISTRIES;
}

export const MAINNET_CHAINS = [
  1, 8453, 42161, 10, 137, 56, 43114, 143, 167000, 100, 59144, 42220, 534352, 2741, 196, 9745, 4326, 2046399126, 5000, 1868, 1088, 900
];
export const TESTNET_CHAINS = [11155111, 84532, 901];

export function getNetworkChains(network: string | undefined): number[] | null {
  if (network === "mainnet") return MAINNET_CHAINS;
  if (network === "testnet") return TESTNET_CHAINS;
  return null; // no filter
}
