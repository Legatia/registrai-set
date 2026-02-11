"use client";

import { useState, useEffect } from "react";
import type { StatsResponse } from "@registrai/kya";
import { kya } from "@/lib/kya";
import { useNetwork, type NetworkMode } from "@/lib/network-context";

interface UseStatsResult {
  stats: StatsResponse | null;
  isLoading: boolean;
  error: string | null;
}

export function useStats(): UseStatsResult {
  const { network } = useNetwork();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    async function load() {
      try {
        const result = await kya.getStats({ network });
        if (!cancelled) setStats(result);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to fetch stats"
          );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [network]);

  return { stats, isLoading, error };
}
