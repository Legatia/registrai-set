"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { shortenHex } from "@/lib/format";
import {
  connectWallet,
  onAccountsChanged,
} from "@/lib/wallet";
import { kya } from "@/lib/kya";

interface AddPresenceProps {
  agentId: string;
  ownerAddress: string;
  onPresenceAdded?: () => void;
}

export function AddPresence({
  agentId,
  ownerAddress,
  onPresenceAdded,
}: AddPresenceProps) {
  const [step, setStep] = useState<"idle" | "owner-sign" | "address-connect" | "address-sign" | "submitting" | "done">("idle");
  const [newAddress, setNewAddress] = useState("");
  const [chainType, setChainType] = useState<"evm" | "solana">("evm");
  const [chainId, setChainId] = useState<string>("");
  const [ownerSignature, setOwnerSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  const handleOwnerSign = useCallback(async () => {
    setError(null);
    setStep("owner-sign");

    try {
      // Connect wallet (owner should be connected already)
      const { address } = await connectWallet();

      if (address.toLowerCase() !== ownerAddress.toLowerCase()) {
        setError(`Connected wallet (${shortenHex(address)}) does not match agent owner (${shortenHex(ownerAddress)}). Please switch wallets.`);
        setStep("idle");
        return;
      }

      // Sign message: "KYA Presence: {newAddress}"
      const message = `KYA Presence: ${newAddress}`;
      const provider = window.ethereum;
      if (!provider) throw new Error("No wallet detected");

      const signature = await (provider as any).request({
        method: "personal_sign",
        params: [message, address],
      });

      setOwnerSignature(signature);
      setWalletAddress(address);
      setStep("address-connect");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign");
      setStep("idle");
    }
  }, [newAddress, ownerAddress]);

  const handleAddressSign = useCallback(async () => {
    if (!ownerSignature) return;

    setError(null);
    setStep("address-sign");

    try {
      if (chainType === "evm") {
        // Connect with the new address
        const { address } = await connectWallet();

        if (address.toLowerCase() !== newAddress.toLowerCase()) {
          setError(`Connected wallet (${shortenHex(address)}) does not match the address you're claiming (${shortenHex(newAddress)}). Please switch wallets.`);
          setStep("address-connect");
          return;
        }

        // Sign message: "KYA Presence: {masterAgentId}"
        const message = `KYA Presence: ${agentId}`;
        const provider = window.ethereum;
        if (!provider) throw new Error("No wallet detected");

        const addressSignature = await (provider as any).request({
          method: "personal_sign",
          params: [message, address],
        });

        // Submit to API
        setStep("submitting");
        await kya.addPresence(agentId, {
          address: newAddress,
          chainType,
          chainId: chainId ? parseInt(chainId) : undefined,
          ownerSignature,
          addressSignature,
        });

        setStep("done");
        onPresenceAdded?.();
      } else {
        // Solana signing — user would need a Solana wallet adapter
        setError("Solana wallet signing requires a Solana wallet extension. Please sign externally and submit via API.");
        setStep("address-connect");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify address");
      setStep("address-connect");
    }
  }, [agentId, newAddress, chainType, chainId, ownerSignature, onPresenceAdded]);

  const handleReset = useCallback(() => {
    setStep("idle");
    setNewAddress("");
    setOwnerSignature(null);
    setError(null);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Add On-Chain Presence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === "done" ? (
          <div className="space-y-3">
            <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3">
              <p className="text-sm text-green-700 dark:text-green-400">
                Presence added successfully!
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleReset}>
              Add Another
            </Button>
          </div>
        ) : (
          <>
            {/* Address input */}
            <div className="space-y-2">
              <Input
                placeholder="Address to claim (0x... or Solana address)"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                disabled={step !== "idle"}
              />
              <div className="flex gap-2">
                <Badge
                  variant={chainType === "evm" ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => step === "idle" && setChainType("evm")}
                >
                  EVM
                </Badge>
                <Badge
                  variant={chainType === "solana" ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => step === "idle" && setChainType("solana")}
                >
                  Solana
                </Badge>
              </div>
              {chainType === "evm" && (
                <Input
                  placeholder="Chain ID (optional, e.g. 1, 8453)"
                  value={chainId}
                  onChange={(e) => setChainId(e.target.value)}
                  disabled={step !== "idle"}
                  className="max-w-[200px]"
                />
              )}
            </div>

            {/* Step indicators */}
            {step === "idle" && (
              <Button
                onClick={handleOwnerSign}
                disabled={!newAddress.trim()}
                className="w-full"
              >
                Step 1: Sign as Owner
              </Button>
            )}

            {step === "owner-sign" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Waiting for owner signature...
              </div>
            )}

            {step === "address-connect" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Owner signed. Now connect with the new address to prove ownership.
                </p>
                <Button onClick={handleAddressSign} className="w-full">
                  Step 2: Sign as {shortenHex(newAddress)}
                </Button>
              </div>
            )}

            {step === "address-sign" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Waiting for address signature...
              </div>
            )}

            {step === "submitting" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Submitting presence claim...
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
