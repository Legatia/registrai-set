import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { shortenHex, formatTimestamp } from "@/lib/format";
import { CopyButton } from "./copy-button";
import { ChainReputationTable } from "./chain-reputation-table";
import { ReputationChart } from "./reputation-chart";
import { IdentityList } from "./identity-list";
import { AttestationList } from "./attestation-list";
import { PresenceList } from "./presence-list";
import { AddPresence } from "./add-presence";
import { FeedbackForm } from "./feedback-form";
import type { AgentProfile as AgentProfileType } from "@registrai/kya";

interface AgentProfileProps {
  agent: AgentProfileType;
  connectedAddress?: string | null;
}

function formatScore(value: string, decimals: number): string {
  if (value === "0") return "0";
  const num = Number(value);
  if (decimals === 0) return value;
  return (num / 10 ** decimals).toFixed(decimals);
}

function getScoreVariant(value: string): "default" | "destructive" | "secondary" {
  const num = Number(value);
  if (num > 0) return "default";
  if (num < 0) return "destructive";
  return "secondary";
}

export function AgentProfile({ agent, connectedAddress }: AgentProfileProps) {
  const unified = agent.reputation.unified;
  const score = formatScore(unified.value, unified.decimals);
  const variant = getScoreVariant(unified.value);
  const isOwner = connectedAddress
    ? connectedAddress.toLowerCase() === agent.ownerAddress.toLowerCase()
    : false;

  const chainNames = agent.reputation.perChain.map((c) => ({
    chainId: c.chainId,
    chainName: c.chainName,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Agent Profile
            <Badge variant={variant} className="font-mono">
              {Number(unified.value) > 0 ? "+" : ""}{score}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Agent ID</p>
              <div className="flex items-center gap-1">
                <p className="font-mono text-sm">{shortenHex(agent.masterAgentId)}</p>
                <CopyButton value={agent.masterAgentId} />
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Owner</p>
              <div className="flex items-center gap-1">
                <p className="font-mono text-sm">
                  {shortenHex(agent.ownerAddress)}
                </p>
                <CopyButton value={agent.ownerAddress} />
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Registered</p>
              <p className="text-sm">{formatTimestamp(agent.registeredAt)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Feedback</p>
              <p className="font-mono text-sm">
                {unified.totalFeedbackCount}
              </p>
            </div>
          </div>

          <Separator />

          {/* Per-chain reputation */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Per-Chain Reputation
            </h3>
            <ChainReputationTable perChain={agent.reputation.perChain} />
          </div>

          <Separator />

          {/* Identities */}
          <IdentityList identities={agent.identities} />

          <Separator />

          {/* Feedback */}
          <FeedbackForm
            agentId={agent.masterAgentId}
            identities={agent.identities}
          />
        </CardContent>
      </Card>

      {/* Reputation History Chart */}
      <ReputationChart agentId={agent.masterAgentId} chainNames={chainNames} />

      {/* SATI Attestations */}
      <AttestationList agentId={agent.masterAgentId} />

      {/* On-Chain Presence */}
      <PresenceList
        agentId={agent.masterAgentId}
        ownerAddress={agent.ownerAddress}
        isOwner={isOwner}
      />

      {/* Add Presence (owner only) */}
      {isOwner && (
        <AddPresence
          agentId={agent.masterAgentId}
          ownerAddress={agent.ownerAddress}
        />
      )}
    </div>
  );
}
