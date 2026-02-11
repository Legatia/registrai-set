"use client";

import { useCallback } from "react";
import { ExplorerStats } from "@/components/explorer-stats";
import { AgentListTable } from "@/components/agent-list-table";
import { useStats } from "@/lib/hooks/use-total-agents";
import { useAgentList } from "@/lib/hooks/use-agent-events";

export default function ExplorerPage() {
  const { stats, isLoading: isLoadingStats } = useStats();
  const { agents, pagination, isLoading: isLoadingAgents, setParams } = useAgentList();

  const handlePageChange = useCallback(
    (page: number) => {
      setParams({ page, limit: 25 });
    },
    [setParams]
  );

  const handleFilterChange = useCallback(
    (owner: string) => {
      setParams({ page: 1, limit: 25, owner: owner || undefined });
    },
    [setParams]
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">Explorer</h1>
        <p className="text-muted-foreground text-sm">
          Browse all registered agents across all chains.
        </p>
      </div>

      <ExplorerStats stats={stats} isLoading={isLoadingStats} />

      <div>
        <h2 className="text-lg font-semibold mb-4">Registered Agents</h2>
        <AgentListTable
          agents={agents}
          pagination={pagination}
          isLoading={isLoadingAgents}
          onPageChange={handlePageChange}
          onFilterChange={handleFilterChange}
        />
      </div>
    </div>
  );
}
