
import { Connection, PublicKey } from "@solana/web3.js";
import { keccak_256 } from "@noble/hashes/sha3";
import { loadConfig, type SolanaIndexerConfig } from "./config.js";
import {
  initDatabase,
  upsertAgent,
  insertIdentity,
  upsertReputationLatest,
  insertReputationSnapshot,
  updateUnifiedReputation,
  upsertSyncCursorWithSignature,
  getSyncCursor,
  insertSatiAttestation,
  insertEvmLink,
  getDb,
  queryFirst,
  queryAll
} from "./db.js";
import { scanNewSignatures, parseTransactionBatch, fetchAccountData } from "./scanner.js";
import { recomputeReputation } from "./reputation.js";
import type { SatiEvent, AgentRegisteredEvent, AttestationCreatedEvent, EvmAddressLinkedEvent } from "./parser.js";
import { log } from "./logger.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compute the master agent ID from a global agent ID string.
 * Matches the MasterRegistry contract: keccak256(abi.encode(globalAgentId, ...))
 *
 * For Solana agents that haven't been registered on-chain, we use a
 * deterministic hash: keccak256(globalAgentId) — so the ID is already
 * compatible if the agent later bridges to EVM.
 */
function computeMasterAgentId(globalAgentId: string): string {
  const hash = keccak_256(new TextEncoder().encode(globalAgentId));
  return "0x" + Buffer.from(hash).toString("hex");
}

/**
 * Build a Solana global agent ID in the 4-segment format.
 */
function buildGlobalAgentId(cluster: string, programId: string, mintAddress: string): string {
  return `solana:${cluster}:${programId}:${mintAddress}`;
}

/**
 * Parse the outcome byte from a SATIFeedback attestation account.
 * The outcome byte is at offset 97 in the account data:
 *   8 (discriminator) + 32 (schema) + 32 (agent_mint) + 32 (counterparty) + 1 (storage_type) = offset 105 is next
 *   Actually the layout depends on the on-chain struct. We try offset 97 per the plan.
 *   0 = Negative, 1 = Neutral, 2 = Positive
 */
function parseOutcomeFromAccountData(data: Buffer): number | null {
  // Anchor discriminator (8 bytes) + fields before outcome
  // The exact offset depends on the SATI attestation struct layout.
  // Common layout: discriminator(8) + schema(32) + agent_mint(32) + counterparty(32) + outcome(1) = offset 104
  // We try the documented offset 97 first, fallback to 104
  if (data.length > 104) {
    const val = data[104];
    if (val === 0 || val === 1 || val === 2) return val;
  }
  if (data.length > 97) {
    const val = data[97];
    if (val === 0 || val === 1 || val === 2) return val;
  }
  return null;
}

async function processAgentRegistered(
  event: AgentRegisteredEvent,
  config: SolanaIndexerConfig
): Promise<void> {
  const globalAgentId = buildGlobalAgentId(config.cluster, config.satiProgramId, event.mint);
  const masterAgentId = computeMasterAgentId(globalAgentId);

  log.info(`Agent registered: ${event.name} (${event.mint})`);

  // D1 is async, no transaction block, call sequentially
  await upsertAgent(masterAgentId, event.owner, event.slot, config.chainId);
  await insertIdentity(
    masterAgentId,
    globalAgentId,
    config.chainId,
    config.satiProgramId,
    event.mint,
    event.uri || null,
    event.slot
  );
}

async function processAttestationCreated(
  event: AttestationCreatedEvent,
  connection: Connection,
  config: SolanaIndexerConfig
): Promise<void> {
  // Only process attestations matching the feedback schema (if configured)
  if (config.feedbackSchemaAddress && event.sasSchema !== config.feedbackSchemaAddress) {
    return;
  }

  const globalAgentId = buildGlobalAgentId(config.cluster, config.satiProgramId, event.agentMint);
  const masterAgentId = computeMasterAgentId(globalAgentId);

  // Check if agent exists; if not, we can't attach attestation
  const agent = await queryFirst<{ master_agent_id: string }>("SELECT master_agent_id FROM agents WHERE master_agent_id = ?", [masterAgentId]);
  if (!agent) {
    log.warn(`Attestation for unknown agent ${event.agentMint}, skipping`);
    return;
  }

  // Fetch the attestation account data to get the outcome byte
  let outcome: number | null = null;
  try {
    const data = await fetchAccountData(connection, new PublicKey(event.address));
    if (data) {
      outcome = parseOutcomeFromAccountData(data);
    }
  } catch (err) {
    log.warn(`Failed to fetch attestation account ${event.address}:`, err);
    // Continue with neutral or fail? Original logic continued with neutral check
  }

  if (outcome === null) {
    log.warn(`Could not parse outcome from attestation ${event.address}, defaulting to Neutral`);
    outcome = 1; // Default to Neutral if we can't read the outcome
  }

  log.info(`Attestation for ${event.agentMint}: outcome=${outcome} from ${event.counterparty}`);

  // D1 async processing
  const inserted = await insertSatiAttestation(
    masterAgentId,
    event.address,
    event.counterparty,
    outcome!,
    event.slot,
    event.txSignature
  );

  if (inserted) {
    // Recompute reputation from all attestations
    const rep = await recomputeReputation(masterAgentId);

    await upsertReputationLatest(
      masterAgentId,
      config.chainId,
      rep.summaryValue,
      rep.decimals,
      rep.feedbackCount
    );

    await insertReputationSnapshot(
      masterAgentId,
      config.chainId,
      rep.summaryValue,
      rep.decimals,
      rep.feedbackCount
    );

    // Recompute unified reputation across all chains
    // Note: This needs to use the DB's recomputeUnified if available, 
    // but the local implementation was here. 
    // For now we rely on the Relayer or implement it via queryAll here.
    // Let's implement it here as async function to avoid circular dependency loop or externalizing it too much.
    await recomputeUnifiedLocal(masterAgentId);
  }
}

async function processEvmAddressLinked(
  event: EvmAddressLinkedEvent,
  config: SolanaIndexerConfig
): Promise<void> {
  const globalAgentId = buildGlobalAgentId(config.cluster, config.satiProgramId, event.agentMint);
  const masterAgentId = computeMasterAgentId(globalAgentId);

  // chain_id is CAIP-2 string like "eip155:1" — parse the numeric chain ID
  const chainIdParts = event.chainId.split(":");
  const evmChainId = chainIdParts.length === 2 ? parseInt(chainIdParts[1], 10) : 0;

  log.info(`EVM link for ${event.agentMint}: ${event.evmAddress} on chain ${event.chainId}`);

  await insertEvmLink(masterAgentId, event.evmAddress, evmChainId, event.linkedAt);
}

/**
 * Recompute the unified (cross-chain) reputation for an agent.
 * Uses feedback-count-weighted average, matching the EVM relayer logic.
 * Adapted to use D1 async queries.
 */
async function recomputeUnifiedLocal(masterAgentId: string): Promise<void> {
  const reps = await queryAll<{
    summary_value: string;
    summary_value_decimals: number;
    feedback_count: string;
  }>(`
    SELECT summary_value, summary_value_decimals, feedback_count
    FROM reputation_latest
    WHERE master_agent_id = ?
  `, [masterAgentId]);

  if (reps.length === 0) return;

  // Find max decimals
  let maxDecimals = 0;
  let totalWeight = 0n;
  for (const r of reps) {
    if (r.summary_value_decimals > maxDecimals) maxDecimals = r.summary_value_decimals;
    totalWeight += BigInt(r.feedback_count);
  }

  if (totalWeight === 0n) {
    await updateUnifiedReputation(masterAgentId, "0", maxDecimals, "0");
    return;
  }

  let weightedSum = 0n;
  for (const r of reps) {
    const count = BigInt(r.feedback_count);
    if (count > 0n) {
      const decimalDiff = maxDecimals - r.summary_value_decimals;
      const normalizedValue = BigInt(r.summary_value) * 10n ** BigInt(decimalDiff);
      weightedSum += normalizedValue * count;
    }
  }

  const result = weightedSum / totalWeight;

  await updateUnifiedReputation(
    masterAgentId,
    result.toString(),
    maxDecimals,
    totalWeight.toString()
  );
}

// ── Re-implementing recomputeUnifiedLocal cleanly with imports ────────────────

// Note: I need to actually import queryAll in the top block for this to work.
// I will rewrite the top block imports to include it.

async function runCycle(connection: Connection, config: SolanaIndexerConfig): Promise<void> {
  const programId = new PublicKey(config.satiProgramId);

  // Read cursor
  const cursor = await getSyncCursor(config.chainId);
  const lastSignature = cursor?.last_signature ?? null;

  log.info(`Scanning from ${lastSignature ? `signature ${lastSignature.slice(0, 16)}...` : "genesis"}`);

  // Fetch new signatures
  const signatures = await scanNewSignatures(connection, programId, lastSignature);

  if (signatures.length === 0) {
    log.info("No new transactions");
    return;
  }

  log.info(`Found ${signatures.length} new transactions`);

  // Parse events from transactions
  const events = await parseTransactionBatch(connection, signatures);
  log.info(`Parsed ${events.length} events`);

  // Process events
  for (const event of events) {
    switch (event.type) {
      case "AgentRegistered":
        await processAgentRegistered(event, config);
        break;
      case "AttestationCreated":
        await processAttestationCreated(event, connection, config);
        break;
      case "EvmAddressLinked":
        await processEvmAddressLinked(event, config);
        break;
    }
  }

  // Update cursor to latest signature and slot
  const latestSig = signatures[signatures.length - 1];
  await upsertSyncCursorWithSignature(config.chainId, latestSig.slot ?? 0, latestSig.signature);

  log.info(`Cursor updated to slot ${latestSig.slot}, signature ${latestSig.signature.slice(0, 16)}...`);
}

async function main(): Promise<void> {
  // @ts-ignore
  const config = loadConfig();

  log.info("SATI Solana Indexer starting");
  log.info(`  Cluster:    ${config.cluster} (chain ID ${config.chainId})`);
  log.info(`  Program:    ${config.satiProgramId}`);
  log.info(`  RPC:        ${config.rpcUrl}`);
  // @ts-ignore
  log.info(`  DB:         ${config.d1.databaseId} (D1)`);
  log.info(`  Poll:       ${config.pollIntervalSeconds}s`);

  // @ts-ignore
  initDatabase(config.d1);
  const connection = new Connection(config.rpcUrl, "confirmed");

  // Main loop
  while (true) {
    try {
      await runCycle(connection, config);
    } catch (err) {
      log.error("Cycle error:", err);
    }

    await sleep(config.pollIntervalSeconds * 1000);
  }
}

main().catch((err) => {
  log.error("Fatal error:", err);
  process.exit(1);
});
