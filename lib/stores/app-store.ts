import { createSign } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { prisma } from "@/lib/prisma";
import {
  APPLE_MANUAL_REPORT,
  b64url,
  daysAgo,
  dbDate,
  mapLimit,
  mergeRows,
  missingEnv,
  readPrivateKey,
  type StatRow,
} from "@/lib/stores/shared";

/**
 * Copies App Store numbers into the StoreStat table, read with an App Store Connect API key:
 * - daily Sales reports (report "apple_sales", by country): first-time downloads and re-downloads,
 *   available the next day and kept by Apple for a year,
 * - the "App Store Installation and Deletion" Analytics report (report "apple_analytics"): installs,
 *   re-downloads and deletions by source type, source and campaign, and by country. Apple starts
 *   producing it a day or two after we first ask for it (we ask automatically).
 */

const STORE = "APP_STORE" as const;

const REQUIRED_ENV = [
  "APP_STORE_CONNECT_ISSUER_ID",
  "APP_STORE_CONNECT_KEY_ID",
  "APP_STORE_CONNECT_PRIVATE_KEY",
  "APP_STORE_APP_ID",
  "APP_STORE_VENDOR_NUMBER",
];

export const appStoreMissingEnv = () => missingEnv(REQUIRED_ENV);

const API = "https://api.appstoreconnect.apple.com";

/** Sales report product types: first-time downloads and re-downloads (iPhone, iPad, Mac, universal, App Clips…). */
const DOWNLOAD_TYPES = new Set(["1", "1F", "1T", "1E", "1EP", "1EU"]);
const REDOWNLOAD_TYPES = new Set(["3", "3F", "3T"]);

const DELETIONS_REPORT = "App Store Installation and Deletion Standard";

/** How far back Sales reports are copied, and how many days one sync fetches at most. */
const SALES_HISTORY_DAYS = 365;
const SALES_DAYS_PER_SYNC = 120;

const appId = () => process.env.APP_STORE_APP_ID!.trim();

let token: { value: string; expires: number } | null = null;

/** Signed API token (ES256), reused until shortly before it expires. */
function apiToken() {
  if (token && token.expires > Date.now() + 60_000) return token.value;

  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(
    JSON.stringify({ alg: "ES256", kid: process.env.APP_STORE_CONNECT_KEY_ID!.trim(), typ: "JWT" }),
  )}.${b64url(
    JSON.stringify({
      iss: process.env.APP_STORE_CONNECT_ISSUER_ID!.trim(),
      iat: now,
      exp: now + 15 * 60,
      aud: "appstoreconnect-v1",
    }),
  )}`;
  const signature = createSign("SHA256")
    .update(unsigned)
    .sign({ key: readPrivateKey("APP_STORE_CONNECT_PRIVATE_KEY"), dsaEncoding: "ieee-p1363" })
    .toString("base64url");

  token = { value: `${unsigned}.${signature}`, expires: (now + 15 * 60) * 1000 };
  return token.value;
}

async function appleFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiToken()}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.json().catch(() => null);
    const detail = body?.errors?.[0]?.detail ?? body?.errors?.[0]?.title ?? res.statusText;
    throw new Error(`App Store Connect ${res.status}: ${detail}`);
  }
  return res;
}

function parseTsv(text: string) {
  const [header, ...lines] = text.split(/\r?\n/).filter(Boolean);
  if (!header) return [];
  const keys = header.split("\t").map((k) => k.trim());
  return lines.map((line) => {
    const cells = line.split("\t");
    return Object.fromEntries(keys.map((key, i) => [key, cells[i]?.trim() ?? ""]));
  });
}

/** Every page of a list endpoint. */
async function allPages<T>(path: string) {
  const items: T[] = [];
  let next: string | undefined = path;
  while (next) {
    const res = await appleFetch(next);
    if (res.status === 404) break;
    const body: { data: T[]; links?: { next?: string } } = await res.json();
    items.push(...body.data);
    next = body.links?.next;
  }
  return items;
}

/** One day's Sales report as rows by country (empty when the day had no downloads). */
async function salesRows(date: string): Promise<StatRow[]> {
  const params = new URLSearchParams({
    "filter[frequency]": "DAILY",
    "filter[reportDate]": date,
    "filter[reportSubType]": "SUMMARY",
    "filter[reportType]": "SALES",
    "filter[vendorNumber]": process.env.APP_STORE_VENDOR_NUMBER!.trim(),
    "filter[version]": "1_1",
  });
  const res = await appleFetch(`/v1/salesReports?${params}`, { headers: { Accept: "application/a-gzip" } });
  // 404 means no sales that day, or the report isn't out yet.
  if (res.status === 404) return [];

  const rows: StatRow[] = [];
  for (const row of parseTsv(gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8"))) {
    if (row["Apple Identifier"] !== appId()) continue;
    const type = row["Product Type Identifier"] ?? "";
    const units = Number(row["Units"]) || 0;
    if (!DOWNLOAD_TYPES.has(type) && !REDOWNLOAD_TYPES.has(type)) continue;
    rows.push({
      split: "COUNTRY",
      date,
      country: row["Country Code"] || "Unknown",
      downloads: DOWNLOAD_TYPES.has(type) ? units : 0,
      reinstalls: REDOWNLOAD_TYPES.has(type) ? units : 0,
    });
  }
  return rows;
}

const salesKey = (date: string) => `${STORE}:sales:${date}`;

async function syncSales() {
  const dates = Array.from({ length: SALES_HISTORY_DAYS }, (_, i) => daysAgo(i + 1));
  const synced = new Map(
    (await prisma.storeSync.findMany({ where: { key: { in: dates.map(salesKey) } } })).map((s) => [s.key, s.syncedAt]),
  );
  // Days we've never copied, plus the last few days again: Apple can publish or correct them late.
  const recent = new Set(dates.slice(0, 4));
  const todo = dates
    .filter((d) => !synced.has(salesKey(d)) || (recent.has(d) && Date.now() - synced.get(salesKey(d))!.getTime() > 3_600_000))
    .slice(0, SALES_DAYS_PER_SYNC);

  await mapLimit(todo, 6, async (date) => {
    const rows = await salesRows(date);
    await prisma.$transaction([
      prisma.storeStat.deleteMany({ where: { store: STORE, report: "apple_sales", date: dbDate(date) } }),
      prisma.storeStat.createMany({ data: mergeRows(STORE, "apple_sales", rows) }),
    ]);
    await prisma.storeSync.upsert({
      where: { key: salesKey(date) },
      create: { key: salesKey(date) },
      update: { error: null },
    });
  });
  return todo.length;
}

/** Install, re-download or delete, from the report's Event and Download Type columns. */
function analyticsNumbers(row: Record<string, string>) {
  const event = (row["Event"] ?? "").toLowerCase();
  const type = (row["Download Type"] ?? "").toLowerCase();
  const counts = Number(row["Counts"] ?? row["Count"]) || 0;
  const devices = Number(row["Unique Devices"]) || 0;
  if (event.includes("delete")) return { uninstalls: counts };
  if (event.includes("install") && /redownload|restore/.test(type)) return { reinstalls: counts, uniqueUsers: devices };
  if (event.includes("install") && type.includes("first")) return { downloads: counts, uniqueUsers: devices };
  return null; // updates
}

/** YYYY-MM-DD from the report's Date column (documented as YYYY-MM-DD; other formats are converted). */
function reportDay(value: string | undefined) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = Date.parse(`${value} UTC`);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

async function analyticsRows(instanceId: string) {
  const segments = await allPages<{ attributes: { url: string } }>(`/v1/analyticsReportInstances/${instanceId}/segments`);
  const rows: StatRow[] = [];
  for (const segment of segments) {
    const res = await fetch(segment.attributes.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Analytics report download failed (${res.status})`);
    for (const row of parseTsv(gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8"))) {
      if (row["App Apple Identifier"] && row["App Apple Identifier"] !== appId()) continue;
      const numbers = analyticsNumbers(row);
      const date = reportDay(row["Date"]);
      if (!numbers || !date) continue;
      rows.push(
        {
          split: "SOURCE",
          date,
          channel: row["Source Type"] ?? "",
          utmSource: row["Source Info"] ?? "",
          utmCampaign: row["Campaign"] ?? "",
          ...numbers,
        },
        { split: "COUNTRY", date, country: row["Territory"] ?? "", ...numbers },
      );
    }
  }
  return rows;
}

/**
 * Apple only fills an ONGOING request from the day it starts; a ONE_TIME_SNAPSHOT request adds the
 * history before that. We keep one of each, so every day can match the Analytics screen.
 */
const ACCESS_TYPES = ["ONE_TIME_SNAPSHOT", "ONGOING"] as const;

/** Makes sure Apple produces Analytics reports, then copies every daily instance we haven't copied yet. */
async function syncAnalytics() {
  type Request = { id: string; attributes: { accessType: string; stoppedDueToInactivity?: boolean } };
  const requests = await allPages<Request>(`/v1/apps/${appId()}/analyticsReportRequests`);

  const active: Request[] = [];
  for (const accessType of ACCESS_TYPES) {
    const request = requests.find((r) => r.attributes.accessType === accessType && !r.attributes.stoppedDueToInactivity);
    if (request) active.push(request);
    else {
      await appleFetch("/v1/analyticsReportRequests", {
        method: "POST",
        body: JSON.stringify({
          data: {
            type: "analyticsReportRequests",
            attributes: { accessType },
            relationships: { app: { data: { type: "apps", id: appId() } } },
          },
        }),
      });
    }
  }

  // Snapshot first, so the ongoing request's newer files win for days both cover.
  const instances: { id: string }[] = [];
  for (const request of active) {
    const reports = await allPages<{ id: string; attributes: { name: string } }>(
      `/v1/analyticsReportRequests/${request.id}/reports?filter[category]=APP_USAGE`,
    );
    const report = reports.find((r) => r.attributes.name === DELETIONS_REPORT);
    if (!report) continue;
    instances.push(
      ...(await allPages<{ id: string }>(`/v1/analyticsReports/${report.id}/instances?filter[granularity]=DAILY&limit=200`)),
    );
  }
  const key = (id: string) => `${STORE}:analytics:${id}`;
  const done = new Set(
    (await prisma.storeSync.findMany({ where: { key: { in: instances.map((i) => key(i.id)) } } })).map((s) => s.key),
  );
  const todo = instances.filter((i) => !done.has(key(i.id)));

  for (const instance of todo) {
    const rows = await analyticsRows(instance.id);
    const dates = [...new Set(rows.map((r) => r.date))].map(dbDate);
    await prisma.$transaction([
      prisma.storeStat.deleteMany({ where: { store: STORE, report: "apple_analytics", date: { in: dates } } }),
      prisma.storeStat.createMany({ data: mergeRows(STORE, "apple_analytics", rows) }),
    ]);
    await prisma.storeSync.create({ data: { key: key(instance.id) } });
  }
  if (todo.length) {
    // Apple's own numbers now cover these days: drop deletions typed in for them.
    const last = await prisma.storeStat.findFirst({ where: { store: STORE, report: "apple_analytics" }, orderBy: { date: "desc" } });
    if (last) await prisma.storeStat.deleteMany({ where: { store: STORE, report: APPLE_MANUAL_REPORT, date: { lte: last.date } } });
  }
  return todo.length;
}

/** Copies new Sales and Analytics reports. Throws on failure. */
export async function syncAppStore() {
  const [salesDays, analyticsInstances] = await Promise.all([syncSales(), syncAnalytics()]);
  return { salesDays, analyticsInstances };
}
