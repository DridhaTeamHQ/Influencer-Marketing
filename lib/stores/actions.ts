"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth";
import type { AppStore } from "@/lib/generated/prisma/enums";
import { routes } from "@/lib/routes";
import { dbDate, errorMessage } from "@/lib/stores/shared";
import { PLAY_IMPORT_REPORT } from "@/lib/stores/stats";
import { decodeCsv, parseDailyCountCsv } from "@/lib/stores/store-import";
import { runSync } from "@/lib/stores/sync";

async function requireAdmin() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!isValidSessionToken(token)) throw new Error("Not signed in");
}

/** "Sync now" on the store pages: copies new reports, then refreshes the page. */
export async function syncStoreNow(store: AppStore, path: string) {
  await requireAdmin();
  if (store !== "GOOGLE_PLAY" && store !== "APP_STORE") return;
  await runSync(store, (await headers()).get("x-vercel-oidc-token"));
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
    revalidatePath(routes.playStore);
    const total = days.reduce((s, d) => s + d.count, 0);
    return {
      ok: true,
      message: `Imported ${total.toLocaleString("en")} uninstalls over ${days.length} days (${days[0]!.date} to ${days.at(-1)!.date}) from ${columns.length === 1 ? `“${columns[0]}”` : `${columns.length} columns`}.`,
    };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}
