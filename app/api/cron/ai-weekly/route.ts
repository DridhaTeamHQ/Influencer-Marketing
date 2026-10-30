import type { NextRequest } from "next/server";
import { runWeeklyReports } from "@/lib/social/ai-reports";

// The AI sorts each platform's videos in parallel; give it room.
export const maxDuration = 300;

/**
 * GET /api/cron/ai-weekly — has the AI analyse our latest videos on every platform and saves it.
 * Vercel Cron calls it every Monday (see vercel.json) with `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not configured on the server" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const result = await runWeeklyReports();
  return Response.json(result, { status: result.content === "saved" ? 200 : 500 });
}
