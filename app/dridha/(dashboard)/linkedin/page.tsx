import { Suspense } from "react";
import { connection } from "next/server";
import {
  AppleIcon,
  ExternalLinkIcon,
  LinkIcon,
  MonitorIcon,
  MousePointerClickIcon,
  SmartphoneIcon,
  UsersIcon,
} from "lucide-react";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { ClicksChart } from "@/components/analytics/clicks-chart";
import { PlatformSplit } from "@/components/analytics/platform-split";
import { RangeTabs } from "@/components/analytics/range-tabs";
import { StatCard } from "@/components/analytics/stat-card";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { PartnerLinkSwitch } from "@/components/partners/partner-link-switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getPartnerDailyClicks,
  getPartnerSummary,
  getPartnerTopValues,
  parseRange,
  percentChange,
  RANGES,
} from "@/lib/analytics";
import { deviceLabel, formatNumber, OTHERS_LABEL, timeAgo, uniqueVisitors } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { routes } from "@/lib/routes";
import { getBaseUrl, partnerUrl } from "@/lib/tracking";

const DESCRIPTION =
  "Download clicks from LinkedIn partner posts. Counted separately from influencers.";

export default function LinkedInPage(props: PageProps<"/dridha/linkedin">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="LinkedIn" description={DESCRIPTION} />
          <div className="space-y-4">
            <Skeleton className="h-36 rounded-xl" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-80 rounded-xl" />
          </div>
        </>
      }
    >
      <LinkedInDetail searchParams={props.searchParams} />
    </Suspense>
  );
}

async function LinkedInDetail({
  searchParams,
}: Pick<PageProps<"/dridha/linkedin">, "searchParams">) {
  await connection();
  const range = parseRange((await searchParams).range);
  const days = RANGES[range];

  const link = await prisma.partnerLink.findFirst({
    where: { channel: "LinkedIn" },
    orderBy: { createdAt: "asc" },
  });

  if (!link) {
    return (
      <>
        <PageHeader title="LinkedIn" description={DESCRIPTION} />
        <p className="py-12 text-center text-sm text-muted-foreground">
          No LinkedIn link set up yet.
        </p>
      </>
    );
  }

  const [baseUrl, summary, daily, countries, referrers, browsers, totalClicks, recent] =
    await Promise.all([
      getBaseUrl(),
      getPartnerSummary(range, link.id),
      getPartnerDailyClicks(range, link.id),
      getPartnerTopValues("country", range, link.id),
      getPartnerTopValues("referrer", range, link.id),
      getPartnerTopValues("browser", range, link.id),
      prisma.partnerClick.count({ where: { isBot: false, linkId: link.id } }),
      prisma.partnerClick.findMany({
        where: { isBot: false, linkId: link.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

  const url = partnerUrl(baseUrl, link.slug);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {link.name}
            <Badge variant="secondary">{link.channel}</Badge>
            {!link.isActive && <Badge variant="outline">Paused</Badge>}
          </span>
        }
        description={DESCRIPTION}
      />

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="size-4 text-primary" />
            Tracking link
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-1">
            Counts every click, then opens
            <a
              href={link.destinationUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
            >
              {link.destinationUrl.replace(/^https?:\/\//, "")}
              <ExternalLinkIcon className="size-3" />
            </a>
          </CardDescription>
          <CardAction>
            <PartnerLinkSwitch id={link.id} isActive={link.isActive} />
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2 pl-3">
            <p className="min-w-0 flex-1 truncate font-mono text-sm">{url}</p>
            <CopyButton value={url} size="sm" variant="outline" label="Copy" />
          </div>
          <p className="text-xs text-muted-foreground">
            {link.isActive
              ? `${formatNumber(totalClicks)} clicks all time`
              : "Paused: visitors see “This link isn’t available”."}
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Last {days} days</h2>
        <RangeTabs value={range} basePath={routes.linkedin} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={<MousePointerClickIcon />}
          accent="primary"
          label="Total clicks"
          value={formatNumber(summary.clicks)}
          change={percentChange(summary.clicks, summary.prevClicks)}
          hint={`${formatNumber(summary.linkedin)} came from linkedin.com`}
        />
        <StatCard
          icon={<UsersIcon />}
          accent="signups"
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily clicks</CardTitle>
          <CardDescription>Clicks per day by platform, last {days} days</CardDescription>
        </CardHeader>
        <CardContent>
          <ClicksChart data={daily} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
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

        <Card>
          <Tabs defaultValue="referrer" className="gap-4">
            <CardHeader>
              <CardTitle>Audience</CardTitle>
              <CardDescription>Last {days} days</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <TabsList>
                <TabsTrigger value="referrer">Source</TabsTrigger>
                <TabsTrigger value="country">Country</TabsTrigger>
                <TabsTrigger value="browser">App</TabsTrigger>
              </TabsList>
              <TabsContent value="referrer">
                <BreakdownList
                  items={referrers.map((r) => ({
                    ...r,
                    label: r.label === "Unknown" ? "Direct / in-app" : r.label,
                  }))}
                />
              </TabsContent>
              <TabsContent value="country">
                <BreakdownList items={countries} emptyLabel="No location data yet" />
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
          <CardDescription>Latest 50, all time · bots excluded</CardDescription>
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
                  <TableCell>{deviceLabel(c.device, c.os)}</TableCell>
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
