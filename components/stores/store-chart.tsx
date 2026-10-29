"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { OverallDayRow } from "@/lib/stores/stats";

const shortDate = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

export type ChartStore = { key: "play" | "apple"; name: string; color: string };

/**
 * Downloads with uninstalls beside them; uninstalls are left out until the store reports them.
 * With `stores` (the Overall view), the bars are each store's downloads + reinstalls instead.
 */
export function StoreChart({
  data,
  color,
  showUninstalls,
  uninstallLabel,
  stores,
}: {
  data: OverallDayRow[];
  color: string;
  showUninstalls: boolean;
  /** "Uninstalls" (Play) or "Deletions" (Apple). */
  uninstallLabel: string;
  stores?: ChartStore[];
}) {
  const stack = stores
    ? stores.map((s) => ({ key: s.key, label: s.name, color: s.color }))
    : [{ key: "downloads", label: "Downloads", color }];
  const config = {
    ...Object.fromEntries(stack.map((s) => [s.key, { label: s.label, color: s.color }])),
    uninstalls: { label: uninstallLabel, color: "var(--destructive)" },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={shortDate} />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)" }}
          content={<ChartTooltipContent labelFormatter={(v) => shortDate(String(v))} />}
        />
        {stack.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId="installs"
            fill={`var(--color-${s.key})`}
            radius={i === stack.length - 1 ? [4, 4, 0, 0] : undefined}
            maxBarSize={24}
          />
        ))}
        {showUninstalls && (
          <Bar dataKey="uninstalls" fill="var(--color-uninstalls)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        )}
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  );
}
