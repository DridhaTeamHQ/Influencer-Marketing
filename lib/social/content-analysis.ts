import { askOpenAI, openaiModel } from "@/lib/openai";
import * as facebook from "@/lib/social/facebook";
import * as instagram from "@/lib/social/instagram";
import { PLATFORMS, type PlatformKey } from "@/lib/social/overview";
import * as youtube from "@/lib/social/youtube";
import { errorMessage } from "@/lib/stores/shared";

/**
 * "Which of my videos are going viral, and in which category?" for our own accounts.
 * Reads all our videos per platform (up to 200). We do the maths (how far above our usual each video is,
 * 2× or more is viral); ChatGPT only sorts the videos into topic categories.
 */

/** A post counts as viral at this many times the account's median views. */
const VIRAL_MULTIPLE = 2;
const MIN_VIRAL_VIEWS = 100;

export type OurPost = {
  platform: PlatformKey;
  id: string;
  title: string;
  kind: string;
  url: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  views: number;
  viewsPerDay: number;
  interactions: number;
  /** Views compared with the account's median post, e.g. 3.2 = 3.2× the usual. */
  multiple: number;
  viral: boolean;
};

const ageDays = (iso: string) => Math.max((Date.now() - new Date(iso).getTime()) / 86_400_000, 0.25);
const round1 = (n: number) => Math.round(n * 10) / 10;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

type Raw = Omit<OurPost, "viewsPerDay" | "multiple" | "viral">;

/** Adds speed and the "× usual" multiple, which only make sense against the rest of the account. */
function score(posts: Raw[]): OurPost[] {
  const usual = median(posts.map((p) => p.views)) || 1;
  return posts.map((p) => {
    const multiple = round1(p.views / usual);
    return {
      ...p,
      viewsPerDay: Math.round(p.views / ageDays(p.publishedAt)),
      multiple,
      viral: multiple >= VIRAL_MULTIPLE && p.views >= MIN_VIRAL_VIEWS,
    };
  });
}

export type PlatformContent =
  | { platform: PlatformKey; status: "ok"; posts: OurPost[] }
  | { platform: PlatformKey; status: "not_connected" }
  | { platform: PlatformKey; status: "error"; error: string };

async function load(platform: PlatformKey, fn: () => Promise<Raw[] | null>): Promise<PlatformContent> {
  try {
    const posts = await fn();
    return posts ? { platform, status: "ok", posts: score(posts) } : { platform, status: "not_connected" };
  } catch (e) {
    return { platform, status: "error", error: errorMessage(e) };
  }
}

const youtubeConnected = async () => !youtube.youtubeMissingEnv().length && Boolean(await youtube.getConnection());

/** Every video we analyse per platform, newest first; enough for all of ours. */
const ALL_VIDEOS = 200;

/** How to read each platform's latest posts; null when it isn't connected. */
const LOADERS: Record<PlatformKey, (count: number) => Promise<Raw[] | null>> = {
  youtube: async (count) => {
    if (!(await youtubeConnected())) return null;
    const channel = await youtube.getChannel();
    if (!channel) return null;
    const videos = await youtube.getRecentVideos(channel.uploadsPlaylist, count);
    return videos.map((v) => ({
      platform: "youtube",
      id: v.id,
      title: v.title,
      // YouTube Shorts are at most 3 minutes.
      kind: v.duration <= 180 ? "Short" : "Video",
      url: `https://www.youtube.com/watch?v=${v.id}`,
      thumbnailUrl: v.thumbnailUrl,
      publishedAt: v.publishedAt,
      views: v.views,
      interactions: v.likes + v.comments,
    }));
  },
  instagram: async (count) => {
    if (instagram.instagramMissingEnv().length || !(await instagram.getConnection())) return null;
    // Videos only (Reels and videos); photos and carousels are mixed in, so read twice as many posts.
    const posts = (await instagram.getPosts(count * 2)).filter((p) => p.kind === "Reel" || p.kind === "Video").slice(0, count);
    return posts.map((p) => ({
      platform: "instagram",
      id: p.id,
      title: p.caption,
      kind: p.kind,
      url: p.permalink,
      thumbnailUrl: p.thumbnailUrl,
      publishedAt: p.publishedAt,
      views: p.views || p.reach,
      interactions: p.interactions,
    }));
  },
  facebook: async (count) => {
    if (facebook.facebookMissingEnv().length || (!facebook.usesEnvToken() && !(await facebook.getConnection()))) return null;
    // Videos only, like Instagram.
    const posts = (await facebook.getPosts(count * 2)).filter((p) => p.kind === "Video").slice(0, count);
    return posts.map((p) => ({
      platform: "facebook",
      id: p.id,
      title: p.message,
      kind: p.kind,
      url: p.permalink,
      thumbnailUrl: p.thumbnailUrl,
      publishedAt: p.publishedAt,
      views: p.views || p.reach,
      interactions: p.interactions,
    }));
  },
};

/** One platform's latest videos, newest first. */
export function loadPlatformContent(platform: PlatformKey, count = ALL_VIDEOS): Promise<PlatformContent> {
  return load(platform, () => LOADERS[platform](count));
}

/** Our latest videos on every connected platform. */
export function loadOurContent(count = ALL_VIDEOS): Promise<PlatformContent[]> {
  return Promise.all(PLATFORM_KEYS.map((platform) => loadPlatformContent(platform, count)));
}

// ─── The analysis ──────────────────────────────────────────────────────

const PLATFORM_KEYS: PlatformKey[] = ["youtube", "instagram", "facebook"];

export type CategoryTrend = "growing" | "steady" | "declining";

export type CategoryStats = {
  name: string;
  trend: CategoryTrend;
  posts: number;
  viralPosts: number;
  views: number;
  avgViewsPerDay: number;
};

export type AnalysedPost = OurPost & { category: string };

export type PlatformAnalysis =
  | { platform: PlatformKey; status: "ok"; categories: CategoryStats[]; posts: AnalysedPost[] }
  | { platform: PlatformKey; status: "not_connected" }
  | { platform: PlatformKey; status: "error"; error: string };

export type ContentReport = {
  generatedAt: string;
  model: string;
  platforms: PlatformAnalysis[];
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["categories", "posts"],
  properties: {
    categories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "trend"],
        properties: {
          name: { type: "string", description: "Short topic name, 1–3 words, no 'and' lists, e.g. 'Elections', 'Delhi protests', 'Asian Games', 'Jobs & economy'." },
          trend: { type: "string", enum: ["growing", "steady", "declining"] },
        },
      },
    },
    posts: {
      type: "array",
      description: "Every post from the data, by id.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "category"],
        properties: {
          id: { type: "string" },
          category: { type: "string", description: "Exactly one of the category names." },
        },
      },
    },
  },
};

const instructions = (platform: PlatformKey) =>
  [
    `You are a social media analyst. You get our latest ${PLATFORMS[platform].label} posts as JSON.`,
    "Sort every video into 5–8 topic categories by what it is about (its title or caption). Name each one in 1–3 words, like a tag: 'Protests', 'Elections', 'Sports', 'AI & tech', 'Economy', 'Education'.",
    "Each category is ONE clear theme. Keep everything on that theme together wherever it happens (every protest video goes in 'Protests', India or abroad; every election video in 'Elections'), and never split a theme into near-duplicates.",
    "Never make a catch-all or mixed category ('Public affairs', 'News', 'Society', 'Current affairs'). A video that fits no theme goes in 'Other'.",
    "Ignore repeated brand lines in captions (our app name, 'download the app', sign-offs, hashtags) and classify each post by the actual story it covers. Only posts that are purely about our app go into a promo category.",
    "Judge this platform on its own: what works here may differ from our other platforms.",
    `'multiple' is a post's views compared with the account's median (${VIRAL_MULTIPLE}× or more is viral); 'postedDaysAgo' tells how recent it is.`,
    "A category is 'growing' when its recent posts beat its older ones or it holds recent viral posts, 'declining' when its recent posts do worse.",
  ].join("\n");

type Answer = { categories: { name: string; trend: CategoryTrend }[]; posts: { id: string; category: string }[] };

const pieces = (text: string) => text.split(/\n+|(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const key = (piece: string) => piece.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Captions often open with the same brand line ("✍️ dailymattr writes", "dailymattr is a news app…"),
 * which pushed the actual story out of what the AI saw and lumped those posts together.
 * Drops every line or sentence that appears in 3 or more posts, keeping what each post is about.
 * A post whose caption is nothing but those lines gets "" (its story is only in the image).
 */
function storyTexts(posts: OurPost[]) {
  const counts = new Map<string, number>();
  for (const p of posts) for (const k of new Set(pieces(p.title).map(key))) counts.set(k, (counts.get(k) ?? 0) + 1);
  return new Map(posts.map((p) => [p.id, pieces(p.title).filter((s) => (counts.get(key(s)) ?? 0) < 3).join(" ").slice(0, 300)]));
}

/** Category for posts whose caption says nothing about the story; left out of the trending ranking. */
export const NO_CAPTION = "No caption";

/** Sorts one platform's posts into categories with ChatGPT. Takes 15–40 seconds. */
async function analyse(content: PlatformContent): Promise<PlatformAnalysis> {
  if (content.status !== "ok") return content;
  if (!content.posts.length) return { ...content, categories: [], posts: [] };
  const stories = storyTexts(content.posts);
  // Posts with no story in the caption can't be sorted by topic, so the AI doesn't see them.
  const input = content.posts
    .filter((p) => stories.get(p.id))
    .map((p) => ({
      id: p.id,
      text: stories.get(p.id),
      kind: p.kind,
      views: p.views,
      multiple: p.multiple,
      postedDaysAgo: Math.round(ageDays(p.publishedAt)),
    }));
  try {
    const answer: Answer = input.length
      ? await askOpenAI<Answer>({ instructions: instructions(content.platform), input: JSON.stringify(input), schema: SCHEMA, effort: "medium" })
      : { categories: [], posts: [] };
    const byId = new Map(answer.posts.map((p) => [p.id, p.category]));
    const posts = content.posts.map((p) => ({ ...p, category: stories.get(p.id) ? byId.get(p.id) || "Other" : NO_CAPTION }));
    const categories = [...new Set([...answer.categories.map((k) => k.name), ...posts.map((p) => p.category)])]
      .map((name) => {
        const inCategory = posts.filter((p) => p.category === name);
        return {
          name,
          trend: answer.categories.find((k) => k.name === name)?.trend ?? "steady",
          posts: inCategory.length,
          viralPosts: inCategory.filter((p) => p.viral).length,
          views: inCategory.reduce((sum, p) => sum + p.views, 0),
          avgViewsPerDay: inCategory.length ? Math.round(inCategory.reduce((sum, p) => sum + p.viewsPerDay, 0) / inCategory.length) : 0,
        };
      })
      .filter((k) => k.posts > 0);
    return { platform: content.platform, status: "ok", categories, posts };
  } catch (e) {
    return { platform: content.platform, status: "error", error: errorMessage(e) };
  }
}

/** Loads our posts and analyses each platform on its own, in parallel. Pass a platform to redo only that one. */
export async function getContentReport(only?: PlatformKey): Promise<ContentReport> {
  const content = only ? [await loadPlatformContent(only)] : await loadOurContent();
  const platforms = await Promise.all(content.map(analyse));
  if (!platforms.some((p) => p.status === "ok")) {
    const reasons = platforms.map((p) => `${PLATFORMS[p.platform].label}: ${p.status === "error" ? p.error : "no posts"}`);
    throw new Error(`Nothing to analyse. ${reasons.join(". ")}.`);
  }
  return { generatedAt: new Date().toISOString(), model: openaiModel(), platforms };
}
