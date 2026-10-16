import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRightIcon, UsersIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { ClicksChart } from "@/components/analytics/clicks-chart";
import { PlatformSplit } from "@/components/analytics/platform-split";
import { RangeTabs } from "@/components/analytics/range-tabs";
import { StatCard } from "@/components/analytics/stat-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getDailyClicks,
  getSummary,
  getTopInfluencers,
  getTopValues,
  parseRange,
  percentChange,
  RANGES,
} from "@/lib/analytics";
import { PLATFORM_LABELS, formatNumber, initials } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import type { SocialPlatform } from "@/lib/generated/prisma/enums";

export default function DashboardPage(props: PageProps<"/">) {
  return (
    <>
      <PageHeader title="Dashboard" description="Clicks across every influencer link." />
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  await connection();
  const range = parseRange((await searchParams).range);
  const days = RANGES[range];

  const [influencerCount, summary, daily, countries, top] = await Promise.all([
    prisma.influencer.count({ where: { isActive: true } }),
    getSummary(range),
    getDailyClicks(range),
    getTopValues("country", range),
    getTopInfluencers(range),
  ]);

  if (influencerCount === 0 && summary.clicks === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>No influencers yet</EmptyTitle>
          <EmptyDescription>
            Add your first influencer to get their download link. Android and iOS clicks will show up here.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} render={<Link href="/influencers" />}>
            Add influencer
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <RangeTabs value={range} basePath="/" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total clicks"
          value={formatNumber(summary.clicks)}
          change={percentChange(summary.clicks, summary.prevClicks)}
          hint={`vs previous ${days} days`}
        />
        <StatCard
          label="Android clicks"
          value={formatNumber(summary.android)}
          change={percentChange(summary.android, summary.prevAndroid)}
          hint={`vs previous ${days} days`}
        />
        <StatCard
          label="iOS clicks"
          value={formatNumber(summary.ios)}
          change={percentChange(summary.ios, summary.prevIos)}
          hint={`vs previous ${days} days`}
        />
        <StatCard
          label="Unique visitors"
          value={formatNumber(summary.unique)}
          change={percentChange(summary.unique, summary.prevUnique)}
          hint={`${formatNumber(summary.clicksToday)} clicks today`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Android vs iOS clicks</CardTitle>
          <CardDescription>Last {days} days, bots excluded</CardDescription>
        </CardHeader>
        <CardContent>
          <ClicksChart data={daily} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Top influencers</CardTitle>
            <CardDescription>By clicks in this period</CardDescription>
            <CardAction>
              <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href="/influencers" />} aria-label="All influencers">
                <ArrowRightIcon />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No clicks in this period</p>
            ) : (
              <ul className="space-y-1">
                {top.map((inf, i) => (
                  <li key={inf.id}>
                    <Link
                      href={`/influencers/${inf.id}`}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                    >
                      <span className="w-4 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                      <Avatar size="sm">
                        <AvatarFallback>{initials(inf.name)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{inf.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {PLATFORM_LABELS[inf.platform as SocialPlatform]}
                          {inf.handle && ` · @${inf.handle}`}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-medium tabular-nums">{formatNumber(inf.clicks)}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {formatNumber(inf.android)} Android · {formatNumber(inf.ios)} iOS
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Android vs iOS</CardTitle>
            <CardDescription>Share of mobile clicks</CardDescription>
          </CardHeader>
          <CardContent>
            <PlatformSplit android={summary.android} ios={summary.ios} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Countries</CardTitle>
            <CardDescription>Top 5 by clicks</CardDescription>
          </CardHeader>
          <CardContent>
            <BreakdownList items={countries} emptyLabel="No location data yet" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Skeleton className="h-7 w-56" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
