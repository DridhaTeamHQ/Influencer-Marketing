"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DayPoint } from "@/lib/social/linkedin";

const shortDate = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

const growthConfig = { followers: { label: "Followers", color: "var(--chart-1)" } } satisfies ChartConfig;

/** Followers at the end of each day. */
export function FollowerGrowthChart({ data }: { data: DayPoint[] }) {
  const kept = data.filter((d) => d.followers !== null);
  return (
    <ChartContainer config={growthConfig} className="aspect-auto h-64 w-full">
      <AreaChart data={kept} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="li-fill-followers" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-followers)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-followers)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={shortDate} />
        <YAxis tickLine={false} axisLine={false} width={48} allowDecimals={false} domain={["dataMin", "dataMax"]} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" labelFormatter={(v) => shortDate(String(v))} />} />
        <Area dataKey="followers" type="monotone" stroke="var(--color-followers)" fill="url(#li-fill-followers)" strokeWidth={2} />
      </AreaChart>
    </ChartContainer>
  );
}

const newFollowersConfig = { newFollowers: { label: "New followers", color: "var(--chart-2)" } } satisfies ChartConfig;

/** New followers per day; days LinkedIn has no numbers for are left out. */
export function NewFollowersChart({ data }: { data: DayPoint[] }) {
  const kept = data.filter((d) => d.newFollowers !== null);
  return (
    <ChartContainer config={newFollowersConfig} className="aspect-auto h-64 w-full">
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

const activityConfig = {
  impressions: { label: "Impressions", color: "var(--chart-1)" },
  engagements: { label: "Engagements", color: "var(--chart-3)" },
} satisfies ChartConfig;

/** Post impressions and engagements per day. */
export function ActivityChart({ data }: { data: DayPoint[] }) {
  return (
    <ChartContainer config={activityConfig} className="aspect-auto h-64 w-full">
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>
          {Object.keys(activityConfig).map((key) => (
            <linearGradient key={key} id={`li-fill-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.3} />
              <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={shortDate} />
        <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" labelFormatter={(v) => shortDate(String(v))} />} />
        <Area dataKey="impressions" type="monotone" stroke="var(--color-impressions)" fill="url(#li-fill-impressions)" strokeWidth={2} />
        <Area dataKey="engagements" type="monotone" stroke="var(--color-engagements)" fill="url(#li-fill-engagements)" strokeWidth={2} />
      </AreaChart>
    </ChartContainer>
  );
}
