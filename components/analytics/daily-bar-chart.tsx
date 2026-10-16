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
import type { DailyPoint } from "@/lib/analytics";

const config = {
  android: { label: "Android", color: "var(--chart-2)" },
  ios: { label: "iOS", color: "var(--chart-1)" },
  others: { label: "Others (Windows / Mac)", color: "var(--chart-3)" },
  signups: { label: "Signups", color: "var(--chart-4)" },
} satisfies ChartConfig;

const shortDate = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** Clicks per day as stacked bars (Android, iOS, others), with signups as a bar beside them. */
export function DailyBarChart({ data }: { data: DailyPoint[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={shortDate}
        />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)" }}
          content={<ChartTooltipContent labelFormatter={(v) => shortDate(String(v))} />}
        />
        <Bar dataKey="android" stackId="clicks" fill="var(--color-android)" maxBarSize={28} />
        <Bar dataKey="ios" stackId="clicks" fill="var(--color-ios)" maxBarSize={28} />
        <Bar
          dataKey="others"
          stackId="clicks"
          fill="var(--color-others)"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
        <Bar dataKey="signups" fill="var(--color-signups)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  );
}
