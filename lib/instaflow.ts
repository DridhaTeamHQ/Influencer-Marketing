/**
 * Server-side client for the Instaflow app (Reel Analytics), which fetches public Reel numbers.
 * It runs as its own server; we call its POST /api/reels/analyze. Set INSTAFLOW_URL to where it runs.
 */

const INSTAFLOW_URL = (process.env.INSTAFLOW_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export type ReelData = {
  username: string | null;
  caption: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  durationSeconds: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  engagementRate: number | null;
  /** When Instaflow retrieved these numbers (earlier than now if it served them from its cache). */
  fetchedAt: Date;
  /** Instaflow answered from its own cache, so no Apify credit was used. */
  cached: boolean;
};

/** Instaflow couldn't be reached at all, so nothing was charged. */
export class InstaflowUnreachableError extends Error {}

type AnalyzeResponse =
  | {
      success: true;
      retrievedAt: string;
      cached: boolean;
      reel: {
        username: string | null;
        caption: string | null;
        thumbnailUrl: string | null;
        publishedAt: string | null;
        durationSeconds: number | null;
      };
      metrics: { views: number | null; likes: number | null; comments: number | null; engagementRate: number | null };
    }
  | { success: false; error: { code: string; message: string; suggestion?: string } };

const date = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);

/** Fetches one Reel through Instaflow. Throws an Error with a readable message on failure. */
export async function fetchReelFromInstaflow(url: string): Promise<ReelData> {
  let res: Response;
  try {
    res = await fetch(`${INSTAFLOW_URL}/api/reels/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      cache: "no-store",
      signal: AbortSignal.timeout(150_000),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") throw new Error("Instaflow took too long to answer. Try again.");
    throw new InstaflowUnreachableError(`Can't reach Instaflow at ${INSTAFLOW_URL}. Is it running? (set INSTAFLOW_URL)`);
  }

  let body: AnalyzeResponse;
  try {
    body = (await res.json()) as AnalyzeResponse;
  } catch {
    throw new Error(`Instaflow answered with HTTP ${res.status} and no data.`);
  }
  if (!body.success) {
    const { message, suggestion } = body.error;
    throw new Error(suggestion ? `${message} ${suggestion}` : message);
  }

  const count = (n: number | null) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null);
  return {
    username: body.reel.username,
    caption: body.reel.caption,
    thumbnailUrl: body.reel.thumbnailUrl,
    publishedAt: date(body.reel.publishedAt),
    durationSeconds: body.reel.durationSeconds,
    views: count(body.metrics.views),
    likes: count(body.metrics.likes),
    comments: count(body.metrics.comments),
    engagementRate: body.metrics.engagementRate,
    fetchedAt: date(body.retrievedAt) ?? new Date(),
    cached: body.cached === true,
  };
}

/** Instagram CDN cover images expire and block hotlinking, so load them through Instaflow's proxy. */
export function instaflowThumbnail(thumbnailUrl: string | null) {
  return thumbnailUrl ? `${INSTAFLOW_URL}/api/reels/thumbnail?url=${encodeURIComponent(thumbnailUrl)}` : null;
}
