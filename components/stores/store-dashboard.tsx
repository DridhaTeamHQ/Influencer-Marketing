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
import { StoreChart } from "@/components/stores/store-chart";
import { StoreRangeFilter } from "@/components/stores/store-range-filter";
import { SyncButton } from "@/components/stores/sync-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { percentChange } from "@/lib/analytics";
import { formatNumber, timeAgo } from "@/lib/format";
import type { AppStore } from "@/lib/generated/prisma/enums";
import { parseStoreRange, type StoreRange } from "@/lib/stores/range";
import { getStoreReport, type BreakdownRow, type StoreReport } from "@/lib/stores/stats";
import { getSyncStatus, missingEnvFor, runSync } from "@/lib/stores/sync";

export type StoreConfig = {
  store: AppStore;
  title: string;
  description: string;
  basePath: string;
  accent: "android" | "ios";
  color: string;
  uniqueLabel: string;
  uniqueHint: string;
  /** What the store calls removals: "Uninstalls" (Play) or "Deletions" (Apple). */
  uninstallLabel: string;
  /** Show "Total downloads" (first-time + reinstalls) instead of the unique users card. */
  totalDownloadsCard?: boolean;
  setup: string[];
  /** Extra buttons next to "Sync now", e.g. the Play Store CSV import. */
  actions?: React.ReactNode;
};

const shortDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function StoreDashboardSkeleton({ config }: { config: StoreConfig }) {
  return (
    <>
      <PageHeader title={config.title} description={config.description} />
      <div className="space-y-4">
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

export async function StoreDashboard({
  config,
  searchParams,
}: {
  config: StoreConfig;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const range = parseStoreRange(await searchParams);
  const { store } = config;

  const missing = missingEnvFor(store);
  if (missing.length) return <SetupNeeded config={config} missing={missing} />;

  // Vercel sends its OIDC token with the request; read it here, since `after` can't.
  const oidcToken = (await headers()).get("x-vercel-oidc-token");
  let status = await getSyncStatus(store);
  if (!status.syncedAt && status.stale) {
    // Nothing copied yet: wait for the first sync so the page isn't empty.
    await runSync(store, oidcToken);
    status = await getSyncStatus(store);
  } else if (status.stale) {
    after(() => runSync(store, oidcToken));
  }

  const report = await getStoreReport(store, range);
  const { totals, prev, has } = report;
  const net = totals.downloads + totals.reinstalls - totals.uninstalls;

  return (
    <div className="space-y-6">
      <PageHeader title={config.title} description={config.description}>
        <span className="text-xs text-muted-foreground">
          {status.syncedAt ? `Synced ${timeAgo(status.syncedAt)}` : "Not synced yet"}
        </span>
        {config.actions}
        <SyncButton store={store} path={config.basePath} />
      </PageHeader>

      {status.error && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm break-words text-destructive">
          Last sync failed: {status.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {shortDate(range.from)} – {shortDate(range.to)}
          <span className="ml-2 text-sm font-normal text-muted-foreground">{range.days} days</span>
        </h2>
        <StoreRangeFilter range={range} basePath={config.basePath} />
      </div>

      {report.notes.map((note) => (
        <p key={note} className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          {note}
        </p>
      ))}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={<DownloadIcon />}
          accent={config.accent}
          label="Downloads"
          value={formatNumber(totals.downloads)}
          change={percentChange(totals.downloads, prev.downloads)}
          hint={`First-time installs · ${formatNumber(prev.downloads)} the period before`}
        />
        <MetricCard
          available={has.reinstalls}
          icon={<RotateCcwIcon />}
          accent="signups"
          label="Reinstalls"
          value={totals.reinstalls}
          prev={prev.reinstalls}
          hint="Installed again by someone who had it before"
        />
        <MetricCard
          available={has.uninstalls}
          icon={<Trash2Icon />}
          accent="others"
          label={config.uninstallLabel}
          value={totals.uninstalls}
          prev={prev.uninstalls}
          hint={`Net this period: ${net >= 0 ? "+" : ""}${formatNumber(net)}`}
        />
        <StatCard
          icon={<SmartphoneIcon />}
          accent="primary"
          label="Active installs"
          value={report.active ? formatNumber(report.active.value) : "—"}
          hint={report.active?.hint ?? `Needs ${config.uninstallLabel.toLowerCase()} data`}
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
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily installs</CardTitle>
          <CardDescription>
            {[`Downloads`, has.reinstalls && "reinstalls", has.uninstalls && config.uninstallLabel.toLowerCase()].filter(Boolean).join(", ")} per day
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StoreChart
            data={report.daily}
            color={config.color}
            showReinstalls={has.reinstalls}
            showUninstalls={has.uninstalls}
            uninstallLabel={config.uninstallLabel}
          />
        </CardContent>
      </Card>

      <BreakdownCard report={report} uninstallLabel={config.uninstallLabel} />

      <DailyTable report={report} range={range} uniqueLabel={config.uniqueLabel} uninstallLabel={config.uninstallLabel} />
    </div>
  );
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
}) {
  return available ? (
    <StatCard {...props} value={formatNumber(value)} change={percentChange(value, prev)} />
  ) : (
    <StatCard {...props} value="—" hint="Not available yet" />
  );
}

function BreakdownCard({ report, uninstallLabel }: { report: StoreReport; uninstallLabel: string }) {
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
            {b.rows.length === 0 ? (
              <p className="px-6 pb-8 pt-2 text-center text-sm text-muted-foreground">
                {b.key !== "country" && !has.utm ? "Not available yet" : "No data for these dates"}
              </p>
            ) : (
              <BreakdownTable title={b.title} rows={b.rows} report={report} uninstallLabel={uninstallLabel} />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}

function BreakdownTable({
  title,
  rows,
  report,
  uninstallLabel,
}: {
  title: string;
  rows: BreakdownRow[];
  report: StoreReport;
  uninstallLabel: string;
}) {
  const { has } = report;
  const total = rows.reduce((s, r) => s + r.downloads + r.reinstalls, 0);
  return (
    <div className="max-h-96 overflow-y-auto border-t">
      <Table>
        <TableHeader className="sticky top-0 bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-6">{title}</TableHead>
            <TableHead className="text-right">Downloads</TableHead>
            {has.reinstalls && <TableHead className="text-right">Reinstalls</TableHead>}
            {has.uninstalls && <TableHead className="text-right">{uninstallLabel}</TableHead>}
            <TableHead className="pr-6 text-right">Share</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.label}>
              <TableCell className="max-w-72 truncate pl-6" title={r.label}>
                {r.label}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(r.downloads)}</TableCell>
              {has.reinstalls && <TableCell className="text-right tabular-nums">{formatNumber(r.reinstalls)}</TableCell>}
              {has.uninstalls && <TableCell className="text-right tabular-nums">{formatNumber(r.uninstalls)}</TableCell>}
              <TableCell className="pr-6 text-right tabular-nums text-muted-foreground">
                {total ? `${Math.round(((r.downloads + r.reinstalls) / total) * 100)}%` : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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

function SetupNeeded({ config, missing }: { config: StoreConfig; missing: string[] }) {
  return (
    <>
      <PageHeader title={config.title} description={config.description} />
      <Card>
        <CardHeader>
          <CardTitle>Connect {config.title}</CardTitle>
          <CardDescription>A few settings are still empty.</CardDescription>
          <CardAction>
            <Badge variant="outline">Not connected</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            {config.setup.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="text-muted-foreground">Then fill these in .env (and in Vercel) and restart the server:</p>
          <ul className="flex flex-wrap gap-1.5">
            {missing.map((name) => (
              <li key={name}>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{name}</code>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
