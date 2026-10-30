import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, TrophyIcon } from "lucide-react";
import { ChartListTable } from "@/components/stores/chart-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { timeAgo } from "@/lib/format";
import type { ChartStatus } from "@/lib/stores/charts";
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

/** How many apps of the chart the list shows; our app is added below if it's further down. */
const TOP = 150;

/**
 * Our position in the store's Top free chart for our category (fetched on every sync and daily by cron);
 * clicking it opens the top 150. Only on the Play Store and App Store views.
 */
export function RankingCard({
  store,
  label,
  ranking,
  chart,
  status,
}: {
  store: string;
  /** Which chart, e.g. "Top free · News & Magazines · India". */
  label: string;
  ranking: RankingSummary | null;
  chart: ChartList | null;
  status: ChartStatus;
}) {
  // A position from an older day than the latest list means we've dropped out of the chart since.
  const current = ranking && (!chart || ranking.latest.date >= chart.date) ? ranking : null;
  const position = current ? (
    <span className="flex items-center gap-3">
      <span className="text-4xl font-semibold tabular-nums">#{current.latest.rank}</span>
      {current.previous && <Move latest={current.latest.rank} previous={current.previous.rank} />}
    </span>
  ) : (
    chart && (
      <span className="text-sm text-muted-foreground">
        DailyMattr isn’t in the top {chart.entries.length}
        {ranking && ` (last #${ranking.latest.rank} on ${shortDate(ranking.latest.date)})`}
      </span>
    )
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrophyIcon className="size-4 text-primary" />
          Store ranking
        </CardTitle>
        <CardDescription>
          {label}
          {status && !status.error && ` · updated ${timeAgo(status.fetchedAt)}`}
          {!status && !chart && " · updates on the next sync"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {status?.error && (
          <p className="text-xs text-destructive">
            Couldn’t fetch the chart {timeAgo(status.fetchedAt)}: {status.error}
          </p>
        )}
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
                  {position}
                  <span className="flex items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground">
                    View top {Math.min(TOP, chart.entries.length)}
                    <ChevronRightIcon className="size-4" />
                  </span>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>
                      {store} top {Math.min(TOP, chart.entries.length)}
                    </DialogTitle>
                    <DialogDescription>
                      {label} · {shortDate(chart.date)} · DailyMattr is highlighted
                    </DialogDescription>
                  </DialogHeader>
                  <ChartListTable chart={chart} top={TOP} />
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
