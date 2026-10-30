import { prisma } from "@/lib/prisma";
import type { AppStore } from "@/lib/generated/prisma/enums";
import { appStoreMissingEnv, syncAppStore } from "@/lib/stores/app-store";
import { syncStoreChart } from "@/lib/stores/charts";
import { googlePlayMissingEnv, syncGooglePlay } from "@/lib/stores/google-play";
import { errorMessage } from "@/lib/stores/shared";

/** Store reports change at most a few times a day, so a sync older than this runs again. */
const STALE_AFTER_MS = 3 * 3_600_000;

export const missingEnvFor = (store: AppStore) =>
  store === "GOOGLE_PLAY" ? googlePlayMissingEnv() : appStoreMissingEnv();

/** Last attempt (with its error, if it failed) and last successful sync. */
const attemptKey = (store: AppStore) => `${store}:attempt`;
const successKey = (store: AppStore) => `${store}:success`;

export type SyncStatus = {
  /** Last successful sync, or null if none yet. */
  syncedAt: Date | null;
  /** Error from the last attempt, if it failed. */
  error: string | null;
  /** True when the last attempt is old enough to try again. */
  stale: boolean;
};

export async function getSyncStatus(store: AppStore): Promise<SyncStatus> {
  const rows = await prisma.storeSync.findMany({ where: { key: { in: [attemptKey(store), successKey(store)] } } });
  const attempt = rows.find((r) => r.key === attemptKey(store));
  const success = rows.find((r) => r.key === successKey(store));
  return {
    syncedAt: success?.syncedAt ?? null,
    error: attempt?.error ?? null,
    stale: !attempt || Date.now() - attempt.syncedAt.getTime() > STALE_AFTER_MS,
  };
}

/** Syncs already running in this server process, so two page loads don't fetch the same reports. */
const running = new Map<AppStore, Promise<void>>();

/**
 * Copies new store reports into the database, refreshes today's top chart and records how it went.
 * Never throws. `oidcToken` is Vercel's token from the request (Google Play's keyless sign-in).
 */
export function runSync(store: AppStore, oidcToken: string | null) {
  const existing = running.get(store);
  if (existing) return existing;

  const job = (async () => {
    let error: string | null = null;
    // The chart is public, so it updates even when the reports fail.
    const chart = syncStoreChart(store);
    try {
      if (store === "GOOGLE_PLAY") await syncGooglePlay(oidcToken);
      else await syncAppStore();
      await prisma.storeSync.upsert({
        where: { key: successKey(store) },
        create: { key: successKey(store) },
        update: { syncedAt: new Date() },
      });
    } catch (e) {
      error = errorMessage(e);
    }
    await prisma.storeSync.upsert({
      where: { key: attemptKey(store) },
      create: { key: attemptKey(store), error },
      update: { error, syncedAt: new Date() },
    });
    await chart;
  })().finally(() => running.delete(store));
  running.set(store, job);
  return job;
}
