import { formatNumber } from "@/lib/format";

export function BreakdownList({
  items,
  emptyLabel = "No data yet",
}: {
  items: { label: string; clicks: number }[];
  emptyLabel?: string;
}) {
  const total = items.reduce((sum, i) => sum + i.clicks, 0);
  if (total === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const max = Math.max(...items.map((i) => i.clicks));

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate">{item.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatNumber(item.clicks)}
              <span className="ml-2 inline-block w-9 text-right text-xs">
                {Math.round((item.clicks / total) * 100)}%
              </span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${max ? (item.clicks / max) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
