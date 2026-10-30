"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth";
import type { AppStore } from "@/lib/generated/prisma/enums";
import { routes } from "@/lib/routes";
import { APPLE_MANUAL_REPORT, APPLE_REFERRER_REPORTS, dbDate, errorMessage } from "@/lib/stores/shared";
import { PLAY_IMPORT_REPORT, getAppleDeletionGap } from "@/lib/stores/stats";
import { decodeCsv, parseAppReferrerCsv, parseDailyCountCsv, parseReferralCodesCsv } from "@/lib/stores/store-import";
import { runSync } from "@/lib/stores/sync";

async function requireAdmin() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!isValidSessionToken(token)) throw new Error("Not signed in");
}

/** "Sync now" on the stores page: copies new reports, then refreshes the page. */
export async function syncStoreNow(stores: AppStore[], path: string) {
  await requireAdmin();
  const valid = stores.filter((s) => s === "GOOGLE_PLAY" || s === "APP_STORE");
  const oidcToken = (await headers()).get("x-vercel-oidc-token");
  await Promise.all(valid.map((s) => runSync(s, oidcToken)));
  revalidatePath(path);
}

export type ImportState = { ok?: boolean; message?: string };

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Imports a Play Console "Users lost" export as daily uninstalls. Days in the file replace
 * earlier imports for those days; other days are kept.
 */
export async function importPlayUninstalls(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose the CSV file to import." };
  if (file.size > MAX_BYTES) return { ok: false, message: "That file is too big for a Users lost export (max 2 MB)." };

  try {
    const { days, columns } = parseDailyCountCsv(decodeCsv(new Uint8Array(await file.arrayBuffer())));
    await prisma.$transaction([
      prisma.storeStat.deleteMany({
        where: { store: "GOOGLE_PLAY", report: PLAY_IMPORT_REPORT, date: { in: days.map((d) => dbDate(d.date)) } },
      }),
      prisma.storeStat.createMany({
        data: days.map((d) => ({
          store: "GOOGLE_PLAY" as const,
          report: PLAY_IMPORT_REPORT,
          split: "TOTAL" as const,
          date: dbDate(d.date),
          uninstalls: d.count,
        })),
      }),
    ]);
    revalidatePath(routes.stores);
    const total = days.reduce((s, d) => s + d.count, 0);
    return {
      ok: true,
      message: `Imported ${total.toLocaleString("en")} uninstalls over ${days.length} days (${days[0]!.date} to ${days.at(-1)!.date}) from ${columns.length === 1 ? `“${columns[0]}”` : `${columns.length} columns`}.`,
    };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

/**
 * Imports App Store Connect's Total Downloads "By App Referrer" export. For the days in the file it
 * replaces the app referrer numbers from Apple's report, which leave out small numbers. Uploading
 * the same days again replaces them; other days are kept.
 */
export async function importAppReferrers(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose the CSV file to import." };
  if (file.size > MAX_BYTES) return { ok: false, message: "That file is too big for an App Referrer export (max 2 MB)." };

  try {
    const { rows, referrers } = parseAppReferrerCsv(decodeCsv(new Uint8Array(await file.arrayBuffer())));
    const days = [...new Set(rows.map((r) => r.date))];
    await prisma.$transaction([
      prisma.storeStat.deleteMany({
        where: { store: "APP_STORE", report: APPLE_REFERRER_REPORTS.CSV, date: { in: days.map(dbDate) } },
      }),
      prisma.storeStat.createMany({
        data: rows.map((r) => ({
          store: "APP_STORE" as const,
          report: APPLE_REFERRER_REPORTS.CSV,
          split: "SOURCE" as const,
          date: dbDate(r.date),
          channel: "App referrer",
          utmSource: r.referrer,
          downloads: r.count,
        })),
      }),
    ]);
    revalidatePath(routes.stores);
    const total = rows.reduce((s, r) => s + r.count, 0);
    return {
      ok: true,
      message: `Imported ${total.toLocaleString("en")} downloads from ${referrers.length} app${referrers.length === 1 ? "" : "s"} over ${days.length} days (${days[0]} to ${days.at(-1)}).`,
    };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

/**
 * Reads the referral portal's referral-codes CSV and saves only its total "Usage Count" for the
 * chosen day (uploading the same day again replaces it). The file itself isn't kept.
 */
export async function importReferralCodes(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireAdmin();
  const file = formData.get("file");
  const day = String(formData.get("date") ?? "");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose the referral codes CSV." };
  if (file.size > MAX_BYTES) return { ok: false, message: "That file is too big for a referral codes export (max 2 MB)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) return { ok: false, message: "Pick the date of the export." };
  if (dbDate(day).getTime() > Date.now()) return { ok: false, message: "The date can’t be in the future." };

  try {
    const { total, codes, used } = parseReferralCodesCsv(decodeCsv(new Uint8Array(await file.arrayBuffer())));
    const note = `${codes} codes, ${used} used`;
    await prisma.referralDownload.upsert({
      where: { date: dbDate(day) },
      create: { date: dbDate(day), count: total, note },
      update: { count: total, note },
    });
    revalidatePath(routes.stores);
    return { ok: true, message: `Total usage ${total.toLocaleString("en")} saved for ${day} (${note}).` };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

/**
 * Saves deletions typed in from App Store Connect for days Apple's Analytics report doesn't cover
 * yet. Fields are named `d-YYYY-MM-DD`; an empty field removes that day's number.
 */
export async function saveAppleDeletions(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireAdmin();
  const gap = await getAppleDeletionGap();
  if (!gap) return { ok: false, message: "Apple’s report already covers every day, so there’s nothing to fill in." };

  const allowed = new Set(gap.days.map((d) => d.date));
  const entries: { date: string; count: number | null }[] = [];
  for (const [name, raw] of formData.entries()) {
    const date = name.startsWith("d-") ? name.slice(2) : null;
    if (!date || !allowed.has(date)) continue;
    const text = String(raw).trim();
    const count = text === "" ? null : Number(text);
    if (count !== null && (!Number.isInteger(count) || count < 0 || count > 1_000_000)) {
      return { ok: false, message: `${date}: enter a whole number, 0 or more.` };
    }
    entries.push({ date, count });
  }

  await prisma.$transaction([
    prisma.storeStat.deleteMany({
      where: { store: "APP_STORE", report: APPLE_MANUAL_REPORT, date: { in: entries.map((e) => dbDate(e.date)) } },
    }),
    prisma.storeStat.createMany({
      data: entries
        .filter((e) => e.count !== null)
        .map((e) => ({ store: "APP_STORE" as const, report: APPLE_MANUAL_REPORT, split: "TOTAL" as const, date: dbDate(e.date), uninstalls: e.count! })),
    }),
  ]);
  revalidatePath(routes.stores);
  const filled = entries.filter((e) => e.count !== null);
  return {
    ok: true,
    message: filled.length
      ? `Saved ${filled.reduce((s, e) => s + e.count!, 0).toLocaleString("en")} deletions over ${filled.length} day${filled.length === 1 ? "" : "s"}.`
      : "Cleared the numbers you entered.",
  };
}
