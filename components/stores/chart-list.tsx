import { cn } from "@/lib/utils";
import type { ChartList } from "@/lib/stores/rankings";

type Entry = ChartList["entries"][number];

function Row({ entry: e }: { entry: Entry }) {
  return (
    <li className={cn("flex items-center gap-3 px-3 py-2 text-sm", e.ours && "bg-primary/10 font-medium text-primary dark:bg-primary/20")}>
      <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">#{e.rank}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate" title={e.appName}>
          {e.appName}
          {e.ours && <span className="ml-2 text-xs">(our app)</span>}
        </span>
        {e.developer && <span className="block truncate text-xs text-muted-foreground">{e.developer}</span>}
      </span>
    </li>
  );
}

/** A store's top-chart list, our app's row highlighted. Past `top`, only our row shows, after a gap. */
export function ChartListTable({
  chart,
  top = Infinity,
  empty = "No list fetched yet.",
}: {
  chart: ChartList | null;
  top?: number;
  empty?: string;
}) {
  if (!chart || chart.entries.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  const shown = chart.entries.filter((e) => e.rank <= top);
  const oursBelow = chart.entries.find((e) => e.ours && e.rank > top);
  return (
    <ol className="max-h-[28rem] divide-y overflow-y-auto rounded-lg border">
      {shown.map((e) => (
        <Row key={e.rank} entry={e} />
      ))}
      {oursBelow && (
        <>
          <li className="px-3 py-1 text-center text-xs text-muted-foreground">
            {oursBelow.rank - top - 1 > 0 ? `${oursBelow.rank - top - 1} more apps` : "…"}
          </li>
          <Row entry={oursBelow} />
        </>
      )}
    </ol>
  );
}
