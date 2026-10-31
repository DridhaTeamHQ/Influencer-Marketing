import Link from "next/link";
import { headers } from "next/headers";
import { after, connection } from "next/server";
import {
  DownloadIcon,
  RotateCcwIcon,
  SigmaIcon,
  SmartphoneIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";
import { StatCard } from "@/components/analytics/stat-card";
import { PageHeader } from "@/components/page-header";
import { AccuracyInfo, NotesInfo } from "@/components/stores/accuracy-badge";
import { RankingCard } from "@/components/stores/ranking-card";
import { BreakdownChart } from "@/components/stores/breakdown-chart";
import { DailyTrendChart } from "@/components/stores/daily-trend-chart";
import { StoreChart, type ChartStore } from "@/components/stores/store-chart";
import { StoreRangeFilter } from "@/components/stores/store-range-filter";
import { SyncButton } from "@/components/stores/sync-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { percentChange } from "@/lib/analytics";
import { formatNumber, timeAgo } from "@/lib/format";
import type { AppStore } from "@/lib/generated/prisma/enums";
import { routes } from "@/lib/routes";
import { parseStoreRange, type StoreRange } from "@/lib/stores/range";
import {
  combineStoreReports,
  REFERRAL_USAGE_OFFSET,
  worst,
  getReferralReport,
  getStoreReport,
  type Breakdown,
  type ReferralPoint,
  type StoreReport,
} from "@/lib/stores/stats";
import { CHART_LABELS, getChartStatus, syncStoreChart } from "@/lib/stores/charts";
import { getLatestChart, getRankingSummary } from "@/lib/stores/rankings";
import { getSyncStatus, missingEnvFor, runSync } from "@/lib/stores/sync";

/** One store's name, chart color and how to connect it. */
const STORES = {
  GOOGLE_PLAY: {
    key: "play",
    name: "Play Store",
    color: "var(--chart-2)",
    setup: [
      "Create a service account in Google Cloud and connect it to Vercel (Workload Identity Federation), or create a key for it.",
      "In Play Console → Users and permissions, invite its email with “View app information and download bulk reports”.",
      "In Play Console → Download reports → Statistics, click “Copy Cloud Storage URI” and paste it as the bucket.",
    ],
  },
  APP_STORE: {
    key: "apple",
    name: "App Store",
    color: "var(--chart-1)",
    setup: [
      "In App Store Connect → Users and Access → Integrations, generate a Team Key with Admin access.",
      "Download the .p8 file and copy the Issuer ID and Key ID shown on that page.",
      "Copy your vendor number from Payments and Financial Reports.",
    ],
  },
} satisfies Record<AppStore, ChartStore & { setup: string[] }>;

type ViewConfig = {
  label: string;
  title: string;
  description: string;
  stores: AppStore[];
  accent: "primary" | "android" | "ios";
  color: string;
  uniqueLabel: string;
  uniqueHint: string;
  /** What the store calls removals: "Uninstalls" (Play) or "Deletions" (Apple). */
  uninstallLabel: string;
  /** Show "Total downloads" (first-time + reinstalls) instead of the unique users card. */
  totalDownloadsCard?: boolean;
};

/** The three filters on the stores page, picked with `?store=`. */
const VIEWS = {
  all: {
    label: "Overall",
    title: "App Stores",
    description: "Downloads, uninstalls and sources from Google Play and the App Store together.",
    stores: ["GOOGLE_PLAY", "APP_STORE"],
    accent: "primary",
    color: "var(--chart-3)",
    uniqueLabel: "",
    uniqueHint: "",
    uninstallLabel: "Uninstalls",
    totalDownloadsCard: true,
  },
  play: {
    label: "Play Store",
    title: "Play Store",
    description: "Downloads, uninstalls and UTM sources from Google Play Console.",
    stores: ["GOOGLE_PLAY"],
    accent: "android",
    color: STORES.GOOGLE_PLAY.color,
    uniqueLabel: "Store visitors",
    uniqueHint: "People who opened the store listing",
    uninstallLabel: "Uninstalls",
  },
  apple: {
    label: "App Store",
    title: "App Store",
    description: "Downloads, deletions and campaigns from App Store Connect.",
    stores: ["APP_STORE"],
    accent: "ios",
    color: STORES.APP_STORE.color,
    uniqueLabel: "Unique devices",
    uniqueHint: "Devices that installed the app",
    totalDownloadsCard: true,
    uninstallLabel: "Deletions",
  },
} satisfies Record<string, ViewConfig>;

type StoreView = keyof typeof VIEWS;

const parseView = (params: Record<string, string | string[] | undefined>): StoreView =>
  typeof params.store === "string" && params.store in VIEWS ? (params.store as StoreView) : "all";

/** The range as URL params, so switching stores keeps the dates. */
const rangeParams = (range: StoreRange): Record<string, string> =>
  range.key === "custom" ? { from: range.from, to: range.to } : { range: range.key };

const viewHref = (view: StoreView, range: StoreRange) =>
  `${routes.stores}?${new URLSearchParams({ ...(view !== "all" && { store: view }), ...rangeParams(range) })}`;

const shortDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function StoreDashboardSkeleton() {
  return (
    <>
      <PageHeader title={VIEWS.all.title} description={VIEWS.all.description} />
      <div className="space-y-4">
        <Skeleton className="h-8 w-72 rounded-lg" />
        <Skeleton className="h-9 rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </>
  );
}

function StoreFilter({ view, range }: { view: StoreView; range: StoreRange }) {
  return (
    <ButtonGroup aria-label="Store">
      {(Object.keys(VIEWS) as StoreView[]).map((key) => (
        <Button
          key={key}
          size="sm"
          variant={key === view ? "secondary" : "outline"}
          nativeButton={false}
          render={<Link href={viewHref(key, range)} scroll={false} />}
          aria-current={key === view ? "page" : undefined}
        >
          {VIEWS[key].label}
        </Button>
      ))}
    </ButtonGroup>
  );
}

export async function StoreDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const range = parseStoreRange(params);
  const view = parseView(params);
  const config: ViewConfig = VIEWS[view];
  const overall = view === "all";
  const filter = <StoreFilter view={view} range={range} />;

  const missing = config.stores.map((store) => ({ store, env: missingEnvFor(store) }));
  const stores = missing.filter((m) => !m.env.length).map((m) => m.store);
  if (!stores.length) return <SetupNeeded config={config} missing={missing} filter={filter} />;

  // Vercel sends its OIDC token with the request; read it here, since `after` can't.
  const oidcToken = (await headers()).get("x-vercel-oidc-token");
  const statuses = await Promise.all(
    stores.map(async (store) => {
      let status = await getSyncStatus(store);
      if (!status.syncedAt && status.stale) {
        // Nothing copied yet: wait for the first sync so the page isn't empty.
        await runSync(store, oidcToken);
        status = await getSyncStatus(store);
      } else if (status.stale) {
        after(() => runSync(store, oidcToken));
      }
      return { store, ...status };
    }),
  );

  // Rankings are per store, so they only show on a single store's page. The chart is fetched with
  // each sync; if it never has been yet, fetch it now so the card isn't empty.
  let chartStatus = overall ? null : await getChartStatus(stores[0]!);
  if (!overall && !chartStatus) {
    await syncStoreChart(stores[0]!);
    chartStatus = await getChartStatus(stores[0]!);
  }
  const [reports, referrals, ranking, chart] = await Promise.all([
    Promise.all(stores.map((store) => getStoreReport(store, range))),
    overall ? getReferralReport() : undefined,
    overall ? null : getRankingSummary(stores[0]!),
    overall ? null : getLatestChart(stores[0]!),
  ]);
  const report = overall
    ? combineStoreReports(stores.map((store, i) => ({ ...STORES[store], report: reports[i]! })))
    : reports[0]!;
  const { totals, prev, has, accuracy } = report;
  const reasons = accuracyReasons(view, report);
  const net = totals.downloads + totals.reinstalls - totals.uninstalls;
  /** In Overall, says which store a status line is about. */
  const named = (store: AppStore, text: string) => (overall ? `${STORES[store].name}: ${text}` : text);
  const notConnected = missing.filter((m) => m.env.length).map((m) => STORES[m.store].name);

  return (
    <div className="space-y-6">
      <PageHeader title={config.title} description={config.description}>
        <span className="text-xs text-muted-foreground">
          {statuses.map((s) => named(s.store, s.syncedAt ? `Synced ${timeAgo(s.syncedAt)}` : "Not synced yet")).join(" · ")}
        </span>
        <SyncButton stores={stores} path={routes.stores} />
      </PageHeader>

      {filter}

      {statuses.map(
        (s) =>
          s.error && (
            <p key={s.store} className="rounded-lg bg-destructive/10 p-3 text-sm break-words text-destructive">
              {named(s.store, `Last sync failed: ${s.error}`)}
            </p>
          ),
      )}

      {notConnected.length > 0 && (
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          {notConnected.join(" and ")} isn’t connected yet, so it’s left out here. Pick its filter to set it up.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          {shortDate(range.from)} – {shortDate(range.to)}
          <span className="text-sm font-normal text-muted-foreground">{range.days} days</span>
          {/* Where the numbers come from and what's missing, on hover instead of taking up the page. */}
          <NotesInfo notes={report.notes} />
        </h2>
        <StoreRangeFilter range={range} basePath={routes.stores} params={overall ? {} : { store: view }} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={<DownloadIcon />}
          accent={config.accent}
          label="Downloads"
          value={formatNumber(totals.downloads)}
          change={percentChange(totals.downloads, prev.downloads)}
          hint={`First-time installs · ${formatNumber(prev.downloads)} the period before`}
          tag={<AccuracyInfo accuracy={accuracy.downloads} reason={reasons.downloads} />}
        />
        <MetricCard
          available={has.reinstalls}
          icon={<RotateCcwIcon />}
          accent="signups"
          label="Reinstalls"
          value={totals.reinstalls}
          prev={prev.reinstalls}
          hint="Installed again by someone who had it before"
          tag={<AccuracyInfo accuracy={accuracy.reinstalls} reason={reasons.reinstalls} />}
        />
        <MetricCard
          available={has.uninstalls}
          icon={<Trash2Icon />}
          accent="others"
          label={config.uninstallLabel}
          value={totals.uninstalls}
          prev={prev.uninstalls}
          hint={`Net this period: ${net >= 0 ? "+" : ""}${formatNumber(net)}`}
          tag={<AccuracyInfo accuracy={accuracy.uninstalls} reason={reasons.uninstalls} />}
        />
        <StatCard
          icon={<SmartphoneIcon />}
          accent="primary"
          label="Active installs"
          value={report.active ? formatNumber(report.active.value) : "—"}
          hint={report.active?.hint ?? `Needs ${config.uninstallLabel.toLowerCase()} data`}
          tag={report.active && <AccuracyInfo accuracy={accuracy.active} reason={reasons.active} />}
        />
        {config.totalDownloadsCard ? (
          // Same as "Total Downloads" in App Store Connect Analytics: first-time + re-downloads.
          <StatCard
            icon={<SigmaIcon />}
            accent={config.accent}
            label="Total downloads"
            value={formatNumber(totals.downloads + totals.reinstalls)}
            change={percentChange(totals.downloads + totals.reinstalls, prev.downloads + prev.reinstalls)}
            hint={`${formatNumber(totals.downloads)} first-time + ${formatNumber(totals.reinstalls)} reinstalls`}
            tag={<AccuracyInfo accuracy={worst([accuracy.downloads, accuracy.reinstalls])} reason={reasons.downloads} />}
          />
        ) : (
          <MetricCard
            available={has.uniqueUsers}
            icon={<UsersIcon />}
            accent={config.accent}
            label={config.uniqueLabel}
            value={totals.uniqueUsers}
            prev={prev.uniqueUsers}
            hint={config.uniqueHint}
            tag={<AccuracyInfo accuracy={accuracy.uniqueUsers} />}
          />
        )}
      </div>

      {referrals && <ReferralSection {...referrals} />}

      {!overall && <RankingCard store={config.title} label={CHART_LABELS[stores[0]!]} ranking={ranking} chart={chart} status={chartStatus} />}

      <Card>
        <CardHeader>
          <CardTitle>Daily installs</CardTitle>
          <CardDescription>
            {(overall
              ? ["Downloads + reinstalls by store", has.uninstalls && "uninstalls"]
              : ["Downloads", has.uninstalls && config.uninstallLabel.toLowerCase()]
            )
              .filter(Boolean)
              .join(", ")}{" "}
            per day
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StoreChart
            data={report.daily}
            color={config.color}
            showUninstalls={has.uninstalls}
            uninstallLabel={config.uninstallLabel}
            stores={overall ? stores.map((s) => STORES[s]) : undefined}
          />
        </CardContent>
      </Card>

      {/* Keyed so the tabs start over on the new view's first tab. */}
      <BreakdownCard key={view} report={report} />

      <DailyTable
        report={report}
        range={range}
        uniqueLabel={config.uniqueLabel}
        uninstallLabel={config.uninstallLabel}
      />
    </div>
  );
}


/** Why a card is tagged the way it is, where the general explanation isn't enough. */
/** Why Apple's Sales reports and its App Analytics screen differ (from Apple's "Differences in reporting tools"). */
const APPLE_SALES_MATCH =
  "Matches App Store Connect → Sales and Trends. Analytics → Overview differs a little because it leaves out restores from a backup and automatic downloads on the user's other devices (so it shows fewer redownloads), and Apple processes the two on different schedules, so a download can land on a different day.";

function accuracyReasons(
  view: StoreView,
  report: StoreReport,
): Partial<Record<"downloads" | "reinstalls" | "uninstalls" | "active", string>> {
  const { accuracy } = report;
  if (view === "apple") {
    return {
      downloads: APPLE_SALES_MATCH,
      reinstalls: APPLE_SALES_MATCH,
      active:
        "Apple doesn’t report active installs. Worked out as all downloads + re-downloads − deletions, and deletions are partial, so this is higher than the real number.",
    };
  }
  if (view === "play") {
    return {
      downloads:
        accuracy.downloads === "estimate"
          ? "Google hasn’t published install reports yet, so these are store listing acquisitions, not Play Console’s installs."
          : undefined,
      active:
        accuracy.active === "exact"
          ? "Google’s own count of devices with the app."
          : "Google hasn’t reported active devices, so this is worked out from downloads, reinstalls and uninstalls.",
    };
  }
  return {
    downloads:
      accuracy.downloads === "exact"
        ? "Play Console installs + App Store Connect Sales and Trends units. Apple’s Analytics → Overview screen counts a little differently, so it can be off by a few."
        : "The Play Store part is store listing acquisitions until Google publishes install reports.",
    reinstalls: "Play Console reinstalls + App Store Connect Sales and Trends redownloads.",
    uninstalls:
      "Play Store uninstalls match Play Console. App Store deletions are partial: Apple leaves out small numbers and recent days.",
    active: "The Play Store part is Google’s own count; the App Store part is worked out here, so the total is an estimate.",
  };
}

function MetricCard({
  available,
  value,
  prev,
  ...props
}: {
  available: boolean;
  value: number;
  prev: number;
  icon: React.ReactNode;
  accent: "primary" | "android" | "ios" | "others" | "signups";
  label: string;
  hint: string;
  tag?: React.ReactNode;
}) {
  return available ? (
    <StatCard {...props} value={formatNumber(value)} change={percentChange(value, prev)} />
  ) : (
    <StatCard {...props} value="—" hint="Not available yet" />
  );
}

function BreakdownCard({ report }: { report: StoreReport }) {
  const { has } = report;
  return (
    <Card className="pb-0">
      <Tabs defaultValue={report.breakdowns[0]!.key} className="gap-0">
        <CardHeader>
          <CardTitle>Where installs came from</CardTitle>
          <CardDescription>Totals for the selected dates</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto px-6 pt-4 pb-4">
          <TabsList>
            {report.breakdowns.map((b) => (
              <TabsTrigger key={b.key} value={b.key}>
                {b.title}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {report.breakdowns.map((b) => (
          <TabsContent key={b.key} value={b.key}>
            {b.note && <p className="px-6 pb-3 text-xs text-muted-foreground">{b.note}</p>}
            {b.rows.length === 0 ? (
              <p className="px-6 pb-8 pt-2 text-center text-sm text-muted-foreground">
                {b.key !== "country" && !has.utm ? "Not available yet" : "No data for these dates"}
              </p>
            ) : (
              <BreakdownBars breakdown={b} />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}

function BreakdownBars({ breakdown }: { breakdown: Breakdown }) {
  return (
    <div className="max-h-[28rem] overflow-y-auto px-6 pb-6">
      <BreakdownChart rows={breakdown.rows} />
    </div>
  );
}

function DailyTable({
  report,
  range,
  uniqueLabel,
  uninstallLabel,
}: {
  report: StoreReport;
  range: StoreRange;
  uniqueLabel: string;
  uninstallLabel: string;
}) {
  const { has } = report;
  const rows = [...report.daily].reverse();
  const outside = report.dataFrom && range.from < report.dataFrom;
  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>Day by day</CardTitle>
        <CardDescription>
          Newest first
          {outside && ` · store data starts ${shortDate(report.dataFrom!)}`}
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">{range.days} days</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="pb-4">
        <DailyTrendChart
          data={report.daily}
          uninstallLabel={uninstallLabel}
          showUninstalls={has.uninstalls}
        />
      </CardContent>
      <div className="max-h-[32rem] overflow-y-auto border-t">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-6">Date</TableHead>
              <TableHead className="text-right">Downloads</TableHead>
              {has.reinstalls && <TableHead className="text-right">Reinstalls</TableHead>}
              {has.uninstalls && <TableHead className="text-right">{uninstallLabel}</TableHead>}
              {has.uninstalls && <TableHead className="text-right">Net</TableHead>}
              {has.uniqueUsers && <TableHead className="pr-6 text-right">{uniqueLabel}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const net = r.downloads + r.reinstalls - r.uninstalls;
              return (
                <TableRow key={r.date}>
                  <TableCell className="pl-6 text-muted-foreground">{shortDate(r.date)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.downloads)}</TableCell>
                  {has.reinstalls && <TableCell className="text-right tabular-nums">{formatNumber(r.reinstalls)}</TableCell>}
                  {has.uninstalls && <TableCell className="text-right tabular-nums">{formatNumber(r.uninstalls)}</TableCell>}
                  {has.uninstalls && (
                    <TableCell className={`text-right tabular-nums ${net < 0 ? "text-destructive" : ""}`}>
                      {net > 0 ? "+" : ""}
                      {formatNumber(net)}
                    </TableCell>
                  )}
                  {has.uniqueUsers && (
                    <TableCell className="pr-6 text-right tabular-nums">{formatNumber(r.uniqueUsers)}</TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

/**
 * Referral vs without-referral downloads, from the referral-codes CSVs uploaded so far. Only reaches
 * as far as the latest upload.
 */
function ReferralSection({ points, latest }: { points: ReferralPoint[]; latest: ReferralPoint | null }) {
  const percent = (n: number) => (latest?.downloads ? `${Math.round((n / latest.downloads) * 100)}%` : "");
  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>Referral vs without referral</CardTitle>
        <CardDescription>
          {latest
            ? `First-time downloads (both stores) up to ${shortDate(latest.date)}, the date of the latest referral CSV`
            : "Upload the referral codes CSV on the Import page to split downloads into referral and without referral. An upload shows here once both stores’ data reach its date."}
        </CardDescription>
      </CardHeader>

      {latest && (
        <CardContent className="pb-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                Downloads
                <AccuracyInfo accuracy={latest.downloadsAccuracy} />
              </p>
              <p className="text-2xl font-semibold tabular-nums">{formatNumber(latest.downloads)}</p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="size-2 rounded-full bg-chart-4" />
                From referral
                <AccuracyInfo
                  accuracy="exact"
                  reason={`Total usage from your referral codes CSV, minus ${REFERRAL_USAGE_OFFSET}. Matches the referral portal.`}
                />
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {formatNumber(latest.referral)}
                <span className="ml-2 text-sm font-normal text-muted-foreground">{percent(latest.referral)}</span>
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="size-2 rounded-full bg-chart-3" />
                Without referral
                <AccuracyInfo
                  accuracy="estimate"
                  reason="Worked out as downloads − referral. A referral code can be used without a new download, so this is approximate."
                />
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {formatNumber(latest.withoutReferral)}
                <span className="ml-2 text-sm font-normal text-muted-foreground">{percent(latest.withoutReferral)}</span>
              </p>
            </div>
          </div>
        </CardContent>
      )}

      {points.length > 0 && (
        <div className="max-h-96 overflow-y-auto border-t">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Upload date</TableHead>
                <TableHead className="text-right">Downloads</TableHead>
                <TableHead className="text-right">From referral</TableHead>
                <TableHead className="pr-6 text-right">Without referral</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...points].reverse().map((p) => (
                <TableRow key={p.date}>
                  <TableCell className="pl-6 text-muted-foreground" title={p.note ?? undefined}>
                    {shortDate(p.date)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(p.downloads)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(p.referral)}</TableCell>
                  <TableCell className="pr-6 text-right tabular-nums">{formatNumber(p.withoutReferral)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function SetupNeeded({
  config,
  missing,
  filter,
}: {
  config: ViewConfig;
  missing: { store: AppStore; env: string[] }[];
  filter: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={config.title} description={config.description} />
      {filter}
      {missing.map(({ store, env }) => (
        <Card key={store}>
          <CardHeader>
            <CardTitle>Connect {STORES[store].name}</CardTitle>
            <CardDescription>A few settings are still empty.</CardDescription>
            <CardAction>
              <Badge variant="outline">Not connected</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              {STORES[store].setup.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="text-muted-foreground">Then fill these in .env (and in Vercel) and restart the server:</p>
            <ul className="flex flex-wrap gap-1.5">
              {env.map((name) => (
                <li key={name}>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{name}</code>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
