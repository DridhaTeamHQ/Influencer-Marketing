import { prisma } from "@/lib/prisma";
import type { AppStore, StoreStatSplit } from "@/lib/generated/prisma/enums";
import { rangeDays, type StoreRange } from "@/lib/stores/range";
import { APPLE_DELETIONS_TOTAL_REPORT, APPLE_REFERRER_REPORTS, countryName, daysAgo, dbDate, isoDay } from "@/lib/stores/shared";
import { cleanReferrerName } from "@/lib/stores/store-import";

/**
 * Store page numbers, read from the StoreStat table the syncs fill. Each store's reports cover
 * different things, so every number says which report it comes from:
 * - Google Play: the installs report when Google provides it (downloads, reinstalls, uninstalls,
 *   active devices), otherwise store listing acquisitions; UTM and visitors always come from the
 *   store performance report.
 * - App Store: downloads and re-downloads from Sales reports (they match Sales and Trends); deletions, unique devices and
 *   source/campaign from the Analytics report once Apple produces it.
 */

/** Uninstalls imported from a Play Console "Users lost" CSV, used until Google's installs report exists. */
export const PLAY_IMPORT_REPORT = "play_import_users_lost";

export type Metric = "downloads" | "reinstalls" | "uninstalls" | "uniqueUsers";
export type Totals = Record<Metric, number>;
export type DayRow = Totals & { date: string };
export type BreakdownRow = Totals & { label: string };

/** Installs split by country, source, …; `metrics` lists what its report covers (default: installs and removals). */
export type Breakdown = {
  key: string;
  title: string;
  rows: BreakdownRow[];
  metrics?: Metric[];
  /** Overrides the "Downloads" column name, e.g. when the report counts store listing acquisitions. */
  downloadsLabel?: string;
  note?: string;
};

export const BREAKDOWN_METRICS: Metric[] = ["downloads", "reinstalls", "uninstalls"];

/** Same names for untagged installs in both stores, so the Overall view adds them up. */
const noSource = (v: string) => v || "No source tag";
const noCampaign = (v: string) => v || "No campaign";

/** Play's store listing report: acquisitions and visitors by source, without reinstalls or uninstalls. */
const PLAY_LISTING = {
  metrics: ["downloads", "uniqueUsers"],
  downloadsLabel: "Acquisitions",
  note: "From Google’s store listing report: installs that came through the store listing, and listing visitors. Google doesn’t split reinstalls or uninstalls by source, so the totals differ a little from the cards above.",
} satisfies Partial<Breakdown>;

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

/**
 * How a number compares with the store's own console: "exact" matches it, "partial" is the store's
 * number with some of it left out (privacy, late days), "estimate" is worked out here.
 */
export type Accuracy = "exact" | "partial" | "estimate";

export type StoreReport = {
  daily: DayRow[];
  totals: Totals;
  prev: Totals;
  /** Which numbers this store can show yet. */
  has: Record<Metric, boolean> & { utm: boolean };
  accuracy: Record<Metric | "active", Accuracy>;
  breakdowns: Breakdown[];
  active: { value: number; hint: string } | null;
  notes: string[];
  /** First and last day with any data, to explain empty ranges. */
  dataFrom: string | null;
  dataTo: string | null;
};

async function dataSpan(store: AppStore) {
  // Monthly rows are dated the 1st, which would pull the start back to a day with no data.
  const { _min, _max } = await prisma.storeStat.aggregate({
    where: { store, report: { not: APPLE_REFERRER_REPORTS.MONTHLY } },
    _min: { date: true },
    _max: { date: true },
  });
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
      breakdown(store, listing, current, "utmSource", noSource),
      breakdown(store, listing, current, "utmCampaign", noCampaign),
      breakdown(store, listing, current, "channel"),
      breakdown(store, hasInstalls ? { report: "play_installs", split: "COUNTRY" } : { report: "play_store_listing", split: "COUNTRY" }, current, "country", (c) => countryName(c) || "Unknown"),
      dataSpan(store),
    ]);

  let active: StoreReport["active"] = null;
  let activeAccuracy: Accuracy = "estimate";
  const notes: string[] = [];
  if (hasInstalls) {
    const latest = await prisma.storeStat.findFirst({
      where: { ...where(store, installs), date: { lte: dbDate(range.to) }, activeDevices: { not: null } },
      orderBy: { date: "desc" },
    });
    if (latest?.activeDevices != null) {
      active = { value: latest.activeDevices, hint: `Devices with the app on ${isoDay(latest.date)} (Google Play)` };
      activeAccuracy = "exact";
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
    // Install reports and the imported Play Console CSV are Google's own numbers; listing acquisitions aren't installs.
    accuracy: {
      downloads: hasInstalls ? "exact" : "estimate",
      reinstalls: "exact",
      uninstalls: "exact",
      uniqueUsers: "exact",
      active: activeAccuracy,
    },
    breakdowns: [
      { key: "utmSource", title: "UTM source", rows: sources, ...PLAY_LISTING },
      { key: "utmCampaign", title: "UTM campaign", rows: campaigns, ...PLAY_LISTING },
      { key: "channel", title: "Traffic source", rows: channels, ...PLAY_LISTING },
      { key: "country", title: "Country", rows: countries, ...(!hasInstalls && PLAY_LISTING) },
    ],
    active,
    notes,
    ...span,
  };
}

/** Bundle ids Apple reports for referring apps, with the names App Store Connect shows. */
const APP_NAMES: Record<string, string> = {
  "net.whatsapp.WhatsApp": "WhatsApp Messenger",
  "net.whatsapp.WhatsAppSMB": "WhatsApp Business",
  "com.google.chrome.ios": "Google Chrome",
  "com.google.GoogleMobile": "Google",
  "com.google.Gmail": "Gmail",
  "com.google.ios.youtube": "YouTube",
  "com.burbn.instagram": "Instagram",
  "com.linkedin.LinkedIn": "LinkedIn: Community & Network",
  "com.facebook.Facebook": "Facebook",
  "com.facebook.Messenger": "Messenger",
  "ph.telegra.Telegraph": "Telegram Messenger",
  "com.atebits.Tweetie2": "X",
  "com.toyopagroup.picaboo": "Snapchat",
  "com.apple.mobilesafari": "Safari",
  "com.apple.MobileSMS": "Messages",
  "com.apple.mobilemail": "Mail",
  "org.whispersystems.signal": "Signal",
  "com.reddit.Reddit": "Reddit",
};

/** "WhatsApp Messenger" for a known app, else the bundle id; websites keep their domain. */
const referrerName = (channel: string, info: string) =>
  info ? (APP_NAMES[info] ?? cleanReferrerName(info)) : channel || "Unavailable";

const monthOf = (day: string) => `${day.slice(0, 7)}-01`;
const monthEnd = (month: string) => {
  const d = new Date(`${month}T00:00:00Z`);
  return isoDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
};

/**
 * Downloads + re-downloads by referring app and website. Apple's privacy rules drop small numbers
 * from each file, much less from monthly ones, so whole months inside the range use the monthly
 * file and the days around them use the daily files. Days covered by an uploaded App Store Connect
 * CSV take their app numbers from it instead (websites and App Store search still come from Apple's report).
 */
async function appleReferrers(range: StoreRange) {
  const store = "APP_STORE" as const;
  const [daily, monthly, csv] = await Promise.all(
    [APPLE_REFERRER_REPORTS.DAILY, APPLE_REFERRER_REPORTS.MONTHLY, APPLE_REFERRER_REPORTS.CSV].map((report) =>
      prisma.storeStat.findMany({
        where: { store, report, split: "SOURCE", date: { gte: dbDate(monthOf(range.from)), lte: dbDate(range.to) } },
        select: { date: true, channel: true, utmSource: true, downloads: true, reinstalls: true },
      }),
    ),
  );
  const inRange = (day: string) => day >= range.from && day <= range.to;
  const csvRows = csv.filter((r) => inRange(isoDay(r.date)));
  const csvDays = new Set(csvRows.map((r) => isoDay(r.date)));
  const csvMonths = new Set([...csvDays].map(monthOf));
  // A monthly file can't be split by day, so months with uploaded days use the daily files around them.
  const fullMonths = new Set(
    monthly
      .map((r) => isoDay(r.date))
      .filter((m) => m >= range.from && monthEnd(m) <= range.to && !csvMonths.has(m)),
  );
  const fromApple = [
    ...monthly.filter((r) => fullMonths.has(isoDay(r.date))),
    ...daily.filter((r) => {
      const day = isoDay(r.date);
      return inRange(day) && !fullMonths.has(monthOf(day));
    }),
  ];
  const rows = [
    ...csvRows,
    ...fromApple.filter((r) => !(r.channel === "App referrer" && csvDays.has(isoDay(r.date)))),
  ];

  const merged = new Map<string, BreakdownRow>();
  const apps = new Set<string>();
  for (const r of rows) {
    const label = referrerName(r.channel, r.utmSource);
    const row = merged.get(label) ?? { label, ...zero() };
    row.downloads += r.downloads;
    row.reinstalls += r.reinstalls;
    merged.set(label, row);
    if (r.channel === "App referrer") apps.add(label);
  }
  const all = [...merged.values()]
    .filter((r) => r.downloads + r.reinstalls > 0)
    .sort((a, b) => b.downloads + b.reinstalls - (a.downloads + a.reinstalls));
  const csvSpan = csvDays.size ? { from: [...csvDays].sort()[0]!, to: [...csvDays].sort().at(-1)! } : null;
  return { apps: all.filter((r) => apps.has(r.label)), all, hasData: rows.length > 0, csvSpan };
}

/** Says where the referrer numbers for the range came from. */
function referrerNote(csvSpan: { from: string; to: string } | null) {
  const api =
    "Apple’s App Downloads report (synced automatically) leaves out small numbers for privacy, so apps with only a few downloads can be missing; whole months use its monthly file, which leaves out less.";
  return csvSpan
    ? `Apps for ${csvSpan.from} to ${csvSpan.to} come from your uploaded App Store Connect CSV and match it. Other days: ${api}`
    : `${api} Upload App Store Connect’s “By App Referrer” CSV to get every app.`;
}

/** Referrer numbers only cover installs: downloads and re-downloads. */
const REFERRER_METRICS: Metric[] = ["downloads", "reinstalls"];

async function appStoreReport(range: StoreRange): Promise<StoreReport> {
  const store = "APP_STORE" as const;
  const current = { from: range.from, to: range.to };
  const previous = { from: range.prevFrom, to: range.prevTo };
  const sales: Source = { report: "apple_sales", split: "COUNTRY" };
  const analytics: Source = { report: "apple_analytics", split: "SOURCE" };
  const analyticsByCountry: Source = { report: "apple_analytics", split: "COUNTRY" };

  // Downloads and re-downloads always come from Sales reports: they match App Store Connect's
  // Sales and Trends (its Analytics overview classifies a few downloads differently). Apple's Analytics *report* leaves out small counts for privacy (often whole
  // days), so it only supplies what Sales can't: deletions, unique devices, sources and campaigns.
  const [firstAnalytics, lastAnalytics] = await Promise.all([
    prisma.storeStat.findFirst({ where: where(store, analytics), orderBy: { date: "asc" } }),
    prisma.storeStat.findFirst({ where: where(store, analytics), orderBy: { date: "desc" } }),
  ]);
  const hasAnalytics = firstAnalytics !== null;
  // App Store Connect's all-time deletions, if typed in: what Apple's report leaves out counts on its day.
  const extra = await deletionsLeftOut();

  const [
    salesDaily,
    analyticsDaily,
    salesPrevDaily,
    analyticsPrevDaily,
    sources,
    campaigns,
    channels,
    salesCountries,
    analyticsCountries,
    span,
    referrers,
  ] =
    await Promise.all([
      perDay(store, sales, current),
      perDay(store, analytics, current),
      perDay(store, sales, previous),
      perDay(store, analytics, previous),
      breakdown(store, analytics, current, "utmSource", noSource),
      breakdown(store, analytics, current, "utmCampaign", noCampaign),
      breakdown(store, analytics, current, "channel"),
      breakdown(store, sales, current, "country", (c) => countryName(c) || "Unknown"),
      breakdown(store, analyticsByCountry, current, "country", (c) => countryName(c) || "Unknown"),
      dataSpan(store),
      appleReferrers(range),
    ]);

  /** One day's numbers: installs from Sales, deletions and devices from Analytics (plus what it left out, on the typed total's day). */
  const dayRow = (date: string, salesMap: Map<string, Totals>, analyticsMap: Map<string, Totals>): DayRow => {
    const s = salesMap.get(date) ?? zero();
    const a = analyticsMap.get(date) ?? zero();
    const typed = extra && date === extra.asOf ? extra.leftOut : 0;
    return { date, downloads: s.downloads, reinstalls: s.reinstalls, uninstalls: a.uninstalls + typed, uniqueUsers: a.uniqueUsers };
  };
  const total = (rows: DayRow[]) =>
    rows.reduce((t, r) => {
      for (const m of METRICS) t[m] += r[m];
      return t;
    }, zero());

  const daily = rangeDays(range).map((d) => dayRow(d, salesDaily, analyticsDaily));
  const prevDaily = rangeDays({ from: range.prevFrom, days: range.days }).map((d) => dayRow(d, salesPrevDaily, analyticsPrevDaily));
  const hasTyped = extra !== null;
  // The left-out deletions count in active installs once the range reaches their day.
  const typedTotal = extra && extra.asOf <= range.to ? extra.leftOut : 0;

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
  if (hasAnalytics || hasTyped) {
    const allTime = { from: "2000-01-01", to: range.to };
    const [allSales, allAnalytics] = await Promise.all([sum(store, sales, allTime), sum(store, analytics, allTime)]);
    active = {
      value: Math.max(0, allSales.downloads + allSales.reinstalls - allAnalytics.uninstalls - typedTotal),
      hint: typedTotal
        ? "Estimated: all downloads + re-downloads − deletions (App Store Connect’s total you entered)"
        : "Estimated: all downloads + re-downloads − deletions Apple has reported",
    };
  }
  if (extra) {
    notes.push(
      `You entered ${extra.total.toLocaleString("en")} deletions all time as of ${extra.asOf} (App Store Connect). Apple’s report has ${extra.reported.toLocaleString("en")} up to that day, so the other ${extra.leftOut.toLocaleString("en")} are counted on ${extra.asOf}. As Apple reports more, that number shrinks by itself.`,
    );
  }
  if (hasAnalytics) {
    const lastDay = isoDay(lastAnalytics!.date);
    notes.push(
      `Downloads and re-downloads come from Sales reports and match App Store Connect’s Sales and Trends. Its Analytics overview shows slightly different numbers: it leaves out restores from a backup and automatic downloads on other devices (so fewer redownloads), and Apple processes it on a different schedule, so some downloads land on a different day. Deletions, sources and campaigns come from Apple’s Analytics report, which has data from ${isoDay(firstAnalytics.date)} to ${lastDay}. It leaves out small numbers for privacy, so they show less than the real totals.`,
    );
    // Apple's daily Analytics files usually lag a day or two; flag it when they're further behind.
    if (lastDay < daysAgo(3)) {
      notes.push(
        `Apple hasn’t published its Analytics report for days after ${lastDay} yet. Apple decides when (it can take several days and doesn’t give a date). Until then you can enter App Store Connect’s all-time deletions with the pencil on the Deletions card.`,
      );
    }
  } else {
    notes.push(
      "Apple hasn’t produced its Analytics report yet (it usually takes 1–2 days), so deletions, sources and campaigns aren’t available. They appear automatically once Apple’s report arrives.",
    );
  }

  return {
    daily,
    totals: total(daily),
    prev: total(prevDaily),
    has: { downloads: true, reinstalls: true, uninstalls: hasAnalytics || hasTyped, uniqueUsers: hasAnalytics, utm: hasAnalytics },
    // Sales reports match App Store Connect; the Analytics report drops small numbers and lags.
    accuracy: { downloads: "exact", reinstalls: "exact", uninstalls: "partial", uniqueUsers: "partial", active: "estimate" },
    breakdowns: [
      { key: "appReferrer", title: "App referrer", rows: referrers.apps, metrics: REFERRER_METRICS, note: referrerNote(referrers.csvSpan) },
      // The Analytics report never names the referrer, so the referrer report fills this in once it exists.
      referrers.hasData
        ? { key: "utmSource", title: "Source (website / app)", rows: referrers.all, metrics: REFERRER_METRICS, note: referrerNote(referrers.csvSpan) }
        : { key: "utmSource", title: "Source (website / app)", rows: sources },
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

/** A day in the "Overall" view, with each store's downloads + reinstalls for the chart. */
export type OverallDayRow = DayRow & Partial<Record<"play" | "apple", number>>;

const addTotals = (a: Totals, b: Totals): Totals => ({
  downloads: a.downloads + b.downloads,
  reinstalls: a.reinstalls + b.reinstalls,
  uninstalls: a.uninstalls + b.uninstalls,
  uniqueUsers: a.uniqueUsers + b.uniqueUsers,
});

/** Rows with the same label (country, source, …) added together, biggest first. */
function mergeRows(...lists: BreakdownRow[][]): BreakdownRow[] {
  const merged = new Map<string, BreakdownRow>();
  for (const r of lists.flat()) merged.set(r.label, { label: r.label, ...addTotals(merged.get(r.label) ?? zero(), r) });
  return [...merged.values()].sort((a, b) => b.downloads + b.reinstalls - (a.downloads + a.reinstalls) || b.uninstalls - a.uninstalls);
}

const ACCURACY_ORDER: Accuracy[] = ["exact", "partial", "estimate"];

/** A sum is only as exact as its least exact part. */
export const worst = (list: Accuracy[]): Accuracy =>
  list.reduce((a, b) => (ACCURACY_ORDER.indexOf(b) > ACCURACY_ORDER.indexOf(a) ? b : a), "exact");

const BREAKDOWN_TITLES: Record<string, string> = {
  utmSource: "Source",
  utmCampaign: "Campaign",
  channel: "Traffic source",
  country: "Country",
};

/**
 * Both stores added together for the "Overall" view. A number one store can't report yet counts
 * as 0 for it. Store visitors (Play) and unique devices (Apple) count different things, so they're left out.
 */
export function combineStoreReports(parts: { key: "play" | "apple"; name: string; report: StoreReport }[]): StoreReport {
  const reports = parts.map((p) => p.report);
  const sumOf = (get: (r: StoreReport) => Totals) => {
    const t = reports.map(get).reduce(addTotals, zero());
    return { ...t, uniqueUsers: 0 };
  };
  const either = (get: (r: StoreReport) => boolean) => reports.some(get);
  const actives = parts.filter((p) => p.report.active);
  const spans = (get: (r: StoreReport) => string | null) => reports.map(get).filter((d): d is string => d !== null).sort();

  return {
    daily: reports[0]!.daily.map((day, i) => {
      const row: OverallDayRow = { date: day.date, ...zero() };
      for (const p of parts) {
        const d = p.report.daily[i]!;
        Object.assign(row, addTotals(row, d));
        row[p.key] = d.downloads + d.reinstalls;
      }
      return { ...row, uniqueUsers: 0 };
    }),
    totals: sumOf((r) => r.totals),
    prev: sumOf((r) => r.prev),
    has: {
      downloads: true,
      reinstalls: either((r) => r.has.reinstalls),
      uninstalls: either((r) => r.has.uninstalls),
      uniqueUsers: false,
      utm: either((r) => r.has.utm),
    },
    accuracy: {
      downloads: worst(reports.map((r) => r.accuracy.downloads)),
      reinstalls: worst(reports.map((r) => r.accuracy.reinstalls)),
      uninstalls: worst(reports.map((r) => r.accuracy.uninstalls)),
      uniqueUsers: "estimate",
      active: worst(reports.map((r) => (r.active ? r.accuracy.active : "estimate"))),
    },
    breakdowns: [
      { key: "store", title: "Store", rows: parts.map((p) => ({ label: p.name, ...p.report.totals, uniqueUsers: 0 })) },
      ...Object.entries(BREAKDOWN_TITLES).map(([key, title]): Breakdown => {
        const found = parts.map((p) => ({ name: p.name, b: p.report.breakdowns.find((b) => b.key === key) }));
        return {
          key,
          title,
          rows: mergeRows(...found.map((f) => f.b?.rows ?? [])),
          // Only columns every store reports; visitors (Play) and devices (Apple) count different things.
          metrics: BREAKDOWN_METRICS.filter((m) => found.every((f) => (f.b?.metrics ?? BREAKDOWN_METRICS).includes(m))),
          note: found
            .filter((f) => f.b?.note)
            .map((f) => `${f.name}: ${f.b!.note}`)
            .join(" "),
        };
      }),
    ],
    active: actives.length
      ? {
          value: actives.reduce((s, p) => s + p.report.active!.value, 0),
          hint:
            actives.length === parts.length
              ? `${parts.map((p) => p.name).join(" + ")} active installs`
              : `${actives[0]!.name} only: ${actives[0]!.report.active!.hint}`,
        }
      : null,
    notes: parts.flatMap((p) => p.report.notes.map((n) => `${p.name}: ${n}`)),
    dataFrom: spans((r) => r.dataFrom)[0] ?? null,
    dataTo: spans((r) => r.dataTo).at(-1) ?? null,
  };
}

/** Code uses that aren't counted as referral downloads; taken off the total usage. */
export const REFERRAL_USAGE_OFFSET = 108;

/** One referral-codes CSV upload, compared with first-time downloads up to its date. */
export type ReferralPoint = {
  date: string;
  note: string | null;
  /** Referral downloads: total usage of all referral codes − REFERRAL_USAGE_OFFSET. */
  referral: number;
  /** First-time downloads, both stores, up to and including this date. */
  downloads: number;
  /** Exact once Google publishes install reports; before that Play's part is listing acquisitions. */
  downloadsAccuracy: Accuracy;
  withoutReferral: number;
};

/** First-time downloads per day for both stores, from the same reports as the Downloads card. */
async function firstTimeDownloads(to: string) {
  const allTime = { from: "2000-01-01", to };
  const installs: Source = { report: "play_installs", split: "TOTAL" };
  const hasInstalls = await hasRows("GOOGLE_PLAY", installs);
  const play = hasInstalls ? installs : ({ report: "play_store_listing", split: "SOURCE" } as const);
  const [playDays, appleDays] = await Promise.all([
    perDay("GOOGLE_PLAY", play, allTime),
    perDay("APP_STORE", { report: "apple_sales", split: "COUNTRY" }, allTime),
  ]);
  const days = new Map<string, number>();
  for (const map of [playDays, appleDays]) for (const [day, t] of map) days.set(day, (days.get(day) ?? 0) + t.downloads);
  return { days, accuracy: (hasInstalls ? "exact" : "estimate") as Accuracy };
}

/** Every upload (oldest first) with referral vs without-referral downloads as of its date. */
export async function getReferralReport() {
  const uploads = await prisma.referralDownload.findMany({ orderBy: { date: "asc" } });
  if (!uploads.length) return { points: [] as ReferralPoint[], latest: null };

  const { days, accuracy } = await firstTimeDownloads(isoDay(uploads.at(-1)!.date));
  const points: ReferralPoint[] = [];
  for (const u of uploads) {
    const date = isoDay(u.date);
    let downloads = 0;
    for (const [day, n] of days) if (day <= date) downloads += n;
    const referral = Math.max(0, u.count - REFERRAL_USAGE_OFFSET);
    points.push({
      date,
      note: u.note,
      referral,
      downloads,
      downloadsAccuracy: accuracy,
      withoutReferral: Math.max(0, downloads - referral),
    });
  }
  return { points, latest: points.at(-1)! };
}

/** The all-time deletions typed in from App Store Connect, and how many of them Apple's report leaves out. */
export type DeletionsTotal = { total: number; asOf: string; reported: number; leftOut: number };

/** Null until someone enters App Store Connect's all-time deletions with the pencil. */
export async function deletionsLeftOut(): Promise<DeletionsTotal | null> {
  const store = "APP_STORE" as const;
  const typed = await prisma.storeStat.findFirst({
    where: { store, report: APPLE_DELETIONS_TOTAL_REPORT },
    orderBy: { date: "desc" },
  });
  if (!typed) return null;
  const asOf = isoDay(typed.date);
  const { uninstalls: reported } = await sum(store, { report: "apple_analytics", split: "SOURCE" }, { from: "2000-01-01", to: asOf });
  return { total: typed.uninstalls, asOf, reported, leftOut: Math.max(0, typed.uninstalls - reported) };
}
