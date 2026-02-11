import { PublicKey } from "@solana/web3.js";
import { BorshCoder, EventParser } from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import { log } from "./logger.js";

// ── SATI event types ─────────────────────────────────────────────────────

export interface AgentRegisteredEvent {
  type: "AgentRegistered";
  mint: string;
  owner: string;
  memberNumber: number;
  name: string;
  uri: string;
  nonTransferable: boolean;
  slot: number;
  txSignature: string;
}

export interface AttestationCreatedEvent {
  type: "AttestationCreated";
  sasSchema: string;
  agentMint: string;
  counterparty: string;
  storageType: string;
  address: string;
  slot: number;
  txSignature: string;
}

export interface EvmAddressLinkedEvent {
  type: "EvmAddressLinked";
  agentMint: string;
  evmAddress: string;
  chainId: string;
  linkedAt: number;
  slot: number;
  txSignature: string;
}

export type SatiEvent = AgentRegisteredEvent | AttestationCreatedEvent | EvmAddressLinkedEvent;

// ── Real SATI IDL (fetched from mainnet program) ─────────────────────────
//
// Discriminators and field layouts match the deployed program at
// satiRkxEiwZ51cv8PRu8UMzuaqeaNU9jABo6oAFMsLe.

const SATI_IDL: Idl = {
  address: "satiRkxEiwZ51cv8PRu8UMzuaqeaNU9jABo6oAFMsLe",
  metadata: { name: "sati", version: "1.0.0", spec: "0.1.0" },
  instructions: [],
  events: [
    { name: "AgentRegistered",    discriminator: [191, 78, 217, 54, 232, 100, 189, 85] },
    { name: "AttestationCreated", discriminator: [217, 170, 19, 203, 128, 51, 29, 163] },
    { name: "EvmAddressLinked",   discriminator: [25, 224, 124, 209, 25, 240, 102, 194] },
  ],
  types: [
    {
      name: "AgentRegistered",
      type: {
        kind: "struct",
        fields: [
          { name: "mint", type: "pubkey" },
          { name: "owner", type: "pubkey" },
          { name: "member_number", type: "u64" },
          { name: "name", type: "string" },
          { name: "uri", type: "string" },
          { name: "non_transferable", type: "bool" },
        ],
      },
    },
    {
      name: "AttestationCreated",
      type: {
        kind: "struct",
        fields: [
          { name: "sas_schema", type: "pubkey" },
          { name: "agent_mint", type: "pubkey" },
          { name: "counterparty", type: "pubkey" },
          { name: "storage_type", type: { defined: { name: "StorageType" } } },
          { name: "address", type: "pubkey" },
        ],
      },
    },
    {
      name: "EvmAddressLinked",
      type: {
        kind: "struct",
        fields: [
          { name: "agent_mint", type: "pubkey" },
          { name: "evm_address", type: { array: ["u8", 20] } },
          { name: "chain_id", type: "string" },
          { name: "linked_at", type: "i64" },
        ],
      },
    },
    {
      name: "StorageType",
      type: {
        kind: "enum",
        variants: [
          { name: "Compressed" },
          { name: "Regular" },
        ],
      },
    },
  ],
};

let eventParserInstance: EventParser | null = null;

function getEventParser(): EventParser {
  if (!eventParserInstance) {
    const coder = new BorshCoder(SATI_IDL);
    eventParserInstance = new EventParser(
      new PublicKey(SATI_IDL.address),
      coder
    );
  }
  return eventParserInstance;
}

/**
 * Parse SATI Anchor events from transaction log messages.
 */
export function parseSatiEvents(
  logs: string[],
  slot: number,
  txSignature: string
): SatiEvent[] {
  const parser = getEventParser();
  const events: SatiEvent[] = [];

  try {
    const parsed = parser.parseLogs(logs);
    for (const event of parsed) {
      switch (event.name) {
        case "AgentRegistered": {
          // Real IDL uses snake_case field names
          const d = event.data as {
            mint: PublicKey;
            owner: PublicKey;
            // eslint-disable-next-line @typescript-eslint/naming-convention
            member_number: { toNumber?: () => number };
            name: string;
            uri: string;
            // eslint-disable-next-line @typescript-eslint/naming-convention
            non_transferable: boolean;
          };
          events.push({
            type: "AgentRegistered",
            mint: d.mint.toBase58(),
            owner: d.owner.toBase58(),
            memberNumber: typeof d.member_number === "object" && d.member_number.toNumber
              ? d.member_number.toNumber()
              : Number(d.member_number),
            name: d.name,
            uri: d.uri,
            nonTransferable: d.non_transferable,
            slot,
            txSignature,
          });
          break;
        }
        case "AttestationCreated": {
          const d = event.data as {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            sas_schema: PublicKey;
            // eslint-disable-next-line @typescript-eslint/naming-convention
            agent_mint: PublicKey;
            counterparty: PublicKey;
            // eslint-disable-next-line @typescript-eslint/naming-convention
            storage_type: { compressed?: Record<string, never>; regular?: Record<string, never> };
            address: PublicKey;
          };
          // Anchor decodes enums as objects like { compressed: {} } or { regular: {} }
          const storageType = d.storage_type.compressed !== undefined ? "Compressed" : "Regular";
          events.push({
            type: "AttestationCreated",
            sasSchema: d.sas_schema.toBase58(),
            agentMint: d.agent_mint.toBase58(),
            counterparty: d.counterparty.toBase58(),
            storageType,
            address: d.address.toBase58(),
            slot,
            txSignature,
          });
          break;
        }
        case "EvmAddressLinked": {
          const d = event.data as {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            agent_mint: PublicKey;
            // eslint-disable-next-line @typescript-eslint/naming-convention
            evm_address: number[];
            // eslint-disable-next-line @typescript-eslint/naming-convention
            chain_id: string;
            // eslint-disable-next-line @typescript-eslint/naming-convention
            linked_at: { toNumber?: () => number };
          };
          const evmHex = "0x" + Buffer.from(d.evm_address).toString("hex");
          events.push({
            type: "EvmAddressLinked",
            agentMint: d.agent_mint.toBase58(),
            evmAddress: evmHex,
            chainId: d.chain_id,
            linkedAt: typeof d.linked_at === "object" && d.linked_at.toNumber
              ? d.linked_at.toNumber()
              : Number(d.linked_at),
            slot,
            txSignature,
          });
          break;
        }
        default:
          log.warn(`Unknown SATI event: ${event.name}`);
      }
    }
  } catch (err) {
    log.warn(`Failed to parse events from tx ${txSignature}:`, err);
  }

  return events;
}
