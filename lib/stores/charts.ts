import gplay from "google-play-scraper";
import { prisma } from "@/lib/prisma";
import type { AppStore } from "@/lib/generated/prisma/enums";
import { dbDate, errorMessage, indiaToday } from "@/lib/stores/shared";

/**
 * The chart we follow in each store: Top free in our app's own category, India (a store only ranks
 * an app in its primary category). Apple's public chart feed lists the top 100; Play has no chart
 * API, so its public store pages are read (top 200).
 */
const COUNTRY = "in";
/** Apple's "Magazines & Newspapers" genre, DailyMattr's primary category on the App Store. */
const APPLE_GENRE = 6021;
export const CHART_LABELS: Record<AppStore, string> = {
  GOOGLE_PLAY: "Top free · News & Magazines · India",
  APP_STORE: "Top free · Magazines & Newspapers · India",
};

type FetchedEntry = { rank: number; appName: string; developer: string; ours: boolean };

type AppleFeed = {
  feed?: {
    entry?: {
      "im:name": { label: string };
      "im:artist"?: { label: string };
      id: { attributes: { "im:id": string } };
    }[];
  };
};

async function fetchAppStoreChart(): Promise<FetchedEntry[]> {
  const ourId = process.env.APP_STORE_APP_ID?.trim();
  const res = await fetch(
    `https://itunes.apple.com/${COUNTRY}/rss/topfreeapplications/limit=100/genre=${APPLE_GENRE}/json`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Apple’s chart feed answered ${res.status}`);
  const entries = ((await res.json()) as AppleFeed).feed?.entry ?? [];
  return entries.map((e, i) => ({
    rank: i + 1,
    appName: e["im:name"].label,
    developer: e["im:artist"]?.label ?? "",
    ours: Boolean(ourId) && e.id.attributes["im:id"] === ourId,
  }));
}

type PlayListOptions = NonNullable<Parameters<typeof gplay.list>[0]>;

async function fetchPlayChart(): Promise<FetchedEntry[]> {
  const ourId = process.env.GOOGLE_PLAY_PACKAGE_NAME?.trim();
  // The package types its enum objects as single values, so name them as strings.
  const apps = await gplay.list({
    collection: "TOP_FREE" as PlayListOptions["collection"],
    category: "NEWS_AND_MAGAZINES" as PlayListOptions["category"],
    country: COUNTRY,
    lang: "en",
    num: 200,
  });
  return apps.map((a, i) => ({ rank: i + 1, appName: a.title, developer: a.developer, ours: a.appId === ourId }));
}

/** Last automatic chart fetch per store (with its error, if it failed). */
const chartKey = (store: AppStore) => `${store}:chart`;

export type ChartStatus = { fetchedAt: Date; error: string | null } | null;

export async function getChartStatus(store: AppStore): Promise<ChartStatus> {
  const row = await prisma.storeSync.findUnique({ where: { key: chartKey(store) } });
  return row && { fetchedAt: row.syncedAt, error: row.error };
}

/**
 * Fetches the store's chart and saves it as today's list (replacing an earlier fetch today), with
 * our position as today's ranking. Never throws; the error is kept for the stores page.
 */
export async function syncStoreChart(store: AppStore) {
  let error: string | null = null;
  try {
    const entries = await (store === "GOOGLE_PLAY" ? fetchPlayChart() : fetchAppStoreChart());
    if (entries.length === 0) throw new Error("The store returned an empty chart");
    const day = dbDate(indiaToday());
    const ours = entries.find((e) => e.ours);
    // One list and one position per store per day.
    const today = { store, date: day, category: "", country: "" };
    await prisma.$transaction([
      prisma.storeChartEntry.deleteMany({ where: { store, date: day } }),
      prisma.storeChartEntry.createMany({
        data: entries.map((e) => ({ store, date: day, rank: e.rank, appName: e.appName, developer: e.developer })),
      }),
      ours
        ? prisma.storeRanking.upsert({
            where: { store_date_category_country: today },
            create: { ...today, rank: ours.rank },
            update: { rank: ours.rank },
          })
        : prisma.storeRanking.deleteMany({ where: today }),
    ]);
  } catch (e) {
    error = errorMessage(e);
  }
  await prisma.storeSync.upsert({
    where: { key: chartKey(store) },
    create: { key: chartKey(store), error },
    update: { error, syncedAt: new Date() },
  });
  return { store, error };
}
