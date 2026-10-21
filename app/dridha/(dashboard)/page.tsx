import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  AppleIcon,
  ArrowRightIcon,
  MonitorIcon,
  MousePointerClickIcon,
  SmartphoneIcon,
  TrophyIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { ClicksChart } from "@/components/analytics/clicks-chart";
import { PlatformSplit } from "@/components/analytics/platform-split";
import { RangeTabs } from "@/components/analytics/range-tabs";
import { StatCard } from "@/components/analytics/stat-card";
import { InfluencerAvatar } from "@/components/influencers/influencer-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  conversionRate,
  getDailyClicks,
  getLeaderboard,
  getSignupSummary,
  getSummary,
  getTopValues,
  parseRange,
  percentChange,
  RANGES,
  type LeaderboardRow,
} from "@/lib/analytics";
import { formatNumber, OTHERS_LABEL, uniqueVisitors } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { routes } from "@/lib/routes";

const DESCRIPTION = "How every influencer link is performing.";

export default function DashboardPage(props: PageProps<"/dridha">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/dridha">["searchParams"] }) {
  await connection();
  const range = parseRange((await searchParams).range);
  const days = RANGES[range];

  const [influencerCount, summary, signupSummary, daily, countries, sources, leaders] = await Promise.all([
    prisma.influencer.count(),
    getSummary(range),
    getSignupSummary(range),
    getDailyClicks(range),
    getTopValues("country", range),
    getTopValues("referrer", range),
    getLeaderboard(range, 10),
  ]);

  if (influencerCount === 0) {
    return (
      <>
        <PageHeader title="Dashboard" description={DESCRIPTION} />
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
            <Button nativeButton={false} render={<Link href={routes.influencers} />}>
              Add influencer
            </Button>
          </EmptyContent>
        </Empty>
      </>
    );
  }

  const vsPrev = `vs previous ${days} days`;

  return (
    <>
      <PageHeader title="Dashboard" description={DESCRIPTION}>
        <RangeTabs value={range} basePath={routes.dashboard} />
      </PageHeader>

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={<MousePointerClickIcon />}
            accent="primary"
            label="Total clicks"
            value={formatNumber(summary.clicks)}
            change={percentChange(summary.clicks, summary.prevClicks)}
            hint={`${formatNumber(summary.clicksToday)} today`}
          />
          <StatCard
            icon={<UsersIcon />}
            accent="primary"
            label="Unique visitors"
            value={formatNumber(summary.unique)}
            change={percentChange(summary.unique, summary.prevUnique)}
            hint={`Android ${formatNumber(summary.uniqueAndroid)} · iOS ${formatNumber(summary.uniqueIos)} · Others ${formatNumber(summary.uniqueOthers)}`}
          />
          <StatCard
            icon={<SmartphoneIcon />}
            accent="android"
            label="Android"
            value={formatNumber(summary.android)}
            change={percentChange(summary.android, summary.prevAndroid)}
            hint={uniqueVisitors(summary.uniqueAndroid)}
          />
          <StatCard
            icon={<AppleIcon />}
            accent="ios"
            label="iOS"
            value={formatNumber(summary.ios)}
            change={percentChange(summary.ios, summary.prevIos)}
            hint={uniqueVisitors(summary.uniqueIos)}
          />
          <StatCard
            icon={<MonitorIcon />}
            accent="others"
            label={OTHERS_LABEL}
            value={formatNumber(summary.others)}
            change={percentChange(summary.others, summary.prevOthers)}
            hint={`${formatNumber(summary.uniqueOthers)} unique · Windows ${formatNumber(summary.windows)} · Mac ${formatNumber(summary.mac)}`}
          />
          <StatCard
            icon={<UserPlusIcon />}
            accent="signups"
            label="Referral signups"
            value={formatNumber(signupSummary.signups)}
            change={percentChange(signupSummary.signups, signupSummary.prevSignups)}
            hint={
              conversionRate(signupSummary.signups, summary.clicks)
                ? `${conversionRate(signupSummary.signups, summary.clicks)} of clicks`
                : vsPrev
            }
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Clicks by platform</CardTitle>
              <CardDescription>Per day, last {days} days · bots excluded</CardDescription>
            </CardHeader>
            <CardContent>
              <ClicksChart data={daily} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Platforms</CardTitle>
              <CardDescription>Share of clicks, last {days} days</CardDescription>
            </CardHeader>
            <CardContent>
              <PlatformSplit
                android={summary.android}
                ios={summary.ios}
                others={summary.others}
                windows={summary.windows}
                mac={summary.mac}
              />
            </CardContent>
          </Card>
        </div>

        <Leaderboard rows={leaders} days={days} />

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Countries</CardTitle>
              <CardDescription>Top 5 by clicks</CardDescription>
            </CardHeader>
            <CardContent>
              <BreakdownList items={countries} emptyLabel="No location data yet" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Where clicks come from</CardTitle>
              <CardDescription>Top 5 websites and apps</CardDescription>
            </CardHeader>
            <CardContent>
              <BreakdownList
                items={sources.map((s) => ({ ...s, label: s.label === "Unknown" ? "Direct / in-app" : s.label }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Leaderboard({ rows, days }: { rows: LeaderboardRow[]; days: number }) {
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <TrophyIcon className="size-4 text-chart-4" />
          Top influencers
        </CardTitle>
        <CardDescription>Ranked by clicks in the last {days} days</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={routes.influencers} />}>
            View all
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </CardAction>
      </CardHeader>
      {rows.length === 0 ? (
        <CardContent className="pb-6">
          <p className="py-6 text-center text-sm text-muted-foreground">No clicks or signups in this period</p>
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-10 pl-4">#</TableHead>
              <TableHead>Influencer</TableHead>
              <TableHead className="hidden w-48 md:table-cell">Platform mix</TableHead>
              <TableHead className="text-right">Clicks</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Android</TableHead>
              <TableHead className="hidden text-right sm:table-cell">iOS</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Others</TableHead>
              <TableHead className="text-right">Signups</TableHead>
              <TableHead className="hidden pr-4 text-right sm:table-cell">Conv.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell className="pl-4 text-muted-foreground tabular-nums">{i + 1}</TableCell>
                <TableCell>
                  <Link href={routes.influencer(r.id)} className="group flex items-center gap-3">
                    <InfluencerAvatar name={r.name} seed={r.id} size="sm" />
                    <span className="min-w-0">
                      <span className="block max-w-44 truncate font-medium group-hover:underline">{r.name}</span>
                      {r.handle && (
                        <span className="block max-w-44 truncate text-xs text-muted-foreground">@{r.handle}</span>
                      )}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <MixBar android={r.android} ios={r.ios} others={r.others} />
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatNumber(r.clicks)}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatNumber(r.android)}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatNumber(r.ios)}</TableCell>
                <TableCell className="hidden text-right text-muted-foreground tabular-nums lg:table-cell">
                  {formatNumber(r.others)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.signups)}</TableCell>
                <TableCell className="hidden pr-4 text-right text-muted-foreground tabular-nums sm:table-cell">
                  {conversionRate(r.signups, r.clicks) ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

/** Android / iOS / others as one thin bar, in the same colors as the charts. */
function MixBar({ android, ios, others }: { android: number; ios: number; others: number }) {
  const total = android + ios + others;
  if (total === 0) return <div className="h-1.5 rounded-full bg-muted" />;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div
      className="flex h-1.5 gap-px overflow-hidden rounded-full bg-muted"
      title={`Android ${android} · iOS ${ios} · Others ${others}`}
    >
      {android > 0 && <div className="bg-chart-2" style={{ width: pct(android) }} />}
      {ios > 0 && <div className="bg-chart-1" style={{ width: pct(ios) }} />}
      {others > 0 && <div className="bg-chart-3" style={{ width: pct(others) }} />}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <PageHeader title="Dashboard" description={DESCRIPTION} />
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </>
  );
}
