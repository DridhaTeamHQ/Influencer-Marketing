import { formatNumber } from "@/lib/format";

/** Android vs iOS share as a single split bar. */
export function PlatformSplit({ android, ios }: { android: number; ios: number }) {
  const total = android + ios;
  const androidPct = total ? Math.round((android / total) * 100) : 0;
  const iosPct = total ? 100 - androidPct : 0;

  if (total === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No mobile clicks yet</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        <div className="bg-primary" style={{ width: `${androidPct}%` }} />
        <div className="bg-chart-2" style={{ width: `${iosPct}%` }} />
      </div>
      <dl className="grid grid-cols-2 gap-4">
        {[
          { label: "Android", value: android, pct: androidPct, dot: "bg-primary" },
          { label: "iOS", value: ios, pct: iosPct, dot: "bg-chart-2" },
        ].map((item) => (
          <div key={item.label} className="space-y-1">
            <dt className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className={`size-2 rounded-full ${item.dot}`} />
              {item.label}
            </dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {item.pct}%
              <span className="ml-2 text-sm font-normal text-muted-foreground">{formatNumber(item.value)} clicks</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
