import { cn } from "@/lib/utils";
import type { ChartList } from "@/lib/stores/rankings";

/** A store's uploaded top-chart list, our app's row highlighted. */
export function ChartListTable({ chart, empty = "No list uploaded yet." }: { chart: ChartList | null; empty?: string }) {
  if (!chart || chart.entries.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ol className="max-h-[28rem] divide-y overflow-y-auto rounded-lg border">
      {chart.entries.map((e) => (
        <li
          key={e.rank}
          className={cn("flex items-center gap-3 px-3 py-2 text-sm", e.ours && "bg-primary/10 font-medium text-primary dark:bg-primary/20")}
        >
          <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">#{e.rank}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate" title={e.appName}>
              {e.appName}
              {e.ours && <span className="ml-2 text-xs">(our app)</span>}
            </span>
            {e.developer && <span className="block truncate text-xs text-muted-foreground">{e.developer}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
