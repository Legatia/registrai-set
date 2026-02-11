"use client";

import { useState, useCallback } from "react";
import type { AgentProfile } from "@registrai/kya";
import { kya } from "@/lib/kya";

interface UseResolveAgentResult {
  data: AgentProfile | null;
  isLoading: boolean;
  error: string | null;
  resolve: (query: string) => Promise<void>;
  reset: () => void;
}

export function useResolveAgent(): UseResolveAgentResult {
  const [data, setData] = useState<AgentProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = useCallback(async (query: string) => {
    setIsLoading(true);
    setError(null);
    setData(null);

    try {
      const agent = await kya.getAgent(query);
      setData(agent);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to resolve agent";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { data, isLoading, error, resolve, reset };
}
