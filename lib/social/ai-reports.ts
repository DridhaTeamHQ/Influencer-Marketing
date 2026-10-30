import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { NO_CAPTION, getContentReport, type AnalysedPost, type ContentReport } from "@/lib/social/content-analysis";
import type { PlatformKey } from "@/lib/social/overview";
import { errorMessage } from "@/lib/stores/shared";

/**
 * The AI analysis behind the "Trending" tile on each platform page. The weekly cron
 * (`/api/cron/ai-weekly`) analyses every platform; the tile's refresh button redoes one.
 */

async function save(report: ContentReport, trigger: "weekly" | "manual") {
  await prisma.aiReport.create({ data: { kind: "CONTENT", trigger, data: report as unknown as Prisma.InputJsonValue } });
}

/** The newest analysis of one platform, from a weekly run or a refresh. */
async function latestFor(platform: PlatformKey) {
  const rows = await prisma.aiReport.findMany({ where: { kind: "CONTENT" }, orderBy: { createdAt: "desc" }, take: 20 });
  for (const row of rows) {
    const analysis = (row.data as unknown as ContentReport).platforms.find((p) => p.platform === platform);
    if (analysis) return { analysis, createdAt: row.createdAt };
  }
  return null;
}

export type TrendPick = { name: string; note: string };

/** A category needs this many videos to count; one video doing well could be luck. */
const MIN_VIDEOS = 2;

/**
 * Which category of all our videos goes viral most: the one with the most viral videos (2× our
 * usual views or more), a tie going to the higher share of its videos that went viral, then to the
 * higher average. Categories with no viral video come after, by how far above usual they average.
 */
function rankCategories(posts: AnalysedPost[]): TrendPick[] {
  return [...new Set(posts.map((p) => p.category))]
    .filter((name) => name !== NO_CAPTION && name !== "Other")
    .map((name) => {
      const inCategory = posts.filter((p) => p.category === name);
      return {
        name,
        total: inCategory.length,
        viral: inCategory.filter((p) => p.viral).length,
        average: Math.round((inCategory.reduce((s, p) => s + p.multiple, 0) / inCategory.length) * 10) / 10,
      };
    })
    .filter((r) => r.total >= MIN_VIDEOS && (r.viral > 0 || r.average > 1))
    .sort((a, b) => b.viral - a.viral || b.viral / b.total - a.viral / a.total || b.average - a.average)
    .map((r) => ({
      name: r.name,
      note: r.viral ? `${r.viral} of ${r.total} videos viral` : `avg ${r.average}× usual views · ${r.total} videos`,
    }));
}

export type PlatformTrends = {
  updatedAt: Date | null;
  /** Up to two categories, best first; empty when none of our videos beat our usual. */
  picks: TrendPick[];
  /** Why there are no picks, for the tile. */
  empty: string;
};

/** The top two categories for one platform, from all its own videos. */
export async function getPlatformTrends(platform: PlatformKey): Promise<PlatformTrends> {
  const latest = await latestFor(platform);
  const analysis = latest?.analysis;
  const posts = analysis?.status === "ok" ? analysis.posts : [];
  return {
    updatedAt: latest?.createdAt ?? null,
    picks: rankCategories(posts).slice(0, 2),
    empty: !analysis
      ? "Press refresh to let AI check"
      : analysis.status === "error"
        ? "AI couldn't read the videos; try refresh"
        : posts.length
          ? "No topic is beating our usual views yet"
          : "No videos to analyse yet",
  };
}

/** The refresh button: re-analyses one platform now. Saved on its own, so refreshes can't overwrite each other. */
export async function refreshPlatformTrends(platform: PlatformKey) {
  await save(await getContentReport(platform), "manual");
}

/** The weekly run: every platform at once. */
export async function runWeeklyReports() {
  try {
    await save(await getContentReport(), "weekly");
    return { content: "saved" };
  } catch (e) {
    return { content: errorMessage(e) };
  }
}
