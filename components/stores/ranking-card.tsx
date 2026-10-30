import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, TrophyIcon } from "lucide-react";
import { ChartListTable } from "@/components/stores/chart-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ChartList, RankingSummary } from "@/lib/stores/rankings";

const shortDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

/** A lower position is better, so moving from #30 to #24 is "up 6". */
function Move({ latest, previous }: { latest: number; previous: number }) {
  const places = previous - latest;
  if (places === 0) return <Badge variant="secondary">No change</Badge>;
  const up = places > 0;
  return (
    <Badge
      variant="secondary"
      className={up ? "bg-primary/10 text-primary dark:bg-primary/30 dark:text-primary-foreground" : "bg-destructive/10 text-destructive"}
    >
      {up ? <ArrowUpIcon /> : <ArrowDownIcon />}
      {Math.abs(places)}
    </Badge>
  );
}

/**
 * The store position from the top-chart list uploaded on the Import page; clicking it opens the
 * list. Only on the Play Store and App Store views.
 */
export function RankingCard({
  store,
  ranking,
  chart,
}: {
  store: string;
  ranking: RankingSummary | null;
  chart: ChartList | null;
}) {
  const position = ranking && (
    <span className="flex items-center gap-3">
      <span className="text-4xl font-semibold tabular-nums">#{ranking.latest.rank}</span>
      {ranking.previous && <Move latest={ranking.latest.rank} previous={ranking.previous.rank} />}
    </span>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrophyIcon className="size-4 text-primary" />
          Store ranking
        </CardTitle>
        <CardDescription>
          {ranking ? `From the top list uploaded ${shortDate(ranking.latest.date)}` : "Upload the top 50 list on the Import page"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!ranking && !chart ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No ranking yet.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            {chart ? (
              <Dialog>
                <DialogTrigger
                  render={<button type="button" />}
                  className="group flex cursor-pointer items-center gap-4 rounded-lg text-left"
                >
                  {position ?? <span className="text-sm text-muted-foreground">DailyMattr isn’t in the latest list</span>}
                  <span className="flex items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground">
                    View top {chart.entries.length}
                    <ChevronRightIcon className="size-4" />
                  </span>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{store} top {chart.entries.length}</DialogTitle>
                    <DialogDescription>Uploaded {shortDate(chart.date)} · DailyMattr is highlighted</DialogDescription>
                  </DialogHeader>
                  <ChartListTable chart={chart} />
                </DialogContent>
              </Dialog>
            ) : (
              position
            )}
            {ranking && ranking.history.length > 1 && (
              <p className="min-w-0 truncate pb-1 text-xs text-muted-foreground tabular-nums">
                {ranking.history
                  .slice(-6)
                  .map((h) => `#${h.rank} ${shortDate(h.date)}`)
                  .join(" → ")}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
