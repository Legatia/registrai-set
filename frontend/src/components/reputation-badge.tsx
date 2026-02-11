import { Badge } from "@/components/ui/badge";

interface ReputationBadgeProps {
  value: string;
  decimals: number;
  className?: string;
}

function formatScore(value: string, decimals: number): string {
  if (value === "0") return "0";
  const num = Number(value);
  if (decimals === 0) return value;
  return (num / 10 ** decimals).toFixed(decimals);
}

export function ReputationBadge({
  value,
  decimals,
  className,
}: ReputationBadgeProps) {
  const formatted = formatScore(value, decimals);
  const num = Number(value);
  const isPositive = num > 0;
  const isNegative = num < 0;

  return (
    <Badge
      variant={isPositive ? "default" : isNegative ? "destructive" : "secondary"}
      className={`font-mono ${className || ""}`}
    >
      {isPositive ? "+" : ""}
      {formatted}
    </Badge>
  );
}
