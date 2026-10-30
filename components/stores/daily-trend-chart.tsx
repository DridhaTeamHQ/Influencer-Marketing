"use client";

import { useId } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
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

/**
 * Downloads, removals and net per day as smooth areas that fade out downwards, oldest day on the left.
 * Reinstalls stay in the table below.
 */
export function DailyTrendChart({
  data,
  uninstallLabel,
  showUninstalls,
}: {
  data: DayRow[];
  uninstallLabel: string;
  showUninstalls: boolean;
}) {
  // Gradient ids must be unique when the chart shows more than once on a page.
  const id = useId().replace(/:/g, "");
  const rows = data.map((r) => ({
    date: r.date,
    downloads: r.downloads,
    uninstalls: r.uninstalls,
    net: r.downloads + r.reinstalls - r.uninstalls,
  }));
  const config = {
    downloads: { label: "Downloads", color: "var(--chart-2)" },
    uninstalls: { label: uninstallLabel, color: "var(--chart-1)" },
    net: { label: "Net", color: "var(--chart-3)" },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>
          <linearGradient id={`${id}-downloads`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-downloads)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-downloads)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`${id}-uninstalls`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-uninstalls)" stopOpacity={0.12} />
            <stop offset="100%" stopColor="var(--color-uninstalls)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`${id}-net`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--muted-foreground)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--muted-foreground)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={shortDate} />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(v) => shortDate(String(v))} />} />
        {showUninstalls && (
          <Area
            dataKey="net"
            type="monotone"
            stroke="var(--color-net)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            fill={`url(#${id}-net)`}
          />
        )}
        {showUninstalls && (
          <Area
            dataKey="uninstalls"
            type="monotone"
            stroke="var(--color-uninstalls)"
            strokeWidth={2}
            fill={`url(#${id}-uninstalls)`}
          />
        )}
        <Area
          dataKey="downloads"
          type="monotone"
          stroke="var(--color-downloads)"
          strokeWidth={2}
          fill={`url(#${id}-downloads)`}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  );
}
