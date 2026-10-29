"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DayPoint } from "@/lib/social/instagram";

const shortDate = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

const reachConfig = { reach: { label: "Accounts reached", color: "var(--chart-1)" } } satisfies ChartConfig;

/** Accounts reached per day. */
export function ReachChart({ data }: { data: DayPoint[] }) {
  return (
    <ChartContainer config={reachConfig} className="aspect-auto h-64 w-full">
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="ig-fill-reach" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-reach)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-reach)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={shortDate} />
        <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" labelFormatter={(v) => shortDate(String(v))} />} />
        <Area dataKey="reach" type="monotone" stroke="var(--color-reach)" fill="url(#ig-fill-reach)" strokeWidth={2} />
      </AreaChart>
    </ChartContainer>
  );
}

const followersConfig = { newFollowers: { label: "New followers", color: "var(--chart-2)" } } satisfies ChartConfig;

/** New followers per day; days Instagram no longer keeps are left out. */
export function FollowersChart({ data }: { data: DayPoint[] }) {
  const kept = data.filter((d) => d.newFollowers !== null);
  return (
    <ChartContainer config={followersConfig} className="aspect-auto h-56 w-full">
      <BarChart data={kept} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={shortDate} />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltipContent labelFormatter={(v) => shortDate(String(v))} />} />
        <Bar dataKey="newFollowers" fill="var(--color-newFollowers)" radius={[4, 4, 0, 0]} maxBarSize={20} />
      </BarChart>
    </ChartContainer>
  );
}
