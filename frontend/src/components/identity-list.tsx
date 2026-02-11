import { CopyButton } from "./copy-button";
import { Badge } from "@/components/ui/badge";
import type { AgentIdentity } from "@registrai/kya";

interface IdentityListProps {
  identities: AgentIdentity[];
}

export function IdentityList({ identities }: IdentityListProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">
        Identities ({identities.length})
      </h3>
      <div className="space-y-2">
        {identities.map((identity) => (
          <div
            key={identity.globalAgentId}
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <Badge variant="outline" className="shrink-0">
              {identity.chainName}
            </Badge>
            <span className="font-mono text-xs truncate flex-1">
              {identity.globalAgentId}
            </span>
            <CopyButton value={identity.globalAgentId} />
          </div>
        ))}
      </div>
    </div>
  );
}
