import "dotenv/config";

export interface SolanaIndexerConfig {
  rpcUrl: string;
  satiProgramId: string;
  cluster: string;
  chainId: number;
  dbFilePath: string;
  pollIntervalSeconds: number;
  feedbackSchemaAddress: string;
}

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

export function loadConfig(): SolanaIndexerConfig & { d1: { accountId: string; apiToken: string; databaseId: string } } {
  const rpcUrl = requireEnv("SOLANA_RPC_URL");
  const satiProgramId = process.env.SATI_PROGRAM_ID || "satiRkxEiwZ51cv8PRu8UMzuaqeaNU9jABo6oAFMsLe";
  const cluster = process.env.CLUSTER || "devnet";
  const chainId = cluster === "mainnet" ? 900 : 901;
  const pollIntervalSeconds = parseInt(process.env.POLL_INTERVAL_SECONDS || "30", 10);
  const feedbackSchemaAddress = process.env.FEEDBACK_SCHEMA_ADDRESS || "";

  // D1 Config
  const accountId = requireEnv("CF_ACCOUNT_ID");
  const apiToken = requireEnv("CF_API_TOKEN");
  const databaseId = requireEnv("D1_DATABASE_ID");

  return {
    rpcUrl,
    satiProgramId,
    cluster,
    chainId,
    dbFilePath: "", // Legacy
    pollIntervalSeconds,
    feedbackSchemaAddress,
    d1: { accountId, apiToken, databaseId }
  };
}
