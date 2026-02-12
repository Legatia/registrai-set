import { Contract, JsonRpcProvider } from "ethers";
import { ChainConfig } from "./config.js";
import { L2_IDENTITY_REGISTRY_ABI, L2_REPUTATION_REGISTRY_ABI } from "./abis.js";
import { log } from "./logger.js";

const DEFAULT_CHUNK_SIZE = 10_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;
const DELAY_BETWEEN_CHUNKS_MS = 200;
const MIN_CHUNK_SIZE = 1;

const GLOBAL_CHUNK_SIZE = parseInt(process.env.SCAN_CHUNK_SIZE || String(DEFAULT_CHUNK_SIZE), 10);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const msg = String(e.message || e.shortMessage || "").toLowerCase();
    if (msg.includes("429") || msg.includes("rate") || msg.includes("capacity") || msg.includes("limit") || msg.includes("throttled") || msg.includes("too many")) return true;
    if (e.error && typeof e.error === "object") {
      const inner = e.error as Record<string, unknown>;
      if (inner.code === 429 || inner.code === -32016) return true;
    }
  }
  return false;
}

export interface DiscoveredAgent {
  /** L2 uint256 agent ID (as string) */
  agentId: string;
  /** Owner wallet address */
  ownerAddress: string;
  /** Agent URI from the Registered event */
  agentURI: string;
  /** Chain this was discovered on */
  chainId: number;
  blockNumber: number;
}

export interface ReputationData {
  /** L2 uint256 agent ID (as string) */
  agentId: string;
  summaryValue: bigint;
  summaryValueDecimals: number;
  feedbackCount: bigint;
}

/**
 * Scan a chain's Identity Registry for new Registered events since `fromBlock`.
 * Real ERC-8004 event: Registered(uint256 indexed agentId, string agentURI, address indexed owner)
 */
export async function scanForNewAgents(
  provider: JsonRpcProvider,
  chainConfig: ChainConfig,
  fromBlock: number
): Promise<{ agents: DiscoveredAgent[]; latestBlock: number }> {
  const agents: DiscoveredAgent[] = [];

  try {
    const latestBlock = await provider.getBlockNumber();
    if (fromBlock > latestBlock) {
      return { agents, latestBlock };
    }

    const registry = new Contract(
      chainConfig.identityRegistry,
      L2_IDENTITY_REGISTRY_ABI,
      provider
    );

    let start = fromBlock;
    const baseChunkSize = chainConfig.chunkSize || GLOBAL_CHUNK_SIZE || DEFAULT_CHUNK_SIZE;
    let currentChunkSize = Math.max(MIN_CHUNK_SIZE, baseChunkSize);

    while (start <= latestBlock) {
      const end = Math.min(start + currentChunkSize - 1, latestBlock);

      let success = false;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // ... (lines 80-113) ...
        try {
          const events = await registry.queryFilter(
            registry.filters.Registered(),
            start,
            end
          );

          for (const event of events) {
            if ("args" in event && event.args) {
              const agentId = (event.args[0] as bigint).toString();
              const agentURI = event.args[1] as string;
              const ownerAddress = (event.args[2] as string).toLowerCase();
              agents.push({
                agentId,
                ownerAddress,
                agentURI,
                chainId: chainConfig.chainId,
                blockNumber: event.blockNumber,
              });
            }
          }
          success = true;
          break;
        } catch (err) {
          if (isRateLimitError(err) && attempt < MAX_RETRIES - 1) {
            const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
            log.warn(`[${chainConfig.name}] Rate limited on blocks ${start}-${end}, retrying in ${backoff}ms...`);
            await sleep(backoff);
          } else {
            log.warn(`[${chainConfig.name}] Failed to query events blocks ${start}-${end}:`, err);
            break;
          }
        }
      }

      if (!success) {
        if (currentChunkSize > MIN_CHUNK_SIZE) {
          const previous = currentChunkSize;
          currentChunkSize = Math.max(MIN_CHUNK_SIZE, Math.floor(currentChunkSize / 2));
          log.warn(
            `[${chainConfig.name}] Failed blocks ${start}-${end}; shrinking chunk ${previous} -> ${currentChunkSize} and retrying`
          );
          continue;
        }

        log.warn(
          `[${chainConfig.name}] Failed block ${start} even at min chunk size; skipping this block to continue progress`
        );
        start += 1;
        continue;
      }

      start = end + 1;
      if (currentChunkSize < baseChunkSize) {
        // Slowly recover chunk size after successful scans to improve throughput.
        currentChunkSize = Math.min(baseChunkSize, currentChunkSize * 2);
      }

      // Log progress every 100,000 blocks
      if (start % 100_000 === 0) {
        log.info(`[${chainConfig.name}] Scanned ${start - fromBlock} blocks (${start - 1}). Found ${agents.length} agents so far...`);
      }

      // Throttle between chunks to avoid rate limits
      if (start <= latestBlock) {
        const delay = chainConfig.scanDelay || DELAY_BETWEEN_CHUNKS_MS;
        await sleep(delay);
      }
    }

    log.info(`[${chainConfig.name}] Scanned blocks ${fromBlock}-${latestBlock}, found ${agents.length} new agents`);
    return { agents, latestBlock };
  } catch (err) {
    log.error(`[${chainConfig.name}] Failed to scan for agents:`, err);
    return { agents, latestBlock: fromBlock };
  }
}

/**
 * Read reputation data for a list of L2 agent IDs from a chain's Reputation Registry.
 * Calls getClients(agentId) first, then getSummary(agentId, clients, "", "") for unfiltered aggregate.
 */
export async function readReputations(
  provider: JsonRpcProvider,
  chainConfig: ChainConfig,
  agentIds: string[]
): Promise<ReputationData[]> {
  const results: ReputationData[] = [];

  if (agentIds.length === 0) return results;

  const registry = new Contract(
    chainConfig.reputationRegistry,
    L2_REPUTATION_REGISTRY_ABI,
    provider
  );

  // Throttle processing
  for (let i = 0; i < agentIds.length; i++) {
    const agentId = agentIds[i];
    let success = false;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // Get all clients for this agent
        const clients: string[] = [...await registry.getClients(BigInt(agentId))];

        // If no clients exist, agent has no feedback yet - skip getSummary
        if (clients.length === 0) {
          results.push({
            agentId,
            summaryValue: 0n,
            summaryValueDecimals: 0,
            feedbackCount: 0n,
          });
          success = true;
          break;
        }

        // Get unfiltered summary across all clients
        const [count, summaryValue, decimals] = await registry.getSummary(
          BigInt(agentId),
          clients,
          "",
          ""
        );

        results.push({
          agentId,
          summaryValue: summaryValue as bigint,
          summaryValueDecimals: Number(decimals),
          feedbackCount: count as bigint,
        });
        success = true;
        break;
      } catch (err: any) {
        if (isRateLimitError(err) && attempt < MAX_RETRIES - 1) {
          const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
          log.warn(`[${chainConfig.name}] Rate limited reading reputation for agent ${agentId}, retrying in ${backoff}ms...`);
          await sleep(backoff);
        } else {
          const msg = err?.message || err?.shortMessage || "";
          if (msg.includes("missing revert data") || err?.code === "CALL_EXCEPTION") {
            log.warn(`[${chainConfig.name}] Agent ${agentId}: Contract call reverted (not initialized or pruned data?)`);
          } else {
            log.warn(`[${chainConfig.name}] Failed to read reputation for agent ${agentId} after ${attempt + 1} attempts:`, err);
          }
          break;
        }
      }
    }

    if (!success) {
      log.warn(`[${chainConfig.name}] Skipping reputation for agent ${agentId} after ${MAX_RETRIES} attempts`);
    }

    // Throttle between items to avoid rate limits
    const delay = chainConfig.scanDelay ? Math.min(chainConfig.scanDelay, 200) : 50;
    await sleep(delay);
  }

  log.info(`[${chainConfig.name}] Read reputation for ${results.length}/${agentIds.length} agents`);
  return results;
}
