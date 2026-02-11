"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { shortenHex } from "@/lib/format";
import { formatTimestamp } from "@/lib/format";
import { LoadingTable } from "./loading-table";
import type { AgentSummary, Pagination } from "@registrai/kya";

interface AgentListTableProps {
  agents: AgentSummary[];
  pagination: Pagination | null;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onFilterChange: (filter: string) => void;
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

export function AgentListTable({
  agents,
  pagination,
  isLoading,
  onPageChange,
  onFilterChange,
}: AgentListTableProps) {
  const [filter, setFilter] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Input placeholder="Filter agents..." disabled />
        <LoadingTable columns={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 p-4 rounded-xl glass">
        <div className="relative flex-1 max-w-md">
          <Input
            placeholder="Filter by owner address..."
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              onFilterChange(e.target.value);
            }}
            className="bg-background/20 border-white/5 pl-10 h-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground bg-white/5 px-3 py-1 rounded-full border border-white/5">
            {pagination?.total ?? agents.length} {(pagination?.total ?? agents.length) === 1 ? "Agent" : "Agents"}
          </span>
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="glass p-12 text-center rounded-xl border-dashed border-white/10">
          <p className="text-muted-foreground">
            {filter ? "No agents match the filter." : "No agents registered yet."}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden backdrop-blur-sm">
            <Table>
              <TableHeader className="bg-white/5">
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Agent ID</TableHead>
                  <TableHead className="text-muted-foreground">Owner</TableHead>
                  <TableHead className="text-muted-foreground">Score</TableHead>
                  <TableHead className="text-muted-foreground">Feedback</TableHead>
                  <TableHead className="text-muted-foreground">Registered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent) => (
                  <TableRow key={agent.masterAgentId} className="border-white/5 hover:bg-white/5 transition-colors">
                    <TableCell>
                      <Link
                        href={`/?q=${encodeURIComponent(agent.masterAgentId)}`}
                        className="font-mono text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-2"
                      >
                        <span className="w-2 h-2 rounded-full bg-primary/50 animate-pulse"></span>
                        {shortenHex(agent.masterAgentId, 8)}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {shortenHex(agent.ownerAddress)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={getScoreVariant(agent.unifiedValue)}
                        className="font-mono"
                      >
                        {formatScore(agent.unifiedValue, agent.unifiedValueDecimals)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {agent.totalFeedbackCount}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTimestamp(agent.registeredAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground px-2">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => onPageChange(pagination.page - 1)}
                  className="bg-black/20"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => onPageChange(pagination.page + 1)}
                  className="bg-black/20"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
