import { JsonRpcProvider, keccak256, toUtf8Bytes } from "ethers";
import { loadConfig, ChainConfig } from "./config.js";
import { loadState, saveState, RelayerState } from "./state.js";
import { scanForNewAgents, readReputations } from "./scanner.js";
import { log } from "./logger.js";
import {
  initDatabase,
  closeDatabase,
  upsertAgent,
  insertIdentity,
  upsertReputationLatest,
  insertReputationSnapshot,
  updateUnifiedReputation,
  updateSyncCursor,
  queryFirst,
  queryAll,
  executeBatch,
  buildUpsertAgentStmt,
  buildInsertIdentityStmt
} from "./db.js";
import { computeWeightedAverage, ChainReputation } from "./score-calculator.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a 4-segment global agent ID: eip155:{chainId}:{registryAddress}:{agentId}
 */
function toGlobalAgentId(chainId: number, registryAddress: string, agentId: string): string {
  return `eip155:${chainId}:${registryAddress}:${agentId}`;
}

async function main(): Promise<void> {
  log.info("Starting ERC-8004 Indexer...");

  // Load config
  const config = loadConfig();
  log.info(`Poll interval: ${config.pollIntervalSeconds}s`);

  // CLI Argument Filtering: --chain <id|name> (supports multiple)
  const filters: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === "--chain" && process.argv[i + 1]) {
      filters.push(process.argv[i + 1].toLowerCase());
    }
  }

  if (filters.length > 0) {
    const originalCount = config.chains.length;
    config.chains = config.chains.filter((c) =>
      filters.some(f => c.chainId.toString() === f || c.name.toLowerCase().includes(f))
    );

    if (config.chains.length === 0) {
      log.error(`No chains found matching filters: ${filters.join(", ")}`);
      process.exit(1);
    }

    log.info(`Filtered chains: ${config.chains.length}/${originalCount} selected`);
  }

  log.info(`Chains: ${config.chains.map((c) => `${c.name} (${c.chainId})`).join(", ")}`);

  // Create L2 providers
  const l2Providers = new Map<number, JsonRpcProvider>();
  for (const chain of config.chains) {
    l2Providers.set(chain.chainId, new JsonRpcProvider(chain.rpcUrl));
  }

  // Load state (local file for block cursors)
  let state = loadState(config.stateFilePath);

  // Initialize D1 database connection
  initDatabase(config.d1);

  // Periodic state saver (every 30s)
  const saveInterval = setInterval(() => {
    log.info("Saving state...");
    saveState(config.stateFilePath, state);
  }, 30000);

  // Graceful shutdown
  let running = true;
  const shutdown = () => {
    log.info("Shutting down...");
    running = false;
    clearInterval(saveInterval);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // ── Main Loop ──────────────────────────────────────────────────────
  while (running) {
    try {
      await runCycle(config.chains, l2Providers, state, config.stateFilePath);
    } catch (err) {
      log.error("Cycle failed:", err);
    }

    if (!running) break;
    log.info(`Sleeping ${config.pollIntervalSeconds}s...`);
    await sleep(config.pollIntervalSeconds * 1000);
  }

  // Final save
  saveState(config.stateFilePath, state);
  closeDatabase();
  log.info("Indexer stopped. State saved.");
}

async function processChain(
  chain: ChainConfig,
  provider: JsonRpcProvider,
  state: RelayerState
): Promise<{ newRegistrations: number; updatedAgentIds: string[] }> {
  let newRegistrations = 0;
  const updatedAgentIds: string[] = [];

  try {
    // ── Step 1: Scan for new agents ──────────────────────────────────────
    const fromBlock = (state.lastBlock[chain.chainId] ?? (chain.fromBlock || 0)) + 1;
    const { agents, latestBlock } = await scanForNewAgents(provider, chain, fromBlock);

    // Update cursor immediately in memory (safe in JS single thread)
    state.lastBlock[chain.chainId] = latestBlock;
    await updateSyncCursor(chain.chainId, latestBlock);

    // Process agents for THIS chain
    const chainDiscoveries: Array<{
      ownerAddress: string;
      chainId: number;
      l2AgentId: string;
      registryAddress: string;
      agentUri: string;
      blockNumber: number;
    }> = [];

    for (const agent of agents) {
      const ownerAddr = agent.ownerAddress.toLowerCase();

      // Check if we already know this owner (in-memory)
      if (!state.agents[ownerAddr]) {
        // New discovery
        chainDiscoveries.push({
          ownerAddress: ownerAddr,
          chainId: chain.chainId,
          l2AgentId: agent.agentId,
          registryAddress: chain.identityRegistry,
          agentUri: agent.agentURI,
          blockNumber: agent.blockNumber,
        });
      } else if (!state.agents[ownerAddr].chains.includes(chain.chainId)) {
        // Known owner, new chain
        state.agents[ownerAddr].chains.push(chain.chainId);
        state.agents[ownerAddr].perChainAgentIds[chain.chainId] = agent.agentId;

        chainDiscoveries.push({
          ownerAddress: ownerAddr,
          chainId: chain.chainId,
          l2AgentId: agent.agentId,
          registryAddress: chain.identityRegistry,
          agentUri: agent.agentURI,
          blockNumber: agent.blockNumber,
        });
      }
    }

    // Database batching for discoveries
    const BATCH_SIZE = 50;
    const pendingStmts: { sql: string; params: unknown[] }[] = [];

    for (const disc of chainDiscoveries) {
      const globalAgentId = toGlobalAgentId(disc.chainId, disc.registryAddress, disc.l2AgentId);
      const computedMasterAgentId = keccak256(toUtf8Bytes(globalAgentId));
      let masterAgentId = computedMasterAgentId;

      // Double-check DB if not in memory (handle restarts)
      if (!state.agents[disc.ownerAddress]) {
        // NOTE: This query is async. In a highly concurrent race (same owner on 2 chains processed exactly simultaneously),
        // both might query and find nothing. One will fail insert on constraint (if unique owner).
        // This is acceptable risk for now.
        const existingRow = await queryFirst<{ master_agent_id: string }>(
          "SELECT master_agent_id FROM agents WHERE owner_address = ?",
          [disc.ownerAddress]
        );
        if (existingRow) {
          masterAgentId = existingRow.master_agent_id;
        }
      } else if (state.agents[disc.ownerAddress].masterAgentId) {
        masterAgentId = state.agents[disc.ownerAddress].masterAgentId;
      }

      // Update in-memory state
      if (!state.agents[disc.ownerAddress]) {
        state.agents[disc.ownerAddress] = {
          masterAgentId,
          ownerAddress: disc.ownerAddress,
          globalAgentIds: [globalAgentId],
          perChainAgentIds: { [disc.chainId]: disc.l2AgentId },
          chains: [disc.chainId],
        };
      } else {
        const record = state.agents[disc.ownerAddress];
        if (!record.masterAgentId) record.masterAgentId = masterAgentId;
        if (!record.globalAgentIds.includes(globalAgentId)) record.globalAgentIds.push(globalAgentId);
        record.perChainAgentIds[disc.chainId] = disc.l2AgentId;
        if (!record.chains.includes(disc.chainId)) record.chains.push(disc.chainId);
      }

      // Add to batch
      pendingStmts.push(buildUpsertAgentStmt(masterAgentId, disc.ownerAddress, disc.blockNumber, disc.chainId));
      pendingStmts.push(buildInsertIdentityStmt(
        masterAgentId,
        globalAgentId,
        disc.chainId,
        disc.registryAddress,
        disc.l2AgentId,
        disc.agentUri || null,
        disc.blockNumber
      ));

      newRegistrations++;
      updatedAgentIds.push(masterAgentId);
      log.info(`[${chain.name}] Queuing agent: ${globalAgentId}`);

      if (pendingStmts.length >= BATCH_SIZE * 2) {
        log.info(`[${chain.name}] Flushing batch of ${pendingStmts.length} statements...`);
        try {
          await executeBatch(pendingStmts);
        } catch (e) {
          const err = e as Error;
          log.error(`[${chain.name}] Batch flush failed: ${err.message}`);
        }
        pendingStmts.length = 0;
      }
    }

    if (pendingStmts.length > 0) {
      log.info(`[${chain.name}] Flushing final batch of ${pendingStmts.length} statements...`);
      try {
        await executeBatch(pendingStmts);
      } catch (e) {
        const err = e as Error;
        log.error(`[${chain.name}] Final batch flush failed: ${err.message}`);
      }
    }

    // ── Step 2: Read reputation ──────────────────────────────────────────
    const l2AgentIds: string[] = [];
    const l2IdToOwner = new Map<string, string>();

    for (const [ownerAddr, record] of Object.entries(state.agents)) {
      const l2Id = record.perChainAgentIds[chain.chainId];
      if (l2Id && record.masterAgentId) {
        l2AgentIds.push(l2Id);
        l2IdToOwner.set(l2Id, ownerAddr);
      }
    }

    if (l2AgentIds.length > 0) {
      const repData = await readReputations(provider, chain, l2AgentIds);

      for (const rep of repData) {
        const ownerAddr = l2IdToOwner.get(rep.agentId);
        if (!ownerAddr) continue;
        const record = state.agents[ownerAddr];
        if (!record?.masterAgentId) continue;

        // Write to D1 (fire and forget await, or blocking?)
        // Better to await to ensure consistency before next cycle
        const sv = rep.summaryValue.toString();
        const fc = rep.feedbackCount.toString();
        await insertReputationSnapshot(record.masterAgentId, chain.chainId, sv, rep.summaryValueDecimals, fc);
        await upsertReputationLatest(record.masterAgentId, chain.chainId, sv, rep.summaryValueDecimals, fc);

        updatedAgentIds.push(record.masterAgentId);
      }
    }

  } catch (err) {
    log.error(`[${chain.name}] Process failed:`, err);
  }

  return { newRegistrations, updatedAgentIds };
}

async function runCycle(
  chains: ChainConfig[],
  l2Providers: Map<number, JsonRpcProvider>,
  state: RelayerState,
  stateFilePath: string
): Promise<void> {
  // Run all chains in parallel
  log.info(`Starting new cycle for ${chains.length} chains...`);

  const results = await Promise.allSettled(chains.map(chain => {
    const provider = l2Providers.get(chain.chainId)!;
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timed out after 300s")), 300_000)
    );
    return Promise.race([
      processChain(chain, provider, state),
      timeout
    ]);
  }));

  // Aggregate results for Unified Reputation calculation
  let totalNew = 0;
  const allUpdatedMasterIds = new Set<string>();

  results.forEach((res, index) => {
    const chain = chains[index];
    if (res.status === "fulfilled") {
      totalNew += res.value.newRegistrations;
      res.value.updatedAgentIds.forEach(id => allUpdatedMasterIds.add(id));
    } else {
      log.error(`[${chain.name}] Cycle failed:`, res.reason);
    }
  });

  // ── Step 3: Recompute unified reputation for impacted agents ──────────
  if (allUpdatedMasterIds.size > 0) {
    log.info(`Recomputing unified reputation for ${allUpdatedMasterIds.size} agents...`);
    for (const masterAgentId of allUpdatedMasterIds) {
      try {
        const rows = await queryAll<{
          summary_value: string;
          summary_value_decimals: number;
          feedback_count: string;
        }>(
          "SELECT summary_value, summary_value_decimals, feedback_count FROM reputation_latest WHERE master_agent_id = ?",
          [masterAgentId]
        );

        const chainReps: ChainReputation[] = rows.map((r) => ({
          summaryValue: BigInt(r.summary_value),
          summaryValueDecimals: r.summary_value_decimals,
          feedbackCount: BigInt(r.feedback_count),
        }));

        const unified = computeWeightedAverage(chainReps);
        await updateUnifiedReputation(
          masterAgentId,
          unified.unifiedValue.toString(),
          unified.decimals,
          unified.totalCount.toString()
        );
      } catch (err) {
        log.error(`Failed to recompute unified reputation for ${masterAgentId}:`, err);
      }
    }
  }

  log.info(
    `Cycle complete: ${totalNew} new agents indexed, ${allUpdatedMasterIds.size} unified score updates`
  );
}

main().catch((err) => {
  log.error("Fatal error:", err);
  process.exit(1);
});
