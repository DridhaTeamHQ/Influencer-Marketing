import { daysAgo, isoDay } from "@/lib/stores/shared";

/** Quick ranges on the store pages. Store reports lag a day, so they all end yesterday. */
export const STORE_RANGES = {
  "7d": { days: 7, label: "Week" },
  "30d": { days: 30, label: "Month" },
  "90d": { days: 90, label: "3 months" },
  "180d": { days: 180, label: "6 months" },
} as const;

export type StoreRangeKey = keyof typeof STORE_RANGES;

export type StoreRange = {
  key: StoreRangeKey | "custom";
  /** Inclusive YYYY-MM-DD dates. */
  from: string;
  to: string;
  days: number;
  /** The same number of days just before, for the change badges. */
  prevFrom: string;
  prevTo: string;
};

const MAX_CUSTOM_DAYS = 366;
const DAY = 86_400_000;
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const shift = (day: string, by: number) => isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + by * DAY));

/** `?range=30d`, or `?from=2026-09-01&to=2026-09-30` for a custom range. Defaults to the last 30 days. */
export function parseStoreRange(params: Record<string, string | string[] | undefined>): StoreRange {
  let key: StoreRange["key"] = "30d";
  let from: string;
  let to: string;

  if (isDay(params.from) && isDay(params.to)) {
    key = "custom";
    [from, to] = params.from <= params.to ? [params.from, params.to] : [params.to, params.from];
    if (Date.parse(to) - Date.parse(from) >= MAX_CUSTOM_DAYS * DAY) from = shift(to, -(MAX_CUSTOM_DAYS - 1));
  } else {
    if (typeof params.range === "string" && params.range in STORE_RANGES) key = params.range as StoreRangeKey;
    to = daysAgo(1);
    from = daysAgo(STORE_RANGES[key as StoreRangeKey].days);
  }

  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
  return { key, from, to, days, prevFrom: shift(from, -days), prevTo: shift(from, -1) };
}

/** Every date in the range, oldest first. */
export function rangeDays(range: Pick<StoreRange, "from" | "days">) {
  return Array.from({ length: range.days }, (_, i) => shift(range.from, i));
}
