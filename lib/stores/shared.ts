import type { AppStore, StoreStatSplit } from "@/lib/generated/prisma/enums";

/** Names of env vars that are empty. */
export function missingEnv(names: string[]) {
  return names.filter((name) => !process.env[name]?.trim());
}

/** Private keys pasted into .env keep their line breaks as "\n". */
export function readPrivateKey(name: string) {
  return (process.env[name] ?? "").replace(/\\n/g, "\n").trim();
}

export const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

export const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** Today's date in India (YYYY-MM-DD), for imported numbers and the daily store charts. */
export const indiaToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** Midnight UTC of a YYYY-MM-DD date, as Prisma stores @db.Date values. */
export const dbDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** Today minus `days`, as YYYY-MM-DD (UTC). */
export function daysAgo(days: number) {
  const now = new Date();
  return isoDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - days * 86_400_000));
}

/** Runs `fn` over `items` with at most `limit` calls in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]!);
      }
    }),
  );
  return results;
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** "IN" → "India"; leaves anything that isn't a country code as it is. */
export function countryName(code: string) {
  if (!/^[A-Za-z]{2}$/.test(code)) return code;
  try {
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * App Store Connect's all-time deletions, typed in on the stores page (one row, dated the day it's
 * "as of"). Apple's Analytics report leaves out small numbers, so the difference between this total
 * and the report's deletions up to that day counts as deletions on that day.
 */
export const APPLE_DELETIONS_TOTAL_REPORT = "apple_manual_total_deletions";

/**
 * Downloads by referring app / website: from Apple's "App Downloads Detailed" report (monthly rows are
 * dated the 1st), and from App Store Connect CSVs uploaded on the stores page, which hold the small
 * numbers the report leaves out.
 */
export const APPLE_REFERRER_REPORTS = {
  DAILY: "apple_referrer",
  MONTHLY: "apple_referrer_monthly",
  CSV: "apple_referrer_csv",
} as const;

/** One row headed for the StoreStat table. */
export type StatRow = {
  split: StoreStatSplit;
  date: string;
  channel?: string;
  utmSource?: string;
  utmCampaign?: string;
  country?: string;
  downloads?: number;
  reinstalls?: number;
  uninstalls?: number;
  uniqueUsers?: number;
  activeDevices?: number | null;
};

/** Adds up rows that share the same day and breakdown, so each lands in one database row. */
export function mergeRows(store: AppStore, report: string, rows: StatRow[]) {
  const merged = new Map<string, ReturnType<typeof toRecord>>();
  function toRecord(row: StatRow) {
    return {
      store,
      report,
      split: row.split,
      date: dbDate(row.date),
      channel: row.channel ?? "",
      utmSource: row.utmSource ?? "",
      utmCampaign: row.utmCampaign ?? "",
      country: row.country ?? "",
      downloads: row.downloads ?? 0,
      reinstalls: row.reinstalls ?? 0,
      uninstalls: row.uninstalls ?? 0,
      uniqueUsers: row.uniqueUsers ?? 0,
      activeDevices: row.activeDevices ?? null,
    };
  }
  for (const row of rows) {
    const record = toRecord(row);
    const key = [record.split, row.date, record.channel, record.utmSource, record.utmCampaign, record.country].join("\u0000");
    const existing = merged.get(key);
    if (!existing) merged.set(key, record);
    else {
      existing.downloads += record.downloads;
      existing.reinstalls += record.reinstalls;
      existing.uninstalls += record.uninstalls;
      existing.uniqueUsers += record.uniqueUsers;
      if (record.activeDevices !== null) existing.activeDevices = (existing.activeDevices ?? 0) + record.activeDevices;
    }
  }
  return [...merged.values()];
}
