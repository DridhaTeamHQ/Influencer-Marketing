import { createSign } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { b64url, dbDate, mergeRows, missingEnv, readPrivateKey, type StatRow } from "@/lib/stores/shared";

/**
 * Copies Google Play numbers into the StoreStat table. Google only exposes them as monthly CSV
 * reports in the Play Console's Cloud Storage bucket:
 * - "installs" (report "play_installs"): new users, uninstalls, install events and active devices per day,
 *   by day (TOTAL) and by country. Google only starts writing these once the app has enough users.
 * - "store_performance" (report "play_store_listing"): store listing visitors and acquisitions, by
 *   traffic source with UTM source/campaign (SOURCE), and by country.
 *
 * The bucket is read as a service account, signed in one of two ways:
 * - keyless (Workload Identity Federation): Vercel's OIDC token is swapped for the service account's access,
 * - or with a service account key pasted into GOOGLE_PLAY_PRIVATE_KEY.
 */

const STORE = "GOOGLE_PLAY" as const;
const SCOPE = "https://www.googleapis.com/auth/devstorage.read_only";

const BASE_ENV = ["GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PLAY_PACKAGE_NAME", "GOOGLE_PLAY_REPORTS_BUCKET"];
const WIF_ENV = ["GCP_PROJECT_NUMBER", "GCP_WORKLOAD_IDENTITY_POOL_ID", "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID"];

const hasPrivateKey = () => Boolean(process.env.GOOGLE_PLAY_PRIVATE_KEY?.trim());
const serviceAccount = () => process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL!.trim();
const packageName = () => process.env.GOOGLE_PLAY_PACKAGE_NAME!.trim();
/** Accepts the bucket name or the whole "gs://pubsite_prod_…/stats/…" URI copied from Play Console. */
const bucket = () => process.env.GOOGLE_PLAY_REPORTS_BUCKET!.trim().replace(/^gs:\/\//, "").split("/")[0];

/** Env vars still empty for Google Play (the key is optional when signing in through Vercel). */
export const googlePlayMissingEnv = () => missingEnv(hasPrivateKey() ? BASE_ENV : [...BASE_ENV, ...WIF_ENV]);

let token: { value: string; expires: number } | null = null;

/** Access token from a service account key. */
async function keyToken() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({
      iss: serviceAccount(),
      scope: SCOPE,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  )}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(readPrivateKey("GOOGLE_PLAY_PRIVATE_KEY"))
    .toString("base64url");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
    cache: "no-store",
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google sign-in failed: ${body.error_description ?? body.error ?? res.status}`);
  return { value: body.access_token as string, expires: Date.now() + body.expires_in * 1000 };
}

/**
 * Access token via Workload Identity Federation: Google's STS swaps Vercel's OIDC token for a
 * federated token, which then asks for a short-lived token of the service account.
 */
async function federatedToken(oidcToken: string) {
  const provider = `//iam.googleapis.com/projects/${process.env.GCP_PROJECT_NUMBER!.trim()}/locations/global/workloadIdentityPools/${process.env.GCP_WORKLOAD_IDENTITY_POOL_ID!.trim()}/providers/${process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID!.trim()}`;

  const sts = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      audience: provider,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      subject_token: oidcToken,
    }),
    cache: "no-store",
  });
  const stsBody = await sts.json();
  if (!sts.ok) {
    throw new Error(`Google didn't accept the Vercel token: ${stsBody.error_description ?? stsBody.error ?? sts.status}`);
  }

  const res = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount())}:generateAccessToken`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${stsBody.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scope: [SCOPE], lifetime: "3600s" }),
      cache: "no-store",
    },
  );
  const body = await res.json();
  if (!res.ok) throw new Error(`Couldn't act as the service account: ${body.error?.message ?? res.status}`);
  return { value: body.accessToken as string, expires: Date.parse(body.expireTime) };
}

/**
 * Signs in, reusing the token until shortly before it expires. On Vercel the OIDC token arrives
 * with each request, so callers read it from the request and pass it in; locally `vercel env pull`
 * provides VERCEL_OIDC_TOKEN.
 */
async function accessToken(oidcToken: string | null) {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  if (hasPrivateKey()) token = await keyToken();
  else {
    const vercelToken = oidcToken ?? process.env.VERCEL_OIDC_TOKEN?.trim();
    if (!vercelToken) {
      throw new Error(
        "No Vercel OIDC token. Turn on Secure Backend Access (OIDC) in Vercel, or run `vercel env pull` to test locally.",
      );
    }
    // The pulled token only lasts 12 hours; Google's own error for an old one is cryptic.
    if (!oidcToken && JSON.parse(Buffer.from(vercelToken.split(".")[1] ?? "", "base64url").toString() || "{}").exp * 1000 < Date.now()) {
      throw new Error("The local VERCEL_OIDC_TOKEN has expired (they last 12 hours). Run `vercel env pull .env.local` and try again.");
    }
    token = await federatedToken(vercelToken);
  }
  return token.value;
}

async function storageFetch(url: string, oidcToken: string | null) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${await accessToken(oidcToken)}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error?.message ?? res.statusText;
    throw new Error(
      res.status === 403
        ? `Play reports bucket refused access (403). Check the Play Console invite for ${serviceAccount()}; it can take up to a day to start working. ${message}`
        : `Play reports bucket ${res.status}: ${message}`,
    );
  }
  return res;
}

type ReportFile = { name: string; updated: string };

/** Report files in one folder of the bucket, e.g. "stats/installs/". */
async function listFiles(folder: string, oidcToken: string | null) {
  const files: ReportFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ prefix: folder, fields: "items(name,updated),nextPageToken" });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await storageFetch(`https://storage.googleapis.com/storage/v1/b/${bucket()}/o?${params}`, oidcToken);
    const body = await res.json();
    files.push(...(body.items ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return files;
}

async function downloadCsv(name: string, oidcToken: string | null) {
  const res = await storageFetch(
    `https://storage.googleapis.com/storage/v1/b/${bucket()}/o/${encodeURIComponent(name)}?alt=media`,
    oidcToken,
  );
  // Play Console writes these reports as UTF-16.
  const bytes = Buffer.from(await res.arrayBuffer());
  return bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.toString("utf16le") : bytes.toString("utf8");
}

function splitRow(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

/** Header names are lowercased with spaces and punctuation removed ("Country / region" → "countryregion"). */
const columnKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  const [header, ...lines] = text.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  if (!header) return [];
  const keys = splitRow(header).map(columnKey);
  return lines.map((line) => {
    const cells = splitRow(line);
    return Object.fromEntries(keys.map((key, i) => [key, cells[i] ?? ""]));
  });
}

/** First column (of the names Google has used over time) that holds a number, or null. */
function num(row: Row, columns: string[]) {
  for (const column of columns) {
    const value = Number(row[column]?.replace(/,/g, ""));
    if (row[column] && Number.isFinite(value)) return value;
  }
  return null;
}

function text(row: Row, columns: string[]) {
  return columns.map((c) => row[c]).find(Boolean) ?? "";
}

/** The row's date as YYYY-MM-DD (reports use either that or "Jan 5, 2026"). */
function rowDate(row: Row) {
  const value = row["date"] ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** "No UTM source specified" and friends mean "none". */
const cleanUtm = (value: string) => (/^no .* specified$/i.test(value) ? "" : value);

/** Column names Google has used over time, after `columnKey`. */
const NEW_USERS = ["dailyuserinstalls", "dailydeviceinstalls"];
const INSTALL_EVENTS = ["installevents"];
const UNINSTALLS = ["dailyuseruninstalls", "uninstallevents", "dailydeviceuninstalls"];
const ACTIVE = ["activedeviceinstalls"];
const ACQUISITIONS = ["storelistingacquisitions", "acquisitions"];
const VISITORS = ["storelistingvisitors", "visitors"];
const COUNTRY = ["country", "countryregion"];

/** Installs report row: new users, reinstalls (install events beyond new users), uninstalls. */
function installNumbers(row: Row) {
  const newUsers = num(row, NEW_USERS) ?? num(row, INSTALL_EVENTS) ?? 0;
  const events = num(row, INSTALL_EVENTS);
  return {
    downloads: newUsers,
    reinstalls: events === null ? 0 : Math.max(0, events - newUsers),
    uninstalls: num(row, UNINSTALLS) ?? 0,
  };
}

/** Turns one report file into StoreStat rows, or null for files we don't use. */
function toRows(name: string, rows: Row[]): { report: string; rows: StatRow[] } | null {
  const kind = name.match(/stats\/(installs|store_performance)\/.*_\d{6}_(overview|country|traffic_source)\.csv$/);
  if (!kind) return null;
  const [, folder, dimension] = kind;
  const dated = rows.map((row) => ({ row, date: rowDate(row) })).filter((r) => r.date !== null);

  if (folder === "installs" && dimension === "overview") {
    return {
      report: "play_installs",
      rows: dated.map(({ row, date }) => ({
        split: "TOTAL",
        date: date!,
        ...installNumbers(row),
        activeDevices: num(row, ACTIVE),
      })),
    };
  }
  if (folder === "installs" && dimension === "country") {
    return {
      report: "play_installs",
      rows: dated.map(({ row, date }) => ({ split: "COUNTRY", date: date!, country: text(row, COUNTRY), ...installNumbers(row) })),
    };
  }
  if (folder === "store_performance" && dimension === "traffic_source") {
    return {
      report: "play_store_listing",
      rows: dated.map(({ row, date }) => ({
        split: "SOURCE",
        date: date!,
        channel: row["trafficsource"] ?? "",
        utmSource: cleanUtm(row["utmsource"] ?? ""),
        utmCampaign: cleanUtm(row["utmcampaign"] ?? ""),
        downloads: num(row, ACQUISITIONS) ?? 0,
        uniqueUsers: num(row, VISITORS) ?? 0,
      })),
    };
  }
  if (folder === "store_performance" && dimension === "country") {
    return {
      report: "play_store_listing",
      rows: dated.map(({ row, date }) => ({
        split: "COUNTRY",
        date: date!,
        country: text(row, COUNTRY),
        downloads: num(row, ACQUISITIONS) ?? 0,
        uniqueUsers: num(row, VISITORS) ?? 0,
      })),
    };
  }
  return null;
}

const fileKey = (name: string) => `${STORE}:file:${name}`;

/** Copies every report file that's new or changed since the last sync. Throws on failure. */
export async function syncGooglePlay(oidcToken: string | null) {
  const pkg = packageName();
  const files = (
    await Promise.all(["stats/installs/", "stats/store_performance/"].map((folder) => listFiles(folder, oidcToken)))
  )
    .flat()
    .filter((f) => f.name.includes(`_${pkg}_`));

  const synced = new Map(
    (await prisma.storeSync.findMany({ where: { key: { in: files.map((f) => fileKey(f.name)) } } })).map((s) => [
      s.key,
      s.version,
    ]),
  );
  const changed = files.filter((f) => synced.get(fileKey(f.name)) !== f.updated);

  for (const file of changed) {
    const parsed = toRows(file.name, parseCsv(await downloadCsv(file.name, oidcToken)));
    if (parsed) {
      // Each file is one month: replace that month's rows of the same report and split.
      const month = file.name.match(/_(\d{4})(\d{2})_/)!;
      const start = dbDate(`${month[1]}-${month[2]}-01`);
      const end = new Date(Date.UTC(Number(month[1]), Number(month[2]), 1));
      const splits = [...new Set(parsed.rows.map((r) => r.split))];
      await prisma.$transaction([
        prisma.storeStat.deleteMany({
          where: { store: STORE, report: parsed.report, split: { in: splits }, date: { gte: start, lt: end } },
        }),
        prisma.storeStat.createMany({ data: mergeRows(STORE, parsed.report, parsed.rows) }),
      ]);
    }
    await prisma.storeSync.upsert({
      where: { key: fileKey(file.name) },
      create: { key: fileKey(file.name), version: file.updated },
      update: { version: file.updated },
    });
  }
  return { files: files.length, updated: changed.length };
}
