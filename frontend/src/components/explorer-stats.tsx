import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { StatsResponse } from "@registrai/kya";

interface ExplorerStatsProps {
  stats: StatsResponse | null;
  isLoading: boolean;
}

export function ExplorerStats({ stats, isLoading }: ExplorerStatsProps) {
  return (
    <div className="grid gap-6 sm:grid-cols-4">
      <Card className="border-primary/20 bg-primary/5 backdrop-blur-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-primary">
            Total Agents
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-16 bg-primary/10" />
          ) : (
            <p className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
              {stats?.totalAgents ?? "—"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-blue-500/20 bg-blue-500/5 backdrop-blur-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-blue-400">
            Total Identities
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-16 bg-blue-500/10" />
          ) : (
            <p className="text-3xl font-bold text-foreground">
              {stats?.totalIdentities ?? "—"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-emerald-500/20 bg-emerald-500/5 backdrop-blur-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-emerald-400">
            Total Feedback
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-16 bg-emerald-500/10" />
          ) : (
            <p className="text-3xl font-bold text-foreground">
              {stats?.totalFeedback ?? "—"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-500/20 bg-amber-500/5 backdrop-blur-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-amber-400">
            Chains Tracked
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-16 bg-amber-500/10" />
          ) : (
            <p className="text-3xl font-bold text-foreground">
              {stats?.chainsTracked ?? "—"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
