import { formatNumber } from "@/lib/format";
import type { BreakdownRow } from "@/lib/stores/stats";

/**
 * Each source / campaign / country as a share bar of installs (downloads + reinstalls),
 * styled like the other breakdowns on the dashboard.
 */
export function BreakdownChart({ rows }: { rows: BreakdownRow[] }) {
  const items = rows.map((r) => ({ ...r, installs: r.downloads + r.reinstalls })).filter((r) => r.installs > 0);
  const total = items.reduce((s, r) => s + r.installs, 0);
  const max = Math.max(...items.map((i) => i.installs), 0);
  if (total === 0) return null;

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate" title={item.label}>
              {item.label}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              <span className="font-medium text-foreground">{formatNumber(item.installs)}</span>
              <span className="ml-2 inline-block w-9 text-right text-xs">
                {Math.round((item.installs / total) * 100)}%
              </span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-chart-1"
              style={{ width: `${max ? (item.installs / max) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
