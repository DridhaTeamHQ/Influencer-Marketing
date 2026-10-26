"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { AudienceRow, DayPoint } from "@/lib/social/youtube";

const shortDate = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

const viewsConfig = {
  views: { label: "Views", color: "var(--chart-1)" },
  watchHours: { label: "Watch hours", color: "var(--chart-2)" },
} satisfies ChartConfig;

/** Views (left axis) and watch hours (right axis) per day. */
export function ViewsChart({ data }: { data: DayPoint[] }) {
  return (
    <ChartContainer config={viewsConfig} className="aspect-auto h-64 w-full">
      <AreaChart data={data} margin={{ left: 0, right: 0, top: 8 }}>
        <defs>
          {(["views", "watchHours"] as const).map((key) => (
            <linearGradient key={key} id={`yt-fill-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.3} />
              <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={shortDate} />
        <YAxis yAxisId="views" tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <YAxis yAxisId="hours" orientation="right" tickLine={false} axisLine={false} width={40} />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent indicator="dot" labelFormatter={(v) => shortDate(String(v))} />}
        />
        <Area yAxisId="views" dataKey="views" type="monotone" stroke="var(--color-views)" fill="url(#yt-fill-views)" strokeWidth={2} />
        <Area
          yAxisId="hours"
          dataKey="watchHours"
          type="monotone"
          stroke="var(--color-watchHours)"
          fill="url(#yt-fill-watchHours)"
          strokeWidth={2}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  );
}

const subsConfig = {
  gained: { label: "Gained", color: "var(--chart-2)" },
  lost: { label: "Lost", color: "var(--destructive)" },
} satisfies ChartConfig;

export function SubscribersChart({ data }: { data: DayPoint[] }) {
  return (
    <ChartContainer config={subsConfig} className="aspect-auto h-56 w-full">
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={shortDate} />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltipContent labelFormatter={(v) => shortDate(String(v))} />} />
        <Bar dataKey="gained" fill="var(--color-gained)" radius={[4, 4, 0, 0]} maxBarSize={20} />
        <Bar dataKey="lost" fill="var(--color-lost)" radius={[4, 4, 0, 0]} maxBarSize={20} />
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  );
}

const audienceConfig = {
  female: { label: "Female", color: "var(--chart-1)" },
  male: { label: "Male", color: "var(--chart-2)" },
  other: { label: "Other", color: "var(--chart-3)" },
} satisfies ChartConfig;

/** Share of views (%) by age group, split by gender. */
export function AudienceChart({ data }: { data: AudienceRow[] }) {
  const rounded = data.map((r) => ({
    age: r.age,
    female: Math.round(r.female * 10) / 10,
    male: Math.round(r.male * 10) / 10,
    other: Math.round(r.other * 10) / 10,
  }));
  const hasOther = rounded.some((r) => r.other > 0);
  return (
    <ChartContainer config={audienceConfig} className="aspect-auto h-56 w-full">
      <BarChart data={rounded} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="age" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={32} unit="%" />
        <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltipContent />} />
        <Bar dataKey="female" stackId="g" fill="var(--color-female)" maxBarSize={32} />
        <Bar dataKey="male" stackId="g" fill="var(--color-male)" radius={hasOther ? undefined : [4, 4, 0, 0]} maxBarSize={32} />
        {hasOther && <Bar dataKey="other" stackId="g" fill="var(--color-other)" radius={[4, 4, 0, 0]} maxBarSize={32} />}
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  );
}
