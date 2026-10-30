import { prisma } from "@/lib/prisma";
import type { AppStore } from "@/lib/generated/prisma/enums";
import { isoDay } from "@/lib/stores/shared";

export type RankingEntry = { id: string; store: AppStore; date: string; rank: number };

/** Latest entries first. */
export async function getRankings(store?: AppStore, take = 100): Promise<RankingEntry[]> {
  const rows = await prisma.storeRanking.findMany({
    where: store ? { store } : undefined,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
  });
  return rows.map((r) => ({ id: r.id, store: r.store, date: isoDay(r.date), rank: r.rank }));
}

/** How our app is named in store charts ("DailyMattr", "Daily Mattr: News…"). */
export const isOurApp = (name: string) => /daily\s*-?\s*mattr/i.test(name);

export type ChartList = { date: string; entries: { rank: number; appName: string; developer: string; ours: boolean }[] };

/** The latest top-chart list uploaded for the store, or null. */
export async function getLatestChart(store: AppStore): Promise<ChartList | null> {
  const latest = await prisma.storeChartEntry.findFirst({ where: { store }, orderBy: { date: "desc" }, select: { date: true } });
  if (!latest) return null;
  const rows = await prisma.storeChartEntry.findMany({ where: { store, date: latest.date }, orderBy: { rank: "asc" } });
  return {
    date: isoDay(latest.date),
    entries: rows.map((r) => ({ rank: r.rank, appName: r.appName, developer: r.developer, ours: isOurApp(r.appName) })),
  };
}

export type RankingSummary = {
  latest: { date: string; rank: number };
  /** The entry before the latest one, to show the move. */
  previous: { date: string; rank: number } | null;
  /** Oldest first, for the small trend. */
  history: { date: string; rank: number }[];
};

/** The store's latest position and the ones before it; null until one is entered. */
export async function getRankingSummary(store: AppStore): Promise<RankingSummary | null> {
  const list = await getRankings(store, 30);
  if (!list.length) return null;
  return {
    latest: { date: list[0]!.date, rank: list[0]!.rank },
    previous: list[1] ? { date: list[1].date, rank: list[1].rank } : null,
    history: list.toReversed().map((e) => ({ date: e.date, rank: e.rank })),
  };
}
