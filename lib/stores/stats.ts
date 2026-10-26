import { prisma } from "@/lib/prisma";
import type { AppStore, StoreStatSplit } from "@/lib/generated/prisma/enums";
import { rangeDays, type StoreRange } from "@/lib/stores/range";
import { countryName, dbDate, isoDay } from "@/lib/stores/shared";

/**
 * Store page numbers, read from the StoreStat table the syncs fill. Each store's reports cover
 * different things, so every number says which report it comes from:
 * - Google Play: the installs report when Google provides it (downloads, reinstalls, uninstalls,
 *   active devices), otherwise store listing acquisitions; UTM and visitors always come from the
 *   store performance report.
 * - App Store: downloads and re-downloads from Sales reports (they match App Store Connect); deletions, unique devices and
 *   source/campaign from the Analytics report once Apple produces it.
 */

/** Uninstalls imported from a Play Console "Users lost" CSV, used until Google's installs report exists. */
export const PLAY_IMPORT_REPORT = "play_import_users_lost";

type Metric = "downloads" | "reinstalls" | "uninstalls" | "uniqueUsers";
export type Totals = Record<Metric, number>;
export type DayRow = Totals & { date: string };
export type BreakdownRow = Totals & { label: string };

const METRICS: Metric[] = ["downloads", "reinstalls", "uninstalls", "uniqueUsers"];
const zero = (): Totals => ({ downloads: 0, reinstalls: 0, uninstalls: 0, uniqueUsers: 0 });

type Source = { report: string; split: StoreStatSplit };
type Between = { from: string; to: string };

/** Limits a query to some days within the range, or to every day except some. */
type DayFilter = { only?: string[]; except?: string[] };

const where = (store: AppStore, source: Source, between?: Between, days?: DayFilter) => ({
  store,
  report: source.report,
  split: source.split,
  ...((between || days) && {
    date: {
      ...(between && { gte: dbDate(between.from), lte: dbDate(between.to) }),
      ...(days?.only && { in: days.only.map(dbDate) }),
      ...(days?.except && { notIn: days.except.map(dbDate) }),
    },
  }),
});

const SUM = { downloads: true, reinstalls: true, uninstalls: true, uniqueUsers: true } as const;

async function sum(store: AppStore, source: Source, between?: Between, days?: DayFilter): Promise<Totals> {
  const { _sum } = await prisma.storeStat.aggregate({ where: where(store, source, between, days), _sum: SUM });
  return { downloads: _sum.downloads ?? 0, reinstalls: _sum.reinstalls ?? 0, uninstalls: _sum.uninstalls ?? 0, uniqueUsers: _sum.uniqueUsers ?? 0 };
}

async function perDay(store: AppStore, source: Source, between: Between) {
  const rows = await prisma.storeStat.groupBy({ by: ["date"], where: where(store, source, between), _sum: SUM });
  return new Map(
    rows.map((r) => [
      isoDay(r.date),
      { downloads: r._sum.downloads ?? 0, reinstalls: r._sum.reinstalls ?? 0, uninstalls: r._sum.uninstalls ?? 0, uniqueUsers: r._sum.uniqueUsers ?? 0 },
    ]),
  );
}

async function breakdown(
  store: AppStore,
  source: Source,
  between: Between,
  field: "channel" | "utmSource" | "utmCampaign" | "country",
  label: (value: string) => string = (v) => v || "(none)",
  /** Extra sources whose rows are added in, e.g. Sales reports for days Analytics doesn't cover. */
  ...extra: { source: Source; days: DayFilter }[]
): Promise<BreakdownRow[]> {
  const groups = await Promise.all(
    [{ source, days: undefined as DayFilter | undefined }, ...extra].map((part) =>
      prisma.storeStat.groupBy({ by: [field], where: where(store, part.source, between, part.days), _sum: SUM }),
    ),
  );
  const merged = new Map<string, BreakdownRow>();
  for (const r of groups.flat()) {
    const name = label(r[field] as string);
    const row = merged.get(name) ?? { label: name, ...zero() };
    for (const m of METRICS) row[m] += r._sum[m] ?? 0;
    merged.set(name, row);
  }
  return [...merged.values()]
    .filter((r) => r.downloads + r.reinstalls + r.uninstalls + r.uniqueUsers > 0)
    .sort((a, b) => b.downloads + b.reinstalls - (a.downloads + a.reinstalls) || b.uninstalls - a.uninstalls);
}

const hasRows = async (store: AppStore, source: Source) =>
  (await prisma.storeStat.count({ where: where(store, source), take: 1 })) > 0;

/** Takes the listed metrics from `b`, the rest from `a`. */
function pick(a: Totals, b: Totals, fromB: Metric[]): Totals {
  const out = { ...a };
  for (const m of fromB) out[m] = b[m];
  return out;
}

export type StoreReport = {
  daily: DayRow[];
  totals: Totals;
  prev: Totals;
  /** Which numbers this store can show yet. */
  has: Record<Metric, boolean> & { utm: boolean };
  breakdowns: { key: string; title: string; rows: BreakdownRow[] }[];
  active: { value: number; hint: string } | null;
  notes: string[];
  /** First and last day with any data, to explain empty ranges. */
  dataFrom: string | null;
  dataTo: string | null;
};

async function dataSpan(store: AppStore) {
  const { _min, _max } = await prisma.storeStat.aggregate({ where: { store }, _min: { date: true }, _max: { date: true } });
  return { dataFrom: _min.date ? isoDay(_min.date) : null, dataTo: _max.date ? isoDay(_max.date) : null };
}

function dailyRows(range: StoreRange, ...maps: { map: Map<string, Totals>; metrics: Metric[] }[]): DayRow[] {
  return rangeDays(range).map((date) => {
    const row: DayRow = { date, ...zero() };
    for (const { map, metrics } of maps) for (const m of metrics) row[m] = map.get(date)?.[m] ?? 0;
    return row;
  });
}

async function googlePlayReport(range: StoreRange): Promise<StoreReport> {
  const store = "GOOGLE_PLAY" as const;
  const current = { from: range.from, to: range.to };
  const previous = { from: range.prevFrom, to: range.prevTo };
  const installs: Source = { report: "play_installs", split: "TOTAL" };
  const listing: Source = { report: "play_store_listing", split: "SOURCE" };
  const imported: Source = { report: PLAY_IMPORT_REPORT, split: "TOTAL" };
  const hasInstalls = await hasRows(store, installs);
  // Google's own uninstall numbers win; the CSV import only fills in until they exist.
  const useImport = !hasInstalls && (await hasRows(store, imported));
  const main = hasInstalls ? installs : listing;
  const fromMain: Metric[] = hasInstalls ? ["downloads", "reinstalls", "uninstalls"] : ["downloads"];

  const [
    mainDaily,
    listingDaily,
    importDaily,
    mainNow,
    listingNow,
    importNow,
    mainPrev,
    listingPrev,
    importPrev,
    sources,
    campaigns,
    channels,
    countries,
    span,
  ] =
    await Promise.all([
      perDay(store, main, current),
      perDay(store, listing, current),
      perDay(store, imported, current),
      sum(store, main, current),
      sum(store, listing, current),
      sum(store, imported, current),
      sum(store, main, previous),
      sum(store, listing, previous),
      sum(store, imported, previous),
      breakdown(store, listing, current, "utmSource"),
      breakdown(store, listing, current, "utmCampaign"),
      breakdown(store, listing, current, "channel"),
      breakdown(store, hasInstalls ? { report: "play_installs", split: "COUNTRY" } : { report: "play_store_listing", split: "COUNTRY" }, current, "country", (c) => countryName(c) || "Unknown"),
      dataSpan(store),
    ]);

  let active: StoreReport["active"] = null;
  const notes: string[] = [];
  if (hasInstalls) {
    const latest = await prisma.storeStat.findFirst({
      where: { ...where(store, installs), date: { lte: dbDate(range.to) }, activeDevices: { not: null } },
      orderBy: { date: "desc" },
    });
    if (latest?.activeDevices != null) {
      active = { value: latest.activeDevices, hint: `Devices with the app on ${isoDay(latest.date)} (Google Play)` };
    } else {
      const all = await sum(store, installs, { from: "2000-01-01", to: range.to });
      active = {
        value: Math.max(0, all.downloads + all.reinstalls - all.uninstalls),
        hint: "All-time downloads + reinstalls − uninstalls",
      };
    }
  } else if (useImport) {
    const [allListing, allImported, importSpan] = await Promise.all([
      sum(store, listing, { from: "2000-01-01", to: range.to }),
      sum(store, imported, { from: "2000-01-01", to: range.to }),
      prisma.storeStat.aggregate({ where: where(store, imported), _min: { date: true }, _max: { date: true } }),
    ]);
    active = {
      value: Math.max(0, allListing.downloads - allImported.uninstalls),
      hint: "Estimated: store listing acquisitions − imported uninstalls",
    };
    notes.push(
      `Uninstalls come from your imported “Users lost” CSV (${isoDay(importSpan._min.date!)} to ${isoDay(importSpan._max.date!)}). Import a newer export to add recent days. Downloads are store listing acquisitions until Google publishes install reports for this app.`,
    );
  } else {
    notes.push(
      "Google hasn’t published install reports for this app yet, so downloads are store listing acquisitions, and reinstalls, uninstalls and active installs aren’t available. Import a “Users lost” CSV from Play Console to see uninstalls now; Google’s own numbers replace it automatically once they arrive.",
    );
  }

  const importMetrics: Metric[] = useImport ? ["uninstalls"] : [];
  // Store listing visitors are counted per traffic source, so the same person can show up twice.
  return {
    daily: dailyRows(
      range,
      { map: mainDaily, metrics: fromMain },
      { map: listingDaily, metrics: ["uniqueUsers"] },
      { map: importDaily, metrics: importMetrics },
    ),
    totals: pick(pick(pick(zero(), mainNow, fromMain), listingNow, ["uniqueUsers"]), importNow, importMetrics),
    prev: pick(pick(pick(zero(), mainPrev, fromMain), listingPrev, ["uniqueUsers"]), importPrev, importMetrics),
    has: { downloads: true, reinstalls: hasInstalls, uninstalls: hasInstalls || useImport, uniqueUsers: true, utm: true },
    breakdowns: [
      { key: "utmSource", title: "UTM source", rows: sources },
      { key: "utmCampaign", title: "UTM campaign", rows: campaigns },
      { key: "channel", title: "Traffic source", rows: channels },
      { key: "country", title: "Country", rows: countries },
    ],
    active,
    notes,
    ...span,
  };
}

async function appStoreReport(range: StoreRange): Promise<StoreReport> {
  const store = "APP_STORE" as const;
  const current = { from: range.from, to: range.to };
  const previous = { from: range.prevFrom, to: range.prevTo };
  const sales: Source = { report: "apple_sales", split: "COUNTRY" };
  const analytics: Source = { report: "apple_analytics", split: "SOURCE" };
  const analyticsByCountry: Source = { report: "apple_analytics", split: "COUNTRY" };

  // Downloads and re-downloads always come from Sales reports: they match App Store Connect's
  // Analytics screen. Apple's Analytics *report* leaves out small counts for privacy (often whole
  // days), so it only supplies what Sales can't: deletions, unique devices, sources and campaigns.
  const firstAnalytics = await prisma.storeStat.findFirst({ where: where(store, analytics), orderBy: { date: "asc" } });
  const hasAnalytics = firstAnalytics !== null;

  const [salesDaily, analyticsDaily, salesPrevDaily, analyticsPrevDaily, sources, campaigns, channels, salesCountries, analyticsCountries, span] =
    await Promise.all([
      perDay(store, sales, current),
      perDay(store, analytics, current),
      perDay(store, sales, previous),
      perDay(store, analytics, previous),
      breakdown(store, analytics, current, "utmSource"),
      breakdown(store, analytics, current, "utmCampaign"),
      breakdown(store, analytics, current, "channel"),
      breakdown(store, sales, current, "country", (c) => countryName(c) || "Unknown"),
      breakdown(store, analyticsByCountry, current, "country", (c) => countryName(c) || "Unknown"),
      dataSpan(store),
    ]);

  /** One day's numbers: installs from Sales, deletions and devices from Analytics. */
  const dayRow = (date: string, salesMap: Map<string, Totals>, analyticsMap: Map<string, Totals>): DayRow => {
    const s = salesMap.get(date) ?? zero();
    const a = analyticsMap.get(date) ?? zero();
    return { date, downloads: s.downloads, reinstalls: s.reinstalls, uninstalls: a.uninstalls, uniqueUsers: a.uniqueUsers };
  };
  const total = (rows: DayRow[]) =>
    rows.reduce((t, r) => {
      for (const m of METRICS) t[m] += r[m];
      return t;
    }, zero());

  const daily = rangeDays(range).map((d) => dayRow(d, salesDaily, analyticsDaily));
  const prevDaily = rangeDays({ from: range.prevFrom, days: range.days }).map((d) =>
    dayRow(d, salesPrevDaily, analyticsPrevDaily),
  );

  // Countries: installs from Sales, with Analytics' deletions added per country.
  const countries = new Map(salesCountries.map((r) => [r.label, { ...r, uninstalls: 0, uniqueUsers: 0 }]));
  for (const r of analyticsCountries) {
    const row = countries.get(r.label) ?? { label: r.label, ...zero() };
    row.uninstalls += r.uninstalls;
    row.uniqueUsers += r.uniqueUsers;
    countries.set(r.label, row);
  }

  const notes: string[] = [];
  let active: StoreReport["active"] = null;
  if (hasAnalytics) {
    const allTime = { from: "2000-01-01", to: range.to };
    const [allSales, allAnalytics] = await Promise.all([sum(store, sales, allTime), sum(store, analytics, allTime)]);
    active = {
      value: Math.max(0, allSales.downloads + allSales.reinstalls - allAnalytics.uninstalls),
      hint: "Estimated: all downloads + re-downloads − deletions Apple has reported",
    };
    notes.push(
      `Downloads and re-downloads come from Sales reports and match App Store Connect. Deletions, sources and campaigns come from Apple’s Analytics report (from ${isoDay(firstAnalytics.date)}), which leaves out small numbers for privacy, so they show less than the real totals.`,
    );
  } else {
    notes.push(
      "Apple hasn’t produced its Analytics report yet (it usually takes 1–2 days), so deletions, sources and campaigns aren’t available. They appear automatically once Apple’s report arrives.",
    );
  }

  return {
    daily,
    totals: total(daily),
    prev: total(prevDaily),
    has: { downloads: true, reinstalls: true, uninstalls: hasAnalytics, uniqueUsers: hasAnalytics, utm: hasAnalytics },
    breakdowns: [
      { key: "utmSource", title: "Source (website / app)", rows: sources },
      { key: "utmCampaign", title: "Campaign", rows: campaigns },
      { key: "channel", title: "Source type", rows: channels },
      {
        key: "country",
        title: "Country",
        rows: [...countries.values()].sort((a, b) => b.downloads + b.reinstalls - (a.downloads + a.reinstalls) || b.uninstalls - a.uninstalls),
      },
    ],
    active,
    notes,
    ...span,
  };
}

export const getStoreReport = (store: AppStore, range: StoreRange) =>
  store === "GOOGLE_PLAY" ? googlePlayReport(range) : appStoreReport(range);
