import type { NextRequest } from "next/server";
import { syncStoreChart } from "@/lib/stores/charts";

export const maxDuration = 60;

/**
 * GET /api/cron/store-charts — saves today's top chart and our position in both stores, so the
 * ranking keeps a daily history even when nobody opens the stores page.
 * Vercel Cron calls it every day (see vercel.json) with `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not configured on the server" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const results = await Promise.all([syncStoreChart("GOOGLE_PLAY"), syncStoreChart("APP_STORE")]);
  return Response.json(results, { status: results.some((r) => r.error) ? 500 : 200 });
}
