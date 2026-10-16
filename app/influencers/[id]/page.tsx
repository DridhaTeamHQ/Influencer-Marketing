import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ChevronLeftIcon, PencilIcon } from "lucide-react";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { ClicksChart } from "@/components/analytics/clicks-chart";
import { RangeTabs } from "@/components/analytics/range-tabs";
import { StatCard } from "@/components/analytics/stat-card";
import { CopyButton } from "@/components/copy-button";
import { InfluencerActions } from "@/components/influencers/influencer-actions";
import { InfluencerFormDialog } from "@/components/influencers/influencer-form-dialog";
import { LinkActiveSwitch } from "@/components/influencers/link-controls";
import { PlatformSplit } from "@/components/analytics/platform-split";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getDailyClicks,
  getSummary,
  getTopValues,
  parseRange,
  percentChange,
  RANGES,
} from "@/lib/analytics";
import {
  DEVICE_LABELS,
  PLATFORM_LABELS,
  formatCompact,
  formatDate,
  formatNumber,
  initials,
  timeAgo,
} from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { DOWNLOAD_URL, getBaseUrl, trackingUrl } from "@/lib/tracking";

type Props = PageProps<"/influencers/[id]">;

export default function InfluencerPage(props: Props) {
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 -ml-2 text-muted-foreground"
        nativeButton={false}
        render={<Link href="/influencers" />}
      >
        <ChevronLeftIcon data-icon="inline-start" />
        Influencers
      </Button>
      <Suspense fallback={<DetailSkeleton />}>
        <InfluencerDetail params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function InfluencerDetail({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  await connection();
  const { id } = await params;
  const range = parseRange((await searchParams).range);
  const days = RANGES[range];
  const filter = { influencerId: id };

  const [influencer, baseUrl, summary, daily, countries, referrers, browsers, totalClicks, recent] =
    await Promise.all([
      prisma.influencer.findUnique({ where: { id }, include: { link: true } }),
      getBaseUrl(),
      getSummary(range, filter),
      getDailyClicks(range, filter),
      getTopValues("country", range, filter),
      getTopValues("referrer", range, filter),
      getTopValues("browser", range, filter),
      prisma.click.count({ where: { isBot: false, link: { influencerId: id } } }),
      prisma.click.findMany({
        where: { isBot: false, link: { influencerId: id } },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
    ]);

  if (!influencer) notFound();
  const link = influencer.link;
  const url = link ? trackingUrl(baseUrl, link.code) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar size="lg" className="size-12">
            <AvatarFallback className="text-base">{initials(influencer.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{influencer.name}</h1>
              {!influencer.isActive && <Badge variant="outline">Paused</Badge>}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {PLATFORM_LABELS[influencer.platform]}
              {influencer.handle && ` · @${influencer.handle}`}
              {influencer.followers != null && ` · ${formatCompact(influencer.followers)} followers`}
              {` · Added ${formatDate(influencer.createdAt)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <InfluencerFormDialog
            influencer={influencer}
            trigger={
              <Button variant="outline">
                <PencilIcon data-icon="inline-start" />
                Edit
              </Button>
            }
          />
          <InfluencerActions
            id={influencer.id}
            name={influencer.name}
            isActive={influencer.isActive}
            showView={false}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Download link</CardTitle>
          <CardDescription>Opens {DOWNLOAD_URL.replace(/^https?:\/\//, "")}, which sends Android and iOS users to the right store.</CardDescription>
        </CardHeader>
        <CardContent>
          {link && url ? (
            <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 truncate font-mono text-sm">{url}</p>
              <div className="flex items-center gap-3">
                <span className="text-sm tabular-nums text-muted-foreground">
                  {formatNumber(totalClicks)} clicks all time
                </span>
                <LinkActiveSwitch id={link.id} isActive={link.isActive} />
                <CopyButton value={url} size="sm" variant="outline" label="Copy" />
              </div>
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">No link yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Analytics</h2>
        <RangeTabs value={range} basePath={`/influencers/${id}`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total clicks"
          value={formatNumber(summary.clicks)}
          change={percentChange(summary.clicks, summary.prevClicks)}
          hint={`vs previous ${days} days`}
        />
        <StatCard
          label="Unique visitors"
          value={formatNumber(summary.unique)}
          change={percentChange(summary.unique, summary.prevUnique)}
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Android vs iOS</CardTitle>
            <CardDescription>Share of mobile clicks, last {days} days</CardDescription>
          </CardHeader>
          <CardContent>
            <PlatformSplit android={summary.android} ios={summary.ios} />
          </CardContent>
        </Card>

        <Card>
          <Tabs defaultValue="country" className="gap-4">
            <CardHeader>
              <CardTitle>Audience</CardTitle>
              <CardDescription>Last {days} days</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <TabsList>
                <TabsTrigger value="country">Country</TabsTrigger>
                <TabsTrigger value="referrer">Source</TabsTrigger>
                <TabsTrigger value="browser">App</TabsTrigger>
              </TabsList>
              <TabsContent value="country">
                <BreakdownList items={countries} emptyLabel="No location data yet" />
              </TabsContent>
              <TabsContent value="referrer">
                <BreakdownList
                  items={referrers.map((r) => ({
                    ...r,
                    label: r.label === "Unknown" ? "Direct / in-app" : r.label,
                  }))}
                />
              </TabsContent>
              <TabsContent value="browser">
                <BreakdownList items={browsers} />
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>

      <Card className="pb-0">
        <CardHeader>
          <CardTitle>Recent clicks</CardTitle>
          <CardDescription>Latest 15, all time</CardDescription>
        </CardHeader>
        {recent.length === 0 ? (
          <CardContent className="pb-6">
            <p className="py-6 text-center text-sm text-muted-foreground">
              No clicks yet. Share the link to get started.
            </p>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">When</TableHead>
                <TableHead>Device</TableHead>
                <TableHead className="hidden sm:table-cell">App / browser</TableHead>
                <TableHead className="hidden md:table-cell">Country</TableHead>
                <TableHead className="pr-4">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-4 text-muted-foreground" title={c.createdAt.toISOString()}>
                    {timeAgo(c.createdAt)}
                  </TableCell>
                  <TableCell>{DEVICE_LABELS[c.device]}</TableCell>
                  <TableCell className="hidden sm:table-cell">{c.browser ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{c.country ?? "—"}</TableCell>
                  <TableCell className="pr-4">{c.referrer ?? "Direct / in-app"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
