"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { shortenHex } from "@/lib/format";
import { kya } from "@/lib/kya";
import type { Attestation, Pagination } from "@registrai/kya";

interface AttestationListProps {
  agentId: string;
}

const OUTCOME_VARIANTS: Record<string, "default" | "destructive" | "secondary"> = {
  positive: "default",
  negative: "destructive",
  neutral: "secondary",
};

export function AttestationList({ agentId }: AttestationListProps) {
  const [attestations, setAttestations] = useState<Attestation[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setIsLoading(true);
    kya
      .getAttestations(agentId, { page, limit: 20 })
      .then((res) => {
        setAttestations(res.attestations);
        setPagination(res.pagination);
      })
      .catch(() => {
        setAttestations([]);
      })
      .finally(() => setIsLoading(false));
  }, [agentId, page]);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            SATI Attestations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[150px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (attestations.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          SATI Attestations ({pagination?.total ?? attestations.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Attestation</TableHead>
              <TableHead>Counterparty</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Slot</TableHead>
              <TableHead>Tx</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attestations.map((a) => (
              <TableRow key={a.attestationAddress}>
                <TableCell className="font-mono text-xs">
                  {shortenHex(a.attestationAddress, 6)}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {shortenHex(a.counterparty, 6)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={OUTCOME_VARIANTS[a.outcome] || "secondary"}
                    className="text-xs"
                  >
                    {a.outcome}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {a.slot.toLocaleString()}
                </TableCell>
                <TableCell>
                  <a
                    href={`https://solscan.io/tx/${a.txSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    {shortenHex(a.txSignature, 4)}
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
