import "dotenv/config";

// Real ERC-8004 deployed addresses (same on all mainnet chains)
const DEFAULT_IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const DEFAULT_REPUTATION_REGISTRY = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";

// Testnet registry addresses
const TESTNET_IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const TESTNET_REPUTATION_REGISTRY = "0x8004B663056A597Dffe9eCcC1965A193B7388713";

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  /** L2 ERC-8004 Identity Registry address */
  identityRegistry: string;
  /** L2 ERC-8004 Reputation Registry address */
  reputationRegistry: string;
  /** Whether this chain is a testnet */
  isTestnet: boolean;
  /** Optional custom chunk size for log queries (default: 2000) */
  chunkSize?: number;
  /** Optional delay between chunks in ms (default: 200) */
  scanDelay?: number;
  /** Block to start scanning from (skips blocks before contract deployment) */
  fromBlock: number;
}

export interface D1Config {
  accountId: string;
  apiToken: string;
  databaseId: string;
}

export interface IndexerConfig {
  pollIntervalSeconds: number;
  stateFilePath: string;
  d1: D1Config;
  chains: ChainConfig[];
}

export function loadConfig(): IndexerConfig {
  const pollIntervalSeconds = parseInt(process.env.POLL_INTERVAL_SECONDS || "60", 10);
  const stateFilePath = process.env.STATE_FILE_PATH || "./state.json";

  const cfAccountId = process.env.CF_ACCOUNT_ID;
  const cfApiToken = process.env.CF_API_TOKEN;
  const d1DatabaseId = process.env.D1_DATABASE_ID;

  if (!cfAccountId || !cfApiToken || !d1DatabaseId) {
    throw new Error("Missing Cloudflare D1 config. Set CF_ACCOUNT_ID, CF_API_TOKEN, and D1_DATABASE_ID.");
  }

  const chains: ChainConfig[] = [];

  // Mainnet chains — only added if their dedicated RPC URL is set
  if (process.env.MAINNET_RPC_URL) {
    chains.push({
      chainId: 1,
      name: "Ethereum Mainnet",
      rpcUrl: process.env.MAINNET_RPC_URL,
      identityRegistry: process.env.MAINNET_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.MAINNET_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.MAINNET_FROM_BLOCK || "0", 10),
      chunkSize: 100,
    });
  }

  if (process.env.BASE_RPC_URL) {
    chains.push({
      chainId: 8453,
      name: "Base",
      rpcUrl: process.env.BASE_RPC_URL,
      identityRegistry: process.env.BASE_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.BASE_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.BASE_FROM_BLOCK || "0", 10),
      chunkSize: 100,
    });
  }

  if (process.env.ARBITRUM_RPC_URL) {
    chains.push({
      chainId: 42161,
      name: "Arbitrum One",
      rpcUrl: process.env.ARBITRUM_RPC_URL,
      identityRegistry: process.env.ARBITRUM_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.ARBITRUM_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.ARBITRUM_FROM_BLOCK || "0", 10),
      chunkSize: 100,
    });
  }

  if (process.env.OPTIMISM_RPC_URL) {
    chains.push({
      chainId: 10,
      name: "Optimism",
      rpcUrl: process.env.OPTIMISM_RPC_URL,
      identityRegistry: process.env.OPTIMISM_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.OPTIMISM_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.OPTIMISM_FROM_BLOCK || "0", 10),
      chunkSize: 100,
      scanDelay: 2000,
    });
  }

  // Testnet support
  if (process.env.POLYGON_RPC_URL) {
    chains.push({
      chainId: 137,
      name: "Polygon",
      rpcUrl: process.env.POLYGON_RPC_URL,
      identityRegistry: process.env.POLYGON_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.POLYGON_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.POLYGON_FROM_BLOCK || "0", 10),
      chunkSize: 50, // Reduced to 50 due to strict RPC limits
      scanDelay: 2000,
    });
  }

  if (process.env.BSC_RPC_URL) {
    chains.push({
      chainId: 56,
      name: "BNB Smart Chain",
      rpcUrl: process.env.BSC_RPC_URL,
      identityRegistry: process.env.BSC_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.BSC_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.BSC_FROM_BLOCK || "0", 10),
      chunkSize: 100,
      scanDelay: 2500, // Extra slow for BNB
    });
  }

  if (process.env.AVALANCHE_RPC_URL) {
    chains.push({
      chainId: 43114,
      name: "Avalanche C-Chain",
      rpcUrl: process.env.AVALANCHE_RPC_URL,
      identityRegistry: process.env.AVALANCHE_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.AVALANCHE_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.AVALANCHE_FROM_BLOCK || "0", 10),
      chunkSize: 100, // Avalanche also strict on range
      scanDelay: 2000,
    });
  }

  if (process.env.MONAD_RPC_URL) {
    chains.push({
      chainId: 143,
      name: "Monad",
      rpcUrl: process.env.MONAD_RPC_URL,
      identityRegistry: process.env.MONAD_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.MONAD_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.MONAD_FROM_BLOCK || "0", 10),
      chunkSize: 100, // Monad RPC has strict limits
    });
  }

  if (process.env.TAIKO_RPC_URL) {
    chains.push({
      chainId: 167000,
      name: "Taiko",
      rpcUrl: process.env.TAIKO_RPC_URL,
      identityRegistry: process.env.TAIKO_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.TAIKO_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.TAIKO_FROM_BLOCK || "0", 10),
      chunkSize: 100,
    });
  }

  if (process.env.GNOSIS_RPC_URL) {
    chains.push({
      chainId: 100,
      name: "Gnosis",
      rpcUrl: process.env.GNOSIS_RPC_URL,
      identityRegistry: process.env.GNOSIS_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.GNOSIS_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.GNOSIS_FROM_BLOCK || "0", 10),
      chunkSize: 100,
    });
  }

  if (process.env.LINEA_RPC_URL) {
    chains.push({
      chainId: 59144,
      name: "Linea",
      rpcUrl: process.env.LINEA_RPC_URL,
      identityRegistry: process.env.LINEA_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.LINEA_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.LINEA_FROM_BLOCK || "0", 10),
      chunkSize: 100,
    });
  }

  if (process.env.CELO_RPC_URL) {
    chains.push({
      chainId: 42220,
      name: "Celo",
      rpcUrl: process.env.CELO_RPC_URL,
      identityRegistry: process.env.CELO_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.CELO_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.CELO_FROM_BLOCK || "0", 10),
      chunkSize: 100,
    });
  }

  if (process.env.SCROLL_RPC_URL) {
    chains.push({
      chainId: 534352,
      name: "Scroll",
      rpcUrl: process.env.SCROLL_RPC_URL,
      identityRegistry: process.env.SCROLL_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.SCROLL_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.SCROLL_FROM_BLOCK || "0", 10),
      chunkSize: 100,
    });
  }

  if (process.env.ABSTRACT_RPC_URL) {
    chains.push({
      chainId: 2741,
      name: "Abstract",
      rpcUrl: process.env.ABSTRACT_RPC_URL,
      identityRegistry: process.env.ABSTRACT_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.ABSTRACT_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.ABSTRACT_FROM_BLOCK || "0", 10),
      chunkSize: 100,
    });
  }

  if (process.env.XLAYER_RPC_URL) {
    chains.push({
      chainId: 196,
      name: "X Layer",
      rpcUrl: process.env.XLAYER_RPC_URL,
      identityRegistry: process.env.XLAYER_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.XLAYER_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.XLAYER_FROM_BLOCK || "0", 10),
      chunkSize: 100,
    });
  }

  if (process.env.PLASMA_RPC_URL) {
    chains.push({
      chainId: 9745,
      name: "Plasma",
      rpcUrl: process.env.PLASMA_RPC_URL,
      identityRegistry: process.env.PLASMA_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.PLASMA_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.PLASMA_FROM_BLOCK || "0", 10),
      chunkSize: 100,
    });
  }

  if (process.env.MEGAETH_RPC_URL) {
    chains.push({
      chainId: 4326,
      name: "MegaETH",
      rpcUrl: process.env.MEGAETH_RPC_URL,
      identityRegistry: process.env.MEGAETH_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.MEGAETH_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.MEGAETH_FROM_BLOCK || "0", 10),
      chunkSize: 100,
    });
  }

  if (process.env.SKALE_EUROPA_RPC_URL) {
    chains.push({
      chainId: 2046399126,
      name: "Skale Europa",
      rpcUrl: process.env.SKALE_EUROPA_RPC_URL,
      identityRegistry: process.env.SKALE_EUROPA_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.SKALE_EUROPA_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.SKALE_EUROPA_FROM_BLOCK || "0", 10),
      chunkSize: 100,
    });
  }

  if (process.env.MANTLE_RPC_URL) {
    chains.push({
      chainId: 5000,
      name: "Mantle",
      rpcUrl: process.env.MANTLE_RPC_URL,
      identityRegistry: process.env.MANTLE_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.MANTLE_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.MANTLE_FROM_BLOCK || "0", 10),
      chunkSize: 100,
    });
  }

  if (process.env.SONEIUM_RPC_URL) {
    chains.push({
      chainId: 1868,
      name: "Soneium",
      rpcUrl: process.env.SONEIUM_RPC_URL,
      identityRegistry: process.env.SONEIUM_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.SONEIUM_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.SONEIUM_FROM_BLOCK || "0", 10),
      chunkSize: 100,
    });
  }

  if (process.env.METIS_RPC_URL) {
    chains.push({
      chainId: 1088,
      name: "Metis",
      rpcUrl: process.env.METIS_RPC_URL,
      identityRegistry: process.env.METIS_IDENTITY_REGISTRY || DEFAULT_IDENTITY_REGISTRY,
      reputationRegistry: process.env.METIS_REPUTATION_REGISTRY || DEFAULT_REPUTATION_REGISTRY,
      isTestnet: false,
      fromBlock: parseInt(process.env.METIS_FROM_BLOCK || "0", 10),
      chunkSize: 100,
    });
  }

  // Testnet support
  if (process.env.SEPOLIA_RPC_URL) {
    chains.push({
      chainId: 11155111,
      name: "Sepolia",
      rpcUrl: process.env.SEPOLIA_RPC_URL,
      identityRegistry: process.env.SEPOLIA_IDENTITY_REGISTRY || TESTNET_IDENTITY_REGISTRY,
      reputationRegistry: process.env.SEPOLIA_REPUTATION_REGISTRY || TESTNET_REPUTATION_REGISTRY,
      isTestnet: true,
      fromBlock: parseInt(process.env.SEPOLIA_FROM_BLOCK || "0", 10),
      chunkSize: 100,
    });
  }

  if (process.env.BASE_SEPOLIA_RPC_URL) {
    chains.push({
      chainId: 84532,
      name: "Base Sepolia",
      rpcUrl: process.env.BASE_SEPOLIA_RPC_URL,
      identityRegistry: process.env.BASE_SEPOLIA_IDENTITY_REGISTRY || TESTNET_IDENTITY_REGISTRY,
      reputationRegistry: process.env.BASE_SEPOLIA_REPUTATION_REGISTRY || TESTNET_REPUTATION_REGISTRY,
      isTestnet: true,
      fromBlock: parseInt(process.env.BASE_SEPOLIA_FROM_BLOCK || "0", 10),
      chunkSize: 100,
    });
  }

  if (chains.length === 0) {
    throw new Error("No L2 chains configured. Set at least one chain RPC URL (e.g. BASE_SEPOLIA_RPC_URL).");
  }

  return {
    pollIntervalSeconds,
    stateFilePath,
    d1: {
      accountId: cfAccountId,
      apiToken: cfApiToken,
      databaseId: d1DatabaseId,
    },
    chains,
  };
}
