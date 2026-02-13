import "dotenv/config";
import fs from "fs";
import path from "path";
import { initDatabase, executeBatch, closeDatabase } from "../src/db.js";

// Load State
const STATE_FILE = path.join(process.cwd(), "state.json");

interface AgentRecord {
    masterAgentId: string;
    ownerAddress: string;
    globalAgentIds: string[];
    perChainAgentIds: Record<number, string>;
    chains: number[];
}

interface RelayerState {
    lastBlock: Record<number, number>;
    agents: Record<string, AgentRecord>;
}

async function main() {
    const accountId = process.env.CF_ACCOUNT_ID;
    const databaseId = process.env.D1_DATABASE_ID;
    const apiToken = process.env.CF_API_TOKEN;

    if (!accountId || !databaseId || !apiToken) {
        console.error("Missing env vars");
        return;
    }

    if (!fs.existsSync(STATE_FILE)) {
        console.error("state.json not found");
        return;
    }

    const state: RelayerState = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    const agents = Object.values(state.agents);
    console.log(`Loaded ${agents.length} agents from state.json`);

    initDatabase({ accountId, databaseId, apiToken });

    // We will batch insert agents using INSERT OR IGNORE
    // Schema: master_agent_id, owner_address, registered_at, first_seen_block, first_seen_chain, ...
    // We only have master_agent_id, owner_address. Others can be NULL or default.

    const stmts: { sql: string; params: unknown[] }[] = [];
    let count = 0;

    for (const agent of agents) {
        if (!agent.masterAgentId) {
            console.warn(`Skipping agent with no masterId: ${agent.ownerAddress}`);
            continue;
        }

        stmts.push({
            sql: `INSERT OR IGNORE INTO agents (master_agent_id, owner_address, registered_at) VALUES (?, ?, unixepoch())`,
            params: [agent.masterAgentId, agent.ownerAddress]
        });
        count++;

        if (stmts.length >= 50) {
            console.log(`Flushing batch of ${stmts.length}...`);
            await executeBatch(stmts);
            stmts.length = 0;
        }
    }

    if (stmts.length > 0) {
        console.log(`Flushing final batch of ${stmts.length}...`);
        await executeBatch(stmts);
    }

    console.log(`Repair complete. Processed ${count} agents.`);
}

main();
