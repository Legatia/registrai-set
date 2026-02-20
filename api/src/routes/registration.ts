import { Hono } from "hono";
import { ethers } from "ethers";
import { getChainName, getIdentityRegistry, isIdentityChain } from "../chains.js";
import type { AppEnv } from "../env.js";

export const registrationRoutes = new Hono<AppEnv>();

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const REGISTER_ABI = [
  "function register(string agentURI) returns (uint256 agentId)",
];
const registerIface = new ethers.Interface(REGISTER_ABI);

registrationRoutes.post("/agents/register/build", async (c) => {
  let body: { chainId: number; agentURI: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { chainId, agentURI } = body;
  if (chainId === undefined || !agentURI?.trim()) {
    return c.json({ error: "Missing required fields: chainId, agentURI" }, 400);
  }
  if (typeof chainId !== "number") {
    return c.json({ error: "chainId must be a number" }, 400);
  }
  if (!isIdentityChain(chainId)) {
    return c.json({ error: `Chain ${chainId} is not supported for registration` }, 400);
  }

  const to = getIdentityRegistry(chainId);
  if (!to) {
    return c.json({ error: "Identity registry not configured for this chain" }, 500);
  }

  const data = registerIface.encodeFunctionData("register", [agentURI.trim()]);
  return c.json({
    chainId,
    chainName: getChainName(chainId),
    to,
    data,
    functionName: "register",
  });
});

registrationRoutes.post("/agents/register/confirm", async (c) => {
  let body: { chainId: number; txHash: string; walletAddress: string; agentURI?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { chainId, txHash, walletAddress, agentURI } = body;
  if (chainId === undefined || !txHash || !walletAddress) {
    return c.json({ error: "Missing required fields: chainId, txHash, walletAddress" }, 400);
  }
  if (typeof chainId !== "number") {
    return c.json({ error: "chainId must be a number" }, 400);
  }
  if (!isIdentityChain(chainId)) {
    return c.json({ error: `Chain ${chainId} is not supported for registration` }, 400);
  }
  if (!TX_HASH_RE.test(txHash)) {
    return c.json({ error: "txHash must be a valid transaction hash (0x + 64 hex)" }, 400);
  }
  if (!EVM_ADDRESS_RE.test(walletAddress)) {
    return c.json({ error: "walletAddress must be a valid EVM address" }, 400);
  }

  try {
    await c.env.DB
      .prepare(
        `INSERT INTO registration_submissions (chain_id, wallet_address, tx_hash, agent_uri, status, updated_at)
         VALUES (?, ?, ?, ?, 'submitted', unixepoch())
         ON CONFLICT(chain_id, tx_hash) DO UPDATE SET
           wallet_address = excluded.wallet_address,
           agent_uri = excluded.agent_uri,
           updated_at = unixepoch()`
      )
      .bind(chainId, walletAddress.toLowerCase(), txHash, (agentURI || "").trim())
      .run();
  } catch {
    return c.json({ error: "Failed to persist registration submission" }, 500);
  }

  return c.json({
    message: "Registration transaction recorded",
    chainId,
    txHash,
    walletAddress: walletAddress.toLowerCase(),
  });
});
