import { prisma } from "@/lib/prisma";
import type { DeviceType } from "@/lib/generated/prisma/enums";

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

function clickWhere(from: Date, to: Date | undefined, filter: Filter) {
  return {
    isBot: false,
    createdAt: { gte: from, ...(to ? { lt: to } : {}) },
    ...(filter.influencerId ? { link: { influencerId: filter.influencerId } } : {}),
  };
}

async function countUnique(from: Date, to: Date | undefined, filter: Filter) {
  const rows = await prisma.click.groupBy({
    by: ["visitorId"],
    where: clickWhere(from, to, filter),
  });
  return rows.length;
}

async function countByDevice(from: Date, to: Date | undefined, filter: Filter) {
  const rows = await prisma.click.groupBy({
    by: ["device"],
    where: clickWhere(from, to, filter),
    _count: { _all: true },
  });
  const get = (d: DeviceType) => rows.find((r) => r.device === d)?._count._all ?? 0;
  return {
    total: rows.reduce((sum, r) => sum + r._count._all, 0),
    android: get("ANDROID"),
    ios: get("IOS"),
  };
}

export async function getSummary(range: RangeKey, filter: Filter = {}) {
  const { start, prevStart } = rangeBounds(range);
  const today = startOfUtcDay(new Date());

  const [current, previous, unique, prevUnique, clicksToday] = await Promise.all([
    countByDevice(start, undefined, filter),
    countByDevice(prevStart, start, filter),
    countUnique(start, undefined, filter),
    countUnique(prevStart, start, filter),
    prisma.click.count({ where: clickWhere(today, undefined, filter) }),
  ]);

  return {
    clicks: current.total,
    prevClicks: previous.total,
    android: current.android,
    prevAndroid: previous.android,
    ios: current.ios,
    prevIos: previous.ios,
    unique,
    prevUnique,
    clicksToday,
  };
}

export type DailyPoint = { date: string; clicks: number; android: number; ios: number; unique: number };

type DailyRow = { day: Date; clicks: number; android: number; ios: number; unique: number };

export async function getDailyClicks(range: RangeKey, filter: Filter = {}): Promise<DailyPoint[]> {
  const { days, start } = rangeBounds(range);

  const rows = filter.influencerId
    ? await prisma.$queryRaw<DailyRow[]>`
        SELECT date_trunc('day', c."createdAt") AS day,
               count(*)::int AS clicks,
               count(*) FILTER (WHERE c.device = 'ANDROID')::int AS android,
               count(*) FILTER (WHERE c.device = 'IOS')::int AS ios,
               count(DISTINCT c."visitorId")::int AS "unique"
        FROM "Click" c
        JOIN "Link" l ON l.id = c."linkId"
        WHERE c."isBot" = false AND c."createdAt" >= ${start} AND l."influencerId" = ${filter.influencerId}
        GROUP BY 1`
    : await prisma.$queryRaw<DailyRow[]>`
        SELECT date_trunc('day', c."createdAt") AS day,
               count(*)::int AS clicks,
               count(*) FILTER (WHERE c.device = 'ANDROID')::int AS android,
               count(*) FILTER (WHERE c.device = 'IOS')::int AS ios,
               count(DISTINCT c."visitorId")::int AS "unique"
        FROM "Click" c
        WHERE c."isBot" = false AND c."createdAt" >= ${start}
        GROUP BY 1`;

  const byDay = new Map(rows.map((r) => [new Date(r.day).toISOString().slice(0, 10), r]));
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const row = byDay.get(date);
    return {
      date,
      clicks: row?.clicks ?? 0,
      android: row?.android ?? 0,
      ios: row?.ios ?? 0,
      unique: row?.unique ?? 0,
    };
  });
}

export async function getDeviceBreakdown(range: RangeKey, filter: Filter = {}) {
  const { start } = rangeBounds(range);
  const rows = await prisma.click.groupBy({
    by: ["device"],
    where: clickWhere(start, undefined, filter),
    _count: { _all: true },
  });
  const order: DeviceType[] = ["ANDROID", "IOS", "DESKTOP", "OTHER"];
  return order.map((device) => ({
    device,
    clicks: rows.find((r) => r.device === device)?._count._all ?? 0,
  }));
}

export async function getTopValues(
  field: "country" | "referrer" | "browser",
  range: RangeKey,
  filter: Filter = {},
  limit = 5,
) {
  const { start } = rangeBounds(range);
  const rows = await prisma.click.groupBy({
    by: [field],
    where: clickWhere(start, undefined, filter),
    _count: { _all: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });
  return rows.map((r) => ({ label: r[field] ?? "Unknown", clicks: r._count._all }));
}

export async function getTopInfluencers(range: RangeKey, limit = 5) {
  const { start } = rangeBounds(range);
  return prisma.$queryRaw<
    { id: string; name: string; handle: string | null; platform: string; clicks: number; android: number; ios: number }[]
  >`
    SELECT i.id, i.name, i.handle, i.platform::text AS platform,
           count(c.id)::int AS clicks,
           count(c.id) FILTER (WHERE c.device = 'ANDROID')::int AS android,
           count(c.id) FILTER (WHERE c.device = 'IOS')::int AS ios
    FROM "Influencer" i
    JOIN "Link" l ON l."influencerId" = i.id
    JOIN "Click" c ON c."linkId" = l.id AND c."isBot" = false AND c."createdAt" >= ${start}
    GROUP BY i.id
    ORDER BY clicks DESC
    LIMIT ${limit}`;
}

/** All-time click totals per influencer, for the influencers table. */
export async function getClickTotalsByInfluencer() {
  const rows = await prisma.$queryRaw<
    { influencerId: string; clicks: number; android: number; ios: number; last7: number }[]
  >`
    SELECT l."influencerId",
           count(c.id)::int AS clicks,
           count(c.id) FILTER (WHERE c.device = 'ANDROID')::int AS android,
           count(c.id) FILTER (WHERE c.device = 'IOS')::int AS ios,
           count(c.id) FILTER (WHERE c."createdAt" >= now() - interval '7 days')::int AS last7
    FROM "Link" l
    JOIN "Click" c ON c."linkId" = l.id AND c."isBot" = false
    GROUP BY l."influencerId"`;
  return new Map(rows.map((r) => [r.influencerId, r]));
}

export function percentChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 100);
}
