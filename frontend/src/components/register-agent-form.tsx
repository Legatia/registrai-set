"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getChainName, getExplorerUrl } from "@/lib/chains";
import { shortenHex } from "@/lib/format";
import { IDENTITY_REGISTRIES } from "@/lib/reputation";
import {
  connectWallet,
  switchChain,
  sendTransaction,
  onAccountsChanged,
  onChainChanged,
} from "@/lib/wallet";
import { useNetwork } from "@/lib/network-context";

interface RegistrationChain {
  chainId: number;
  registryAddress: `0x${string}`;
}

const AVAILABLE_CHAINS: RegistrationChain[] = Object.entries(IDENTITY_REGISTRIES).map(
  ([id, addr]) => ({ chainId: Number(id), registryAddress: addr })
);

const TESTNET_CHAIN_IDS = new Set([11155111, 84532]);
const TESTNET_CHAINS = AVAILABLE_CHAINS.filter((c) => TESTNET_CHAIN_IDS.has(c.chainId));
const MAINNET_CHAINS = AVAILABLE_CHAINS.filter((c) => !TESTNET_CHAIN_IDS.has(c.chainId));
const API_BASE = process.env.NEXT_PUBLIC_KYA_API_URL || "http://localhost:3001";

export function RegisterAgentForm() {
  const { network } = useNetwork();
  const chains = network === "mainnet" ? MAINNET_CHAINS : TESTNET_CHAINS;
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [selectedChain, setSelectedChain] = useState<RegistrationChain>(chains[0]);
  const [agentURI, setAgentURI] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset selected chain when network changes
  useEffect(() => {
    setSelectedChain(chains[0]);
    setTxHash(null);
    setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network]);

  // Wallet event listeners
  useEffect(() => {
    if (!walletAddress) return;
    const removeAccounts = onAccountsChanged((accounts) => {
      if (accounts.length === 0) {
        setWalletAddress(null);
        setWalletChainId(null);
      } else {
        setWalletAddress(accounts[0]);
      }
    });
    const removeChain = onChainChanged((chainId) => {
      setWalletChainId(chainId);
    });
    return () => {
      removeAccounts();
      removeChain();
    };
  }, [walletAddress]);

  const handleConnect = useCallback(async () => {
    try {
      setError(null);
      const { address, chainId } = await connectWallet();
      setWalletAddress(address);
      setWalletChainId(chainId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet");
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    setWalletAddress(null);
    setWalletChainId(null);
    setTxHash(null);
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!walletAddress || !agentURI.trim()) return;

    setIsSubmitting(true);
    setError(null);
    setTxHash(null);

    try {
      // Switch chain if needed
      if (walletChainId !== selectedChain.chainId) {
        await switchChain(selectedChain.chainId);
        setWalletChainId(selectedChain.chainId);
      }

      const buildRes = await fetch(`${API_BASE}/agents/register/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId: selectedChain.chainId,
          agentURI: agentURI.trim(),
        }),
      });
      if (!buildRes.ok) {
        const body = (await buildRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Build failed (${buildRes.status})`);
      }
      const buildPayload = (await buildRes.json()) as {
        to: `0x${string}`;
        data: `0x${string}`;
      };

      const hash = await sendTransaction({
        to: buildPayload.to,
        data: buildPayload.data,
        chainId: selectedChain.chainId,
      });

      await fetch(`${API_BASE}/agents/register/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId: selectedChain.chainId,
          txHash: hash,
          walletAddress,
          agentURI: agentURI.trim(),
        }),
      });

      setTxHash(hash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      if (msg.includes("User rejected") || msg.includes("user rejected")) {
        setError("Transaction rejected");
      } else {
        setError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [walletAddress, walletChainId, selectedChain, agentURI]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Register Agent</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Register a new AI agent on the ERC-8004 Identity Registry. Your
          connected wallet will be the agent owner.
        </p>

        {!walletAddress ? (
          <Button onClick={handleConnect} variant="outline" className="w-full">
            Connect Wallet to Register
          </Button>
        ) : (
          <div className="space-y-4">
            {/* Connected wallet */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm font-mono">
                  {shortenHex(walletAddress)}
                </span>
                {walletChainId && (
                  <Badge variant="outline" className="text-xs">
                    {getChainName(walletChainId)}
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </div>

            {/* Chain selector */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Register on chain</p>
              <div className="flex flex-wrap gap-2">
                {chains.map((chain) => (
                  <Badge
                    key={chain.chainId}
                    variant={
                      selectedChain.chainId === chain.chainId
                        ? "default"
                        : "outline"
                    }
                    className="cursor-pointer"
                    onClick={() => setSelectedChain(chain)}
                  >
                    {getChainName(chain.chainId)}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Agent URI input */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Agent URI (IPFS, HTTPS, or data URI pointing to agent metadata JSON)
              </p>
              <Input
                value={agentURI}
                onChange={(e) => setAgentURI(e.target.value)}
                placeholder="ipfs://Qm... or https://example.com/agent.json"
              />
            </div>

            {/* Registry info */}
            <div className="rounded-md border bg-muted/50 px-3 py-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Identity Registry</span>
                <span className="font-mono">
                  {shortenHex(selectedChain.registryAddress, 6)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Chain</span>
                <span>{getChainName(selectedChain.chainId)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Owner</span>
                <span className="font-mono">{shortenHex(walletAddress)}</span>
              </div>
            </div>

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !agentURI.trim()}
              className="w-full"
            >
              {isSubmitting ? "Confirming in wallet..." : "Register Agent"}
            </Button>

            {/* Success */}
            {txHash && (
              <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3 space-y-1">
                <p className="text-sm text-green-700 dark:text-green-400">
                  Agent registered on {getChainName(selectedChain.chainId)}!
                </p>
                <p className="text-xs text-muted-foreground">
                  The relayer will pick it up and index it in the MasterRegistry automatically.
                </p>
                <a
                  href={`${getExplorerUrl(selectedChain.chainId)}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-primary hover:underline"
                >
                  View transaction: {shortenHex(txHash, 8)}
                </a>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
