"use client";

import { useState, useEffect, useCallback } from "react";
import type { AgentSummary, Pagination, ListAgentsParams } from "@registrai/kya";
import { kya } from "@/lib/kya";
import { useNetwork } from "@/lib/network-context";

interface UseAgentListResult {
  agents: AgentSummary[];
  pagination: Pagination | null;
  isLoading: boolean;
  error: string | null;
  setParams: (params: ListAgentsParams) => void;
}

export function useAgentList(
  initialParams?: ListAgentsParams
): UseAgentListResult {
  const { network } = useNetwork();
  const [params, setParams] = useState<ListAgentsParams>(
    initialParams ?? { page: 1, limit: 25 }
  );
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset to page 1 when network changes
  useEffect(() => {
    setParams((prev) => ({ ...prev, page: 1 }));
  }, [network]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await kya.listAgents({ ...params, network });
        if (!cancelled) {
          setAgents(result.agents);
          setPagination(result.pagination);
        }
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to fetch agents"
          );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [params, network]);

  const updateParams = useCallback((newParams: ListAgentsParams) => {
    setParams(newParams);
  }, []);

  return { agents, pagination, isLoading, error, setParams: updateParams };
}
