import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { PAGE_SIZE, type ListSort, type ListStatus } from "@/lib/list-params";

export const RANGES = { "7d": 7, "30d": 30, "90d": 90 } as const;
export type RangeKey = keyof typeof RANGES;

export function parseRange(value: string | string[] | undefined): RangeKey {
  return typeof value === "string" && value in RANGES ? (value as RangeKey) : "30d";
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function rangeBounds(range: RangeKey) {
  const days = RANGES[range];
  const now = new Date();
  const start = startOfUtcDay(new Date(now.getTime() - (days - 1) * 86_400_000));
  const prevStart = new Date(start.getTime() - days * 86_400_000);
  return { days, start, prevStart };
}

type Filter = { influencerId?: string };

/** SQL fragment that limits clicks (alias c) to one influencer when a filter is given. */
function influencerClause(filter: Filter) {
  return filter.influencerId
    ? Prisma.sql`AND c."linkId" IN (SELECT id FROM "Link" WHERE "influencerId" = ${filter.influencerId})`
    : Prisma.empty;
}

// ---------- Headline numbers ----------

type SummaryRow = {
  clicks: number;
  prevClicks: number;
  android: number;
  prevAndroid: number;
  ios: number;
  prevIos: number;
  windows: number;
  mac: number;
  unique: number;
  prevUnique: number;
  uniqueAndroid: number;
  uniqueIos: number;
  uniqueOthers: number;
  clicksToday: number;
};

/**
 * Every headline number for the period and the period before it, in a single query.
 * Android and iOS are tracked on their own; everything else (Windows, Mac, …) counts as "others".
 */
export async function getSummary(range: RangeKey, filter: Filter = {}) {
  const { start, prevStart } = rangeBounds(range);
  const today = startOfUtcDay(new Date());

  const [row] = await prisma.$queryRaw<SummaryRow[]>`
    SELECT
      count(*) FILTER (WHERE cur)::int                                  AS "clicks",
      count(*) FILTER (WHERE NOT cur)::int                              AS "prevClicks",
      count(*) FILTER (WHERE cur AND c.device = 'ANDROID')::int         AS "android",
      count(*) FILTER (WHERE NOT cur AND c.device = 'ANDROID')::int     AS "prevAndroid",
      count(*) FILTER (WHERE cur AND c.device = 'IOS')::int             AS "ios",
      count(*) FILTER (WHERE NOT cur AND c.device = 'IOS')::int         AS "prevIos",
      count(*) FILTER (WHERE cur AND c.os = 'Windows')::int             AS "windows",
      count(*) FILTER (WHERE cur AND c.os = 'macOS')::int               AS "mac",
      count(DISTINCT c."visitorId") FILTER (WHERE cur)::int             AS "unique",
      count(DISTINCT c."visitorId") FILTER (WHERE NOT cur)::int         AS "prevUnique",
      count(DISTINCT c."visitorId") FILTER (WHERE cur AND c.device = 'ANDROID')::int AS "uniqueAndroid",
      count(DISTINCT c."visitorId") FILTER (WHERE cur AND c.device = 'IOS')::int     AS "uniqueIos",
      count(DISTINCT c."visitorId") FILTER (WHERE cur AND c.device NOT IN ('ANDROID', 'IOS'))::int AS "uniqueOthers",
      count(*) FILTER (WHERE c."createdAt" >= ${today})::int            AS "clicksToday"
    FROM (
      SELECT *, "createdAt" >= ${start} AS cur FROM "Click"
    ) c
    WHERE c."isBot" = false AND c."createdAt" >= ${prevStart} ${influencerClause(filter)}`;

  const others = row.clicks - row.android - row.ios;
  const prevOthers = row.prevClicks - row.prevAndroid - row.prevIos;
  return { ...row, others, prevOthers };
}

// ---------- Daily series ----------

export type DailyPoint = {
  date: string;
  clicks: number;
  android: number;
  ios: number;
  others: number;
  unique: number;
  signups: number;
};

export async function getDailyClicks(range: RangeKey, filter: Filter = {}): Promise<DailyPoint[]> {
  const { days, start } = rangeBounds(range);

  const [rows, signupRows] = await Promise.all([
    prisma.$queryRaw<{ day: Date; clicks: number; android: number; ios: number; unique: number }[]>`
      SELECT date_trunc('day', c."createdAt") AS day,
             count(*)::int AS clicks,
             count(*) FILTER (WHERE c.device = 'ANDROID')::int AS android,
             count(*) FILTER (WHERE c.device = 'IOS')::int AS ios,
             count(DISTINCT c."visitorId")::int AS "unique"
      FROM "Click" c
      WHERE c."isBot" = false AND c."createdAt" >= ${start} ${influencerClause(filter)}
      GROUP BY 1`,
    prisma.signupCount.groupBy({
      by: ["date"],
      where: signupWhere(start, undefined, filter),
      _sum: { count: true },
    }),
  ]);

  const signupsByDay = new Map(signupRows.map((r) => [r.date.toISOString().slice(0, 10), r._sum.count ?? 0]));
  const byDay = new Map(rows.map((r) => [new Date(r.day).toISOString().slice(0, 10), r]));

  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const row = byDay.get(date);
    const clicks = row?.clicks ?? 0;
    const android = row?.android ?? 0;
    const ios = row?.ios ?? 0;
    return {
      date,
      clicks,
      android,
      ios,
      others: clicks - android - ios,
      unique: row?.unique ?? 0,
      signups: signupsByDay.get(date) ?? 0,
    };
  });
}

// ---------- Breakdowns ----------

export async function getTopValues(
  field: "country" | "referrer" | "browser",
  range: RangeKey,
  filter: Filter = {},
  limit = 5,
) {
  const { start } = rangeBounds(range);
  const rows = await prisma.click.groupBy({
    by: [field],
    where: {
      isBot: false,
      createdAt: { gte: start },
      ...(filter.influencerId ? { link: { influencerId: filter.influencerId } } : {}),
    },
    _count: { _all: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });
  return rows.map((r) => ({ label: r[field] ?? "Unknown", clicks: r._count._all }));
}

// ---------- Leaderboard ----------

export type LeaderboardRow = {
  id: string;
  name: string;
  handle: string | null;
  clicks: number;
  android: number;
  ios: number;
  others: number;
  signups: number;
};

/** Influencers ranked by clicks in the period, with their platform split and signups. */
export async function getLeaderboard(range: RangeKey, limit = 10) {
  const { start } = rangeBounds(range);
  return prisma.$queryRaw<LeaderboardRow[]>`
    WITH clicks AS (
      SELECT l."influencerId",
             count(*)::int AS clicks,
             count(*) FILTER (WHERE c.device = 'ANDROID')::int AS android,
             count(*) FILTER (WHERE c.device = 'IOS')::int AS ios
      FROM "Click" c
      JOIN "Link" l ON l.id = c."linkId"
      WHERE c."isBot" = false AND c."createdAt" >= ${start}
      GROUP BY 1
    ),
    signups AS (
      SELECT "influencerId", sum(count)::int AS signups
      FROM "SignupCount"
      WHERE date >= ${start}::date
      GROUP BY 1
    )
    SELECT i.id, i.name, i.handle,
           COALESCE(c.clicks, 0) AS clicks,
           COALESCE(c.android, 0) AS android,
           COALESCE(c.ios, 0) AS ios,
           COALESCE(c.clicks - c.android - c.ios, 0) AS others,
           COALESCE(s.signups, 0) AS signups
    FROM "Influencer" i
    LEFT JOIN clicks c ON c."influencerId" = i.id
    LEFT JOIN signups s ON s."influencerId" = i.id
    WHERE c.clicks > 0 OR s.signups > 0
    ORDER BY clicks DESC, signups DESC, i.name
    LIMIT ${limit}`;
}

// ---------- Influencer list (search, filter, sort, pages) ----------

export type InfluencerListRow = {
  id: string;
  name: string;
  handle: string | null;
  platform: string;
  followers: number | null;
  referralCode: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  isActive: boolean;
  linkId: string | null;
  linkCode: string | null;
  linkActive: boolean | null;
  last7: number;
};

export async function getInfluencerList(opts: {
  q: string;
  status: ListStatus;
  sort: ListSort;
  page: number;
}) {
  const term = opts.q.trim().replace(/^@/, "");
  const like = `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

  const where = Prisma.sql`WHERE true
    ${term ? Prisma.sql`AND (i.name ILIKE ${like} OR i.handle ILIKE ${like} OR i."referralCode" ILIKE ${like} OR l.code ILIKE ${like})` : Prisma.empty}
    ${opts.status === "active" ? Prisma.sql`AND i."isActive" = true` : Prisma.empty}
    ${opts.status === "paused" ? Prisma.sql`AND i."isActive" = false` : Prisma.empty}`;

  const orderBy =
    opts.sort === "name"
      ? Prisma.sql`ORDER BY lower(i.name), i."createdAt" DESC`
      : opts.sort === "clicks"
        ? Prisma.sql`ORDER BY last7 DESC, i."createdAt" DESC`
        : Prisma.sql`ORDER BY i."createdAt" DESC`;

  const offset = (Math.max(opts.page, 1) - 1) * PAGE_SIZE;

  const [rows, [{ total }], statusCounts] = await Promise.all([
    prisma.$queryRaw<InfluencerListRow[]>`
      WITH recent AS (
        SELECT c."linkId", count(*)::int AS last7
        FROM "Click" c
        WHERE c."isBot" = false AND c."createdAt" >= now() - interval '7 days'
        GROUP BY 1
      )
      SELECT i.id, i.name, i.handle, i.platform::text AS platform, i.followers, i."referralCode",
             i."periodStart", i."periodEnd", i."isActive",
             l.id AS "linkId", l.code AS "linkCode", l."isActive" AS "linkActive",
             COALESCE(r.last7, 0) AS last7
      FROM "Influencer" i
      LEFT JOIN "Link" l ON l."influencerId" = i.id
      LEFT JOIN recent r ON r."linkId" = l.id
      ${where}
      ${orderBy}
      LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total
      FROM "Influencer" i
      LEFT JOIN "Link" l ON l."influencerId" = i.id
      ${where}`,
    prisma.influencer.groupBy({ by: ["isActive"], _count: { _all: true } }),
  ]);

  const active = statusCounts.find((s) => s.isActive)?._count._all ?? 0;
  const paused = statusCounts.find((s) => !s.isActive)?._count._all ?? 0;

  return {
    rows,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts: { all: active + paused, active, paused },
  };
}

// ---------- Referral signups (entered by hand from the referral portal) ----------

function signupWhere(from: Date, to: Date | undefined, filter: Filter) {
  return {
    date: { gte: from, ...(to ? { lt: to } : {}) },
    ...(filter.influencerId ? { influencerId: filter.influencerId } : {}),
  };
}

async function sumSignups(from: Date, to: Date | undefined, filter: Filter) {
  const { _sum } = await prisma.signupCount.aggregate({
    where: signupWhere(from, to, filter),
    _sum: { count: true },
  });
  return _sum.count ?? 0;
}

export async function getSignupSummary(range: RangeKey, filter: Filter = {}) {
  const { start, prevStart } = rangeBounds(range);
  const [signups, prevSignups] = await Promise.all([
    sumSignups(start, undefined, filter),
    sumSignups(prevStart, start, filter),
  ]);
  return { signups, prevSignups };
}

/** "12%" signups per click, or null when there are no clicks. */
export function conversionRate(signups: number, clicks: number) {
  return clicks > 0 ? `${Math.round((signups / clicks) * 100)}%` : null;
}

export function percentChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ---------- Partner links (LinkedIn): kept apart from influencer clicks ----------

type PartnerSummaryRow = Omit<SummaryRow, "clicksToday"> & { linkedin: number; prevLinkedin: number };

export async function getPartnerSummary(range: RangeKey, linkId: string) {
  const { start, prevStart } = rangeBounds(range);

  const [row] = await prisma.$queryRaw<PartnerSummaryRow[]>`
    SELECT
      count(*) FILTER (WHERE cur)::int                                  AS "clicks",
      count(*) FILTER (WHERE NOT cur)::int                              AS "prevClicks",
      count(*) FILTER (WHERE cur AND c.device = 'ANDROID')::int         AS "android",
      count(*) FILTER (WHERE NOT cur AND c.device = 'ANDROID')::int     AS "prevAndroid",
      count(*) FILTER (WHERE cur AND c.device = 'IOS')::int             AS "ios",
      count(*) FILTER (WHERE NOT cur AND c.device = 'IOS')::int         AS "prevIos",
      count(*) FILTER (WHERE cur AND c.os = 'Windows')::int             AS "windows",
      count(*) FILTER (WHERE cur AND c.os = 'macOS')::int               AS "mac",
      count(*) FILTER (WHERE cur AND c.referrer LIKE '%linkedin%')::int     AS "linkedin",
      count(*) FILTER (WHERE NOT cur AND c.referrer LIKE '%linkedin%')::int AS "prevLinkedin",
      count(DISTINCT c."visitorId") FILTER (WHERE cur)::int             AS "unique",
      count(DISTINCT c."visitorId") FILTER (WHERE NOT cur)::int         AS "prevUnique",
      count(DISTINCT c."visitorId") FILTER (WHERE cur AND c.device = 'ANDROID')::int AS "uniqueAndroid",
      count(DISTINCT c."visitorId") FILTER (WHERE cur AND c.device = 'IOS')::int     AS "uniqueIos",
      count(DISTINCT c."visitorId") FILTER (WHERE cur AND c.device NOT IN ('ANDROID', 'IOS'))::int AS "uniqueOthers"
    FROM (
      SELECT *, "createdAt" >= ${start} AS cur FROM "PartnerClick"
    ) c
    WHERE c."isBot" = false AND c."createdAt" >= ${prevStart} AND c."linkId" = ${linkId}`;

  const others = row.clicks - row.android - row.ios;
  const prevOthers = row.prevClicks - row.prevAndroid - row.prevIos;
  return { ...row, others, prevOthers };
}

export async function getPartnerDailyClicks(range: RangeKey, linkId: string): Promise<DailyPoint[]> {
  const { days, start } = rangeBounds(range);

  const rows = await prisma.$queryRaw<{ day: Date; clicks: number; android: number; ios: number; unique: number }[]>`
    SELECT date_trunc('day', c."createdAt") AS day,
           count(*)::int AS clicks,
           count(*) FILTER (WHERE c.device = 'ANDROID')::int AS android,
           count(*) FILTER (WHERE c.device = 'IOS')::int AS ios,
           count(DISTINCT c."visitorId")::int AS "unique"
    FROM "PartnerClick" c
    WHERE c."isBot" = false AND c."createdAt" >= ${start} AND c."linkId" = ${linkId}
    GROUP BY 1`;

  const byDay = new Map(rows.map((r) => [new Date(r.day).toISOString().slice(0, 10), r]));

  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const row = byDay.get(date);
    const clicks = row?.clicks ?? 0;
    const android = row?.android ?? 0;
    const ios = row?.ios ?? 0;
    return { date, clicks, android, ios, others: clicks - android - ios, unique: row?.unique ?? 0, signups: 0 };
  });
}

export async function getPartnerTopValues(
  field: "country" | "referrer" | "browser",
  range: RangeKey,
  linkId: string,
  limit = 5,
) {
  const { start } = rangeBounds(range);
  const rows = await prisma.partnerClick.groupBy({
    by: [field],
    where: { isBot: false, createdAt: { gte: start }, linkId },
    _count: { _all: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });
  return rows.map((r) => ({ label: r[field] ?? "Unknown", clicks: r._count._all }));
}
