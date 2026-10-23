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
import type { DayRow } from "@/lib/stores/stats";

const shortDate = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

/** Downloads and reinstalls stacked, with uninstalls beside them. Series the store can't report yet are left out. */
export function StoreChart({
  data,
  color,
  showReinstalls,
  showUninstalls,
  uninstallLabel,
}: {
  data: DayRow[];
  color: string;
  showReinstalls: boolean;
  showUninstalls: boolean;
  /** "Uninstalls" (Play) or "Deletions" (Apple). */
  uninstallLabel: string;
}) {
  const config = {
    downloads: { label: "Downloads", color },
    reinstalls: { label: "Reinstalls", color: "var(--chart-4)" },
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
        <Bar
          dataKey="downloads"
          stackId="installs"
          fill="var(--color-downloads)"
          radius={showReinstalls ? undefined : [4, 4, 0, 0]}
          maxBarSize={24}
        />
        {showReinstalls && (
          <Bar dataKey="reinstalls" stackId="installs" fill="var(--color-reinstalls)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        )}
        {showUninstalls && (
          <Bar dataKey="uninstalls" fill="var(--color-uninstalls)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        )}
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  );
}
