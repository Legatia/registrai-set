import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatTimestamp } from "@/lib/format";
import type { ChainReputation } from "@registrai/kya";

interface ChainReputationTableProps {
  perChain: ChainReputation[];
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

export function ChainReputationTable({ perChain }: ChainReputationTableProps) {
  if (perChain.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No per-chain reputation data available.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Chain</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Feedback Count</TableHead>
          <TableHead>Last Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {perChain.map((rep) => (
          <TableRow key={rep.chainId}>
            <TableCell className="font-medium">
              {rep.chainName}
            </TableCell>
            <TableCell>
              <Badge
                variant={getScoreVariant(rep.summaryValue)}
                className="font-mono"
              >
                {Number(rep.summaryValue) > 0 ? "+" : ""}
                {formatScore(rep.summaryValue, rep.summaryValueDecimals)}
              </Badge>
            </TableCell>
            <TableCell className="font-mono">
              {rep.feedbackCount}
            </TableCell>
            <TableCell>{formatTimestamp(rep.updatedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
