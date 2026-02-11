"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { shortenHex, formatTimestamp } from "@/lib/format";
import { connectWallet } from "@/lib/wallet";
import { kya } from "@/lib/kya";
import type { AddressPresence } from "@registrai/kya";

interface PresenceListProps {
  agentId: string;
  ownerAddress: string;
  isOwner: boolean;
}

export function PresenceList({ agentId, ownerAddress, isOwner }: PresenceListProps) {
  const [presence, setPresence] = useState<AddressPresence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [removingAddress, setRemovingAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setIsLoading(true);
    kya
      .getPresence(agentId)
      .then((res) => setPresence(res.presence))
      .catch(() => setPresence([]))
      .finally(() => setIsLoading(false));
  }, [agentId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRemove = useCallback(
    async (address: string, chainType: "evm" | "solana") => {
      setError(null);
      setRemovingAddress(address);

      try {
        const { address: connectedAddress } = await connectWallet();

        // Sign removal message
        const message = `KYA Remove Presence: ${agentId}`;
        const provider = window.ethereum;
        if (!provider) throw new Error("No wallet detected");

        const signature = await (provider as any).request({
          method: "personal_sign",
          params: [message, connectedAddress],
        });

        await kya.removePresence(agentId, {
          address,
          chainType,
          signature,
          signerAddress: connectedAddress,
        });

        load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove presence");
      } finally {
        setRemovingAddress(null);
      }
    },
    [agentId, load]
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            On-Chain Presence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[80px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (presence.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          On-Chain Presence ({presence.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {presence.map((p) => (
          <div
            key={`${p.address}-${p.chainType}`}
            className="flex items-center justify-between rounded-md border px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {p.chainType.toUpperCase()}
              </Badge>
              {p.chainId && (
                <Badge variant="outline" className="text-xs">
                  Chain {p.chainId}
                </Badge>
              )}
              <span className="font-mono text-xs">{shortenHex(p.address, 8)}</span>
              <span className="text-xs text-muted-foreground">
                verified {formatTimestamp(p.verifiedAt)}
              </span>
            </div>
            {isOwner && (
              <Button
                variant="ghost"
                size="sm"
                disabled={removingAddress === p.address}
                onClick={() => handleRemove(p.address, p.chainType)}
              >
                {removingAddress === p.address ? "Removing..." : "Remove"}
              </Button>
            )}
          </div>
        ))}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
