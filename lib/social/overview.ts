import { routes } from "@/lib/routes";
import * as facebook from "@/lib/social/facebook";
import * as instagram from "@/lib/social/instagram";
import * as youtube from "@/lib/social/youtube";
import { rangeDays, type StoreRange } from "@/lib/stores/range";
import { errorMessage } from "@/lib/stores/shared";

/**
 * All connected platforms side by side for one date range, in one shape, so the overview page can
 * compare them. Each platform loads on its own: one failing or not being connected doesn't stop
 * the others.
 */

export type PlatformKey = "instagram" | "facebook" | "youtube";

export const PLATFORMS: Record<PlatformKey, { label: string; href: string }> = {
  instagram: { label: "Instagram", href: routes.instagram },
  facebook: { label: "Facebook", href: routes.facebook },
  youtube: { label: "YouTube", href: routes.youtube },
};

/** One post or video, with its lifetime numbers. */
export type ContentItem = {
  platform: PlatformKey;
  id: string;
  title: string;
  kind: string;
  url: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  interactions: number;
};

type PeriodNumbers = {
  /** Times content was seen (views / plays / impressions). */
  views: number;
  /** Unique accounts reached, where the platform tells us. */
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  /** Everything people did: likes, comments, shares, saves (and clicks on Facebook). */
  interactions: number;
  /** Followers gained minus lost. */
  netFollowers: number | null;
};

export type PlatformSummary =
  | { platform: PlatformKey; status: "not_connected" }
  | { platform: PlatformKey; status: "error"; error: string }
  | {
      platform: PlatformKey;
      status: "ok";
      account: string;
      url: string;
      followers: number | null;
      current: PeriodNumbers;
      prev: PeriodNumbers;
      /** Latest posts / videos, newest first. */
      content: ContentItem[];
    };

export type ConnectedSummary = Extract<PlatformSummary, { status: "ok" }>;

/** Interactions per view, in percent, so platforms can be compared on the same footing. */
export const engagementRate = (n: Pick<PeriodNumbers, "interactions" | "views">) =>
  n.views ? Math.round((n.interactions / n.views) * 1000) / 10 : null;

async function load(platform: PlatformKey, fn: () => Promise<PlatformSummary | null>): Promise<PlatformSummary> {
  try {
    return (await fn()) ?? { platform, status: "not_connected" };
  } catch (e) {
    return { platform, status: "error", error: errorMessage(e) };
  }
}

function instagramSummary(range: StoreRange, days: string[]) {
  return load("instagram", async () => {
    if (instagram.instagramMissingEnv().length || !(await instagram.getConnection())) return null;
    const [profile, report] = await Promise.all([instagram.getProfile(), instagram.getInstagramReport(range, days)]);
    const numbers = (t: instagram.Totals, available: instagram.Available): PeriodNumbers => ({
      views: t.views,
      reach: t.reach,
      likes: t.likes,
      comments: t.comments,
      shares: t.shares,
      interactions: t.total_interactions,
      netFollowers: available.follows || available.unfollows ? t.follows - t.unfollows : null,
    });
    return {
      platform: "instagram",
      status: "ok",
      account: `@${profile.username}`,
      url: `https://www.instagram.com/${profile.username}`,
      followers: profile.followers,
      current: numbers(report.totals, report.available),
      prev: numbers(report.prev, report.available),
      content: report.posts.map((p) => ({
        platform: "instagram",
        id: p.id,
        title: p.caption,
        kind: p.kind,
        url: p.permalink,
        thumbnailUrl: p.thumbnailUrl,
        publishedAt: p.publishedAt,
        views: p.views || p.reach,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
        interactions: p.interactions,
      })),
    };
  });
}

function facebookSummary(range: StoreRange, days: string[]) {
  return load("facebook", async () => {
    if (facebook.facebookMissingEnv().length || (!facebook.usesEnvToken() && !(await facebook.getConnection()))) return null;
    const [page, report] = await Promise.all([facebook.getPage(), facebook.getFacebookReport(range, days)]);
    const numbers = (t: facebook.Totals): PeriodNumbers => ({
      views: t.views,
      reach: report.available.reach ? t.reach : null,
      // Facebook gives one engagement total for the Page, not a split by kind.
      likes: null,
      comments: null,
      shares: null,
      interactions: t.engagements,
      netFollowers: report.available.follows ? t.follows - t.unfollows : null,
    });
    return {
      platform: "facebook",
      status: "ok",
      account: page.name,
      url: page.link,
      followers: page.followers,
      current: numbers(report.totals),
      prev: numbers(report.prev),
      content: report.posts.map((p) => ({
        platform: "facebook",
        id: p.id,
        title: p.message,
        kind: p.kind,
        url: p.permalink,
        thumbnailUrl: p.thumbnailUrl,
        publishedAt: p.publishedAt,
        views: p.views || p.reach,
        likes: p.reactions,
        comments: p.comments,
        shares: p.shares,
        interactions: p.interactions,
      })),
    };
  });
}

function youtubeSummary(range: StoreRange, days: string[]) {
  return load("youtube", async () => {
    if (youtube.youtubeMissingEnv().length || !(await youtube.getConnection())) return null;
    const channel = await youtube.getChannel();
    if (!channel) return null;
    const [report, videos] = await Promise.all([youtube.getYoutubeReport(range, days), youtube.getRecentVideos(channel.uploadsPlaylist, 25)]);
    const numbers = (t: youtube.Totals): PeriodNumbers => ({
      views: t.views,
      reach: null,
      likes: t.likes,
      comments: t.comments,
      shares: t.shares,
      interactions: t.likes + t.comments + t.shares,
      netFollowers: t.subscribersGained - t.subscribersLost,
    });
    return {
      platform: "youtube",
      status: "ok",
      account: channel.handle ?? channel.title,
      url: channel.handle ? `https://www.youtube.com/${channel.handle}` : `https://www.youtube.com/channel/${channel.id}`,
      followers: channel.subscribers,
      current: numbers(report.totals),
      prev: numbers(report.prev),
      content: videos.map((v) => ({
        platform: "youtube",
        id: v.id,
        title: v.title,
        // YouTube Shorts are at most 3 minutes.
        kind: v.duration <= 180 ? "Short" : "Video",
        url: `https://www.youtube.com/watch?v=${v.id}`,
        thumbnailUrl: v.thumbnailUrl,
        publishedAt: v.publishedAt,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        shares: 0,
        interactions: v.likes + v.comments,
      })),
    };
  });
}

export async function getSocialOverview(range: StoreRange): Promise<PlatformSummary[]> {
  const days = rangeDays(range);
  return Promise.all([instagramSummary(range, days), facebookSummary(range, days), youtubeSummary(range, days)]);
}

export const isConnected = (s: PlatformSummary): s is ConnectedSummary => s.status === "ok";
