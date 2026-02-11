import * as fs from "node:fs";
import * as path from "node:path";
import { log } from "./logger.js";

export interface AgentRecord {
  /** bytes32 hex — keccak256(globalAgentId), computed locally */
  masterAgentId: string;
  /** Wallet address from L2 Identity Registry */
  ownerAddress: string;
  /** 4-segment global agent IDs registered on L1 */
  globalAgentIds: string[];
  /** chainId → L2 uint256 agentId (as string for JSON serialization) */
  perChainAgentIds: Record<number, string>;
  /** Chain IDs where this agent has been seen */
  chains: number[];
}

export interface RelayerState {
  /** Last scanned block per chainId */
  lastBlock: Record<number, number>;
  /** Known agents keyed by ownerAddress (lowercase) */
  agents: Record<string, AgentRecord>;
}

const DEFAULT_STATE: RelayerState = {
  lastBlock: {},
  agents: {},
};

export function loadState(filePath: string): RelayerState {
  try {
    if (!fs.existsSync(filePath)) {
      log.info("No state file found, starting fresh");
      return structuredClone(DEFAULT_STATE);
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as RelayerState;
    log.info(`Loaded state: ${Object.keys(parsed.agents).length} agents, blocks: ${JSON.stringify(parsed.lastBlock)}`);
    return parsed;
  } catch (err) {
    log.warn("Failed to load state, starting fresh:", err);
    return structuredClone(DEFAULT_STATE);
  }
}

export function saveState(filePath: string, state: RelayerState): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Atomic write: write to tmp file, then rename
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}
