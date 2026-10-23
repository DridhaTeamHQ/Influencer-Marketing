import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  AppleIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  LinkIcon,
  MonitorIcon,
  MousePointerClickIcon,
  PencilIcon,
  PlusIcon,
  SmartphoneIcon,
  TicketIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { DailyBarChart } from "@/components/analytics/daily-bar-chart";
import { RangeTabs } from "@/components/analytics/range-tabs";
import { StatCard } from "@/components/analytics/stat-card";
import { CopyButton } from "@/components/copy-button";
import { InfluencerActions } from "@/components/influencers/influencer-actions";
import { InfluencerFormDialog } from "@/components/influencers/influencer-form-dialog";
import { ProfileButton } from "@/components/influencers/profile-button";
import { InfluencerAvatar } from "@/components/influencers/influencer-avatar";
import {
  DeleteSignupCountButton,
  SignupCountDialog,
} from "@/components/influencers/signup-count-dialog";
import { LinkActiveSwitch } from "@/components/influencers/link-controls";
import { PlatformSplit } from "@/components/analytics/platform-split";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  getDailyClicks,
  conversionRate,
  getSignupSummary,
  getSummary,
  getTopValues,
  parseRange,
  percentChange,
  RANGES,
} from "@/lib/analytics";
import {
  deviceLabel,
  formatCompact,
  formatDate,
  formatNumber,
  formatPeriod,
  OTHERS_LABEL,
  PERIOD_BADGE,
  periodStatus,
  PLATFORM_LABELS,
  timeAgo,
  uniqueVisitors,
} from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getBaseUrl, influencerStoreUrls, trackingUrl } from "@/lib/tracking";
import { routes } from "@/lib/routes";

type Props = PageProps<"/dridha/influencers/[id]">;

export default function InfluencerPage(props: Props) {
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 -ml-2 text-muted-foreground"
        nativeButton={false}
        render={<Link href={routes.influencers} />}
      >
        <ChevronLeftIcon data-icon="inline-start" />
        Influencers
      </Button>
      <Suspense fallback={<DetailSkeleton />}>
        <InfluencerDetail
          params={props.params}
          searchParams={props.searchParams}
        />
      </Suspense>
    </>
  );
}

async function InfluencerDetail({
  params,
  searchParams,
}: Pick<Props, "params" | "searchParams">) {
  await connection();
  const { id } = await params;
  const range = parseRange((await searchParams).range);
  const days = RANGES[range];
  const filter = { influencerId: id };

  const [
    influencer,
    baseUrl,
    summary,
    daily,
    countries,
    referrers,
    browsers,
    totalClicks,
    recent,
    signupSummary,
    totalSignups,
    signupDays,
  ] = await Promise.all([
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
      take: 50,
    }),
    getSignupSummary(range, filter),
    prisma.signupCount
      .aggregate({ where: { influencerId: id }, _sum: { count: true } })
      .then((r) => r._sum.count ?? 0),
    prisma.signupCount.findMany({
      where: { influencerId: id },
      orderBy: { date: "desc" },
      take: 31,
    }),
  ]);

  if (!influencer) notFound();
  const link = influencer.link;
  const period = formatPeriod(influencer.periodStart, influencer.periodEnd);
  const periodState = periodStatus(
    influencer.periodStart,
    influencer.periodEnd,
  );
  const url = link ? trackingUrl(baseUrl, link.code) : null;
  const stores = link ? influencerStoreUrls(influencer, link.code) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <InfluencerAvatar
            name={influencer.name}
            seed={influencer.id}
            size="lg"
            className="size-12 text-base"
          />
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {influencer.name}
              </h1>
              {!influencer.isActive && <Badge variant="outline">Paused</Badge>}
              {period && periodState && (
                <Badge
                  variant="secondary"
                  className={PERIOD_BADGE[periodState]}
                >
                  {periodState}
                </Badge>
              )}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {PLATFORM_LABELS[influencer.platform]}
              {influencer.handle && ` · @${influencer.handle}`}
              {influencer.followers != null &&
                ` · ${formatCompact(influencer.followers)} followers`}
              {period
                ? ` · Campaign ${period}`
                : ` · Added ${formatDate(influencer.createdAt)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ProfileButton
            platform={influencer.platform}
            handle={influencer.handle}
            showLabel
          />
          <InfluencerFormDialog
            linkPrefix={`${baseUrl.replace(/^https?:\/\//, "")}/r/`}
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="size-4 text-primary" />
              Download link
            </CardTitle>
            <CardDescription>
              Counts every click, then opens the App Store on iPhone, iPad and
              Mac, and the Play Store everywhere else.
            </CardDescription>
            {link && (
              <CardAction>
                <LinkActiveSwitch id={link.id} isActive={link.isActive} />
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {link && url ? (
              <>
                <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2 pl-3">
                  <p className="min-w-0 flex-1 truncate font-mono text-sm">
                    {url}
                  </p>
                  <CopyButton
                    value={url}
                    size="sm"
                    variant="outline"
                    label="Copy"
                  />
                </div>
                {stores && (
                  <dl className="grid gap-1 text-xs sm:grid-cols-[auto_1fr] sm:gap-x-3">
                    {[
                      { label: "Play Store", href: stores.android },
                      { label: "App Store", href: stores.ios },
                    ].map((row) => (
                      <div key={row.label} className="contents">
                        <dt className="text-muted-foreground">{row.label}</dt>
                        <dd className="min-w-0">
                          <a
                            href={row.href}
                            target="_blank"
                            rel="noreferrer"
                            title={row.href}
                            className="inline-flex max-w-full items-center gap-1 font-medium underline-offset-4 hover:underline"
                          >
                            <span className="truncate">
                              {row.href.replace(/^https?:\/\//, "")}
                            </span>
                            <ExternalLinkIcon className="size-3 shrink-0" />
                          </a>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="text-xs text-muted-foreground">
                  {!link.isActive || !influencer.isActive
                    ? "Paused: visitors see \u201cThis link isn\u2019t available\u201d."
                    : `${formatNumber(totalClicks)} clicks all time`}
                </p>
              </>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No link yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TicketIcon className="size-4 text-chart-1" />
              Referral code
            </CardTitle>
            <CardDescription>
              Entered at signup. Signups are copied from the referral portal.
            </CardDescription>
            <CardAction>
              <SignupCountDialog
                influencerId={influencer.id}
                referralCode={influencer.referralCode}
                trigger={
                  <Button size="sm">
                    <PlusIcon data-icon="inline-start" />
                    Update signups
                  </Button>
                }
              />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2 pl-3">
              <p className="min-w-0 flex-1 truncate font-mono text-sm font-medium tracking-wide">
                {influencer.referralCode}
              </p>
              <CopyButton
                value={influencer.referralCode}
                size="sm"
                variant="outline"
                label="Copy"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(totalSignups)} signups all time
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="clicks">
              Clicks{" "}
              <span className="text-muted-foreground tabular-nums">
                {formatNumber(totalClicks)}
              </span>
            </TabsTrigger>
            <TabsTrigger value="signups">
              Signups{" "}
              <span className="text-muted-foreground tabular-nums">
                {formatNumber(totalSignups)}
              </span>
            </TabsTrigger>
          </TabsList>
          <RangeTabs value={range} basePath={routes.influencer(id)} />
        </div>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              icon={<MousePointerClickIcon />}
              accent="primary"
              label="Total clicks"
              value={formatNumber(summary.clicks)}
              change={percentChange(summary.clicks, summary.prevClicks)}
              hint={`vs previous ${days} days`}
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
              change={percentChange(
                signupSummary.signups,
                signupSummary.prevSignups,
              )}
              hint={
                conversionRate(signupSummary.signups, summary.clicks)
                  ? `${conversionRate(signupSummary.signups, summary.clicks)} of clicks`
                  : `vs previous ${days} days`
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Daily clicks and signups</CardTitle>
              <CardDescription>
                Clicks per day by platform, next to referral signups, last{" "}
                {days} days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DailyBarChart data={daily} />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Platforms</CardTitle>
                <CardDescription>
                  Share of clicks, last {days} days
                </CardDescription>
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
                    <BreakdownList
                      items={countries}
                      emptyLabel="No location data yet"
                    />
                  </TabsContent>
                  <TabsContent value="referrer">
                    <BreakdownList
                      items={referrers.map((r) => ({
                        ...r,
                        label:
                          r.label === "Unknown" ? "Direct / in-app" : r.label,
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
        </TabsContent>

        <TabsContent value="clicks">
          <Card className="pb-0">
            <CardHeader>
              <CardTitle>Recent clicks</CardTitle>
              <CardDescription>
                Latest 50, all time · bots excluded
              </CardDescription>
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
                    <TableHead className="hidden sm:table-cell">
                      App / browser
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      Country
                    </TableHead>
                    <TableHead className="pr-4">Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell
                        className="pl-4 text-muted-foreground"
                        title={c.createdAt.toISOString()}
                      >
                        {timeAgo(c.createdAt)}
                      </TableCell>
                      <TableCell>{deviceLabel(c.device, c.os)}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {c.browser ?? "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {c.country ?? "—"}
                      </TableCell>
                      <TableCell className="pr-4">
                        {c.referrer ?? "Direct / in-app"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="signups">
          <Card className="pb-0">
            <CardHeader>
              <CardTitle>Signups by day</CardTitle>
              <CardDescription>
                Copied from the referral portal for {influencer.referralCode}
              </CardDescription>
              <CardAction>
                <SignupCountDialog
                  influencerId={influencer.id}
                  referralCode={influencer.referralCode}
                  trigger={
                    <Button size="sm" variant="outline">
                      <PlusIcon data-icon="inline-start" />
                      Add day
                    </Button>
                  }
                />
              </CardAction>
            </CardHeader>
            {signupDays.length === 0 ? (
              <CardContent className="pb-6">
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No signups entered yet. Check the referral portal, then use
                  Update signups.
                </p>
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead className="text-right">Signups</TableHead>
                    <TableHead className="hidden sm:table-cell">Note</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Updated
                    </TableHead>
                    <TableHead className="w-20 pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signupDays.map((day) => {
                    const date = day.date.toISOString().slice(0, 10);
                    const label = formatDate(day.date, "UTC");
                    return (
                      <TableRow key={day.id}>
                        <TableCell className="pl-4">{label}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatNumber(day.count)}
                        </TableCell>
                        <TableCell className="hidden max-w-64 truncate text-muted-foreground sm:table-cell">
                          {day.note ?? "—"}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {timeAgo(day.updatedAt)}
                        </TableCell>
                        <TableCell className="pr-4">
                          <div className="flex justify-end gap-0.5">
                            <SignupCountDialog
                              influencerId={influencer.id}
                              referralCode={influencer.referralCode}
                              entry={{ date, count: day.count, note: day.note }}
                              trigger={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Edit ${label}`}
                                >
                                  <PencilIcon />
                                </Button>
                              }
                            />
                            <DeleteSignupCountButton
                              id={day.id}
                              label={label}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
