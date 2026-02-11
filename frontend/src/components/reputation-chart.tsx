"use client";

import { useState, useEffect, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { kya } from "@/lib/kya";
import type { ReputationSnapshot } from "@registrai/kya";

interface ReputationChartProps {
  agentId: string;
  chainNames: { chainId: number; chainName: string }[];
}

const CHAIN_COLORS: Record<number, string> = {
  1: "#627eea",
  8453: "#0052ff",
  42161: "#28a0f0",
  10: "#ff0420",
  11155111: "#6b7280",
  84532: "#818cf8",
};

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ReputationChart({ agentId, chainNames }: ReputationChartProps) {
  const [snapshots, setSnapshots] = useState<ReputationSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedChain, setSelectedChain] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    kya
      .getReputationHistory(agentId, {
        limit: 100,
        chain: selectedChain ?? undefined,
      })
      .then((res) => {
        if (!cancelled) setSnapshots(res.snapshots);
      })
      .catch(() => {
        if (!cancelled) setSnapshots([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [agentId, selectedChain]);

  const chartData = useMemo(() => {
    // Group snapshots by recordedAt and format for recharts
    const reversed = [...snapshots].reverse();
    return reversed.map((s) => ({
      date: formatDate(s.recordedAt),
      timestamp: s.recordedAt,
      [`chain_${s.chainId}`]:
        s.summaryValueDecimals > 0
          ? Number(s.summaryValue) / 10 ** s.summaryValueDecimals
          : Number(s.summaryValue),
      chainName: s.chainName,
    }));
  }, [snapshots]);

  const activeChainIds = useMemo(() => {
    const ids = new Set(snapshots.map((s) => s.chainId));
    return [...ids];
  }, [snapshots]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Reputation History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (snapshots.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Reputation History
          </CardTitle>
          <div className="flex gap-1">
            <Badge
              variant={selectedChain === null ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => setSelectedChain(null)}
            >
              All
            </Badge>
            {chainNames.map((cn) => (
              <Badge
                key={cn.chainId}
                variant={selectedChain === cn.chainId ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => setSelectedChain(cn.chainId)}
              >
                {cn.chainName}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground))"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground))"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Legend />
            {activeChainIds.map((chainId) => {
              const cn = chainNames.find((c) => c.chainId === chainId);
              return (
                <Line
                  key={chainId}
                  type="monotone"
                  dataKey={`chain_${chainId}`}
                  name={cn?.chainName || `Chain ${chainId}`}
                  stroke={CHAIN_COLORS[chainId] || "#8884d8"}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
