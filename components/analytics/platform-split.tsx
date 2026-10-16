import { OTHERS_LABEL, formatNumber } from "@/lib/format";

/** Android vs iOS vs others (Windows / Mac) as a single split bar. */
export function PlatformSplit({
  android,
  ios,
  others,
  windows,
  mac,
}: {
  android: number;
  ios: number;
  others: number;
  windows: number;
  mac: number;
}) {
  const total = android + ios + others;
  if (total === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No clicks yet</p>;
  }
  const pct = (n: number) => Math.round((n / total) * 100);

  const items = [
    { label: "Android", value: android, dot: "bg-chart-2" },
    { label: "iOS", value: ios, dot: "bg-chart-1" },
    {
      label: OTHERS_LABEL,
      value: others,
      dot: "bg-chart-3",
      detail: `Windows ${formatNumber(windows)} · Mac ${formatNumber(mac)}`,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted">
        {items.map((item) =>
          item.value > 0 ? (
            <div key={item.label} className={item.dot} style={{ width: `${(item.value / total) * 100}%` }} />
          ) : null,
        )}
      </div>
      <ul className="space-y-2.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            <span className={`size-2 shrink-0 rounded-full ${item.dot}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{item.label}</span>
              {item.detail && <span className="block text-xs text-muted-foreground">{item.detail}</span>}
            </span>
            <span className="tabular-nums text-muted-foreground">{formatNumber(item.value)}</span>
            <span className="w-10 text-right font-medium tabular-nums">{pct(item.value)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
