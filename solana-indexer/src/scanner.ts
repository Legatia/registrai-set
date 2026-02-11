import {
  Connection,
  PublicKey,
  type ConfirmedSignatureInfo,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";
import { parseSatiEvents, type SatiEvent } from "./parser.js";
import { log } from "./logger.js";

const BATCH_SIZE = 50;
const DELAY_BETWEEN_TX_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch new transaction signatures for the SATI program since the last cursor.
 * Returns signatures in chronological order (oldest first).
 */
export async function scanNewSignatures(
  connection: Connection,
  programId: PublicKey,
  lastSignature: string | null
): Promise<ConfirmedSignatureInfo[]> {
  const allSigs: ConfirmedSignatureInfo[] = [];
  let before: string | undefined = undefined;
  let done = false;

  // getSignaturesForAddress returns newest-first. We page backwards until
  // we hit lastSignature or run out of results.
  while (!done) {
    const options: { limit: number; before?: string; until?: string } = {
      limit: 1000,
    };
    if (before) options.before = before;
    if (lastSignature) options.until = lastSignature;

    const sigs = await connection.getSignaturesForAddress(programId, options);

    if (sigs.length === 0) {
      done = true;
      break;
    }

    allSigs.push(...sigs);
    before = sigs[sigs.length - 1].signature;

    // If we got fewer than limit, we've reached the end
    if (sigs.length < 1000) {
      done = true;
    }
  }

  // Reverse to chronological order (oldest first)
  allSigs.reverse();

  // Filter out errored transactions
  return allSigs.filter((s) => s.err === null);
}

/**
 * Fetch and parse events from a batch of transaction signatures.
 */
export async function parseTransactionBatch(
  connection: Connection,
  signatures: ConfirmedSignatureInfo[]
): Promise<SatiEvent[]> {
  const allEvents: SatiEvent[] = [];

  for (let i = 0; i < signatures.length; i += BATCH_SIZE) {
    const batch = signatures.slice(i, i + BATCH_SIZE);

    for (const sigInfo of batch) {
      try {
        const tx = await connection.getTransaction(sigInfo.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx?.meta?.logMessages) continue;

        const events = parseSatiEvents(
          tx.meta.logMessages,
          tx.slot,
          sigInfo.signature
        );

        allEvents.push(...events);
      } catch (err) {
        log.warn(`Failed to fetch tx ${sigInfo.signature}:`, err);
      }

      if (i + batch.indexOf(sigInfo) < signatures.length - 1) {
        await sleep(DELAY_BETWEEN_TX_MS);
      }
    }
  }

  return allEvents;
}

/**
 * Fetch a single account's data (for reading attestation outcome).
 * Returns the raw account data buffer, or null if not found.
 */
export async function fetchAccountData(
  connection: Connection,
  address: PublicKey
): Promise<Buffer | null> {
  const info = await connection.getAccountInfo(address);
  if (!info) return null;
  return info.data;
}
