import { prisma } from "@/lib/prisma";
import { routes } from "@/lib/routes";
import { imageUrl } from "@/lib/social/instagram";
import { decrypt, encrypt } from "@/lib/social/token-crypto";
import { isoDay, mapLimit, missingEnv } from "@/lib/stores/shared";

/**
 * Our Facebook Page, read through the Graph API with a Page access token.
 *
 * developers.facebook.com → My Apps → our app: copy the App ID and App secret (App settings →
 * Basic), add the use case "Manage everything on your Page" with pages_show_list,
 * pages_read_engagement and read_insights, and add `<site>/dridha/social/facebook/callback` under
 * Facebook Login → Settings → Valid OAuth Redirect URIs (localhost works without it). While the app
 * is in Development, whoever connects needs a role on the app and has to manage the Page.
 *
 * We sign in as the person, swap their token for a 60-day one and take the Page's token from it:
 * a Page token got that way doesn't expire, so it's all we save (encrypted, in
 * SocialConnection.refreshToken). If the person manages several Pages, FACEBOOK_PAGE_ID picks one.
 */

const PLATFORM = "FACEBOOK" as const;
const GRAPH = "https://graph.facebook.com";
const VERSION = "v26.0";
/** Listing the person's Pages, reading the Page and its posts, and Page insights. */
const SCOPES = ["pages_show_list", "pages_read_engagement", "read_insights"];
const REQUIRED_SCOPES = SCOPES.slice(0, 2);
const ENV = ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"];

/**
 * A Page token pasted in instead of signing in, e.g. one from Graph API Explorer → "Get Page
 * Access Token" (made from a long-lived user token, it doesn't expire). A signed-in Page wins.
 */
const envToken = () => process.env.FACEBOOK_PAGE_TOKEN?.trim() || null;
export const usesEnvToken = () => Boolean(envToken());

export const facebookMissingEnv = () => (envToken() ? [] : missingEnv(ENV));
const appId = () => process.env.FACEBOOK_APP_ID!.trim();
const appSecret = () => process.env.FACEBOOK_APP_SECRET!.trim();

export const OAUTH_STATE_COOKIE = "fb_oauth_state";
export const callbackUrl = (origin: string) => `${origin}${routes.facebook}/callback`;

const DAY = 86_400_000;

class FacebookError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
  }
}

/** The Graph API answers errors as `{ error: { message, code } }`. */
async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw new FacebookError(`Facebook: ${body.error?.message ?? `HTTP ${res.status}`}`, body.error?.code);
  }
  return body as T;
}

const graphUrl = (path: string, params: Record<string, string | number>) => {
  const url = new URL(`${GRAPH}/${VERSION}/${path}`);
  url.search = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  return url;
};

// ─── Sign in ───────────────────────────────────────────────────────────

/** Facebook's consent page. */
export function authorizeUrl(origin: string, state: string) {
  const url = new URL(`https://www.facebook.com/${VERSION}/dialog/oauth`);
  url.search = new URLSearchParams({
    client_id: appId(),
    redirect_uri: callbackUrl(origin),
    response_type: "code",
    scope: SCOPES.join(","),
    // Ask again for anything declined last time.
    auth_type: "rerequest",
    state,
  }).toString();
  return url.toString();
}

type SavedToken = { pageId: string; token: string };

let cached: SavedToken | null = null;

/** Swaps the code from Facebook's redirect for the Page's token and saves the Page. */
export async function completeSignIn(origin: string, code: string) {
  const short = await parse<{ access_token: string }>(
    await fetch(
      graphUrl("oauth/access_token", { client_id: appId(), client_secret: appSecret(), redirect_uri: callbackUrl(origin), code }),
      { cache: "no-store" },
    ),
  );
  const long = await parse<{ access_token: string }>(
    await fetch(
      graphUrl("oauth/access_token", {
        grant_type: "fb_exchange_token",
        client_id: appId(),
        client_secret: appSecret(),
        fb_exchange_token: short.access_token,
      }),
      { cache: "no-store" },
    ),
  );

  const { data: permissions } = await parse<{ data: { permission: string; status: string }[] }>(
    await fetch(graphUrl("me/permissions", { access_token: long.access_token }), { cache: "no-store" }),
  );
  const granted = permissions.filter((p) => p.status === "granted").map((p) => p.permission);
  if (REQUIRED_SCOPES.some((s) => !granted.includes(s))) {
    throw new Error("Please allow showing your Pages and reading their engagement on Facebook's screen.");
  }

  const { data: pages } = await parse<{ data: { id: string; name: string; access_token?: string }[] }>(
    await fetch(graphUrl("me/accounts", { fields: "id,name,access_token", limit: 100, access_token: long.access_token }), {
      cache: "no-store",
    }),
  );
  const wanted = process.env.FACEBOOK_PAGE_ID?.trim();
  const page = wanted ? pages.find((p) => p.id === wanted) : pages[0];
  if (!page?.access_token) {
    throw new Error(
      wanted
        ? `Page ${wanted} (FACEBOOK_PAGE_ID) wasn't shared. Connect again and tick that Page on Facebook's screen.`
        : "No Facebook Page was shared. Connect again and tick the Page on Facebook's screen.",
    );
  }

  cached = { pageId: page.id, token: page.access_token };
  const profile = await getPage();
  const data = {
    accountId: page.id,
    name: profile.name,
    thumbnailUrl: profile.pictureUrl,
    refreshToken: encrypt(JSON.stringify(cached)),
    error: null,
  };
  await prisma.socialConnection.upsert({
    where: { platform: PLATFORM },
    create: { platform: PLATFORM, ...data },
    update: { ...data, connectedAt: new Date() },
  });
}

export function getConnection() {
  return prisma.socialConnection.findUnique({ where: { platform: PLATFORM } });
}

/** Forgets the Page. The app stays under Facebook → Settings → Business integrations until removed there. */
export async function disconnect() {
  cached = null;
  await prisma.socialConnection.deleteMany({ where: { platform: PLATFORM } });
}

async function markError(message: string) {
  cached = null;
  await prisma.socialConnection.updateMany({ where: { platform: PLATFORM }, data: { error: message } });
  return new Error(message);
}

async function pageToken() {
  if (cached) return cached;
  const connection = await getConnection();
  if (connection) return (cached = JSON.parse(decrypt(connection.refreshToken)) as SavedToken);
  const token = envToken();
  if (!token) throw new Error("Facebook isn't connected.");
  // A Page token's "me" is the Page itself.
  const pageId =
    process.env.FACEBOOK_PAGE_ID?.trim() ||
    (await parse<{ id: string }>(await fetch(graphUrl("me", { fields: "id", access_token: token }), { cache: "no-store" }))).id;
  return (cached = { pageId, token });
}

/** A Graph API call as the Page; `{page}` in the path is the Page's id. */
async function graph<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const { pageId, token } = await pageToken();
  try {
    return await parse<T>(await fetch(graphUrl(path.replace("{page}", pageId), { ...params, access_token: token }), { cache: "no-store" }));
  } catch (e) {
    // 190: the token stopped working (password changed, access removed, no longer a Page admin).
    if (e instanceof FacebookError && e.code === 190) {
      throw await markError(
        (await getConnection()) || !envToken()
          ? "Facebook signed us out (password changed or access removed). Connect again."
          : "FACEBOOK_PAGE_TOKEN stopped working (password changed or access removed). Make a new one, or connect instead.",
      );
    }
    throw e;
  }
}

// ─── Page ──────────────────────────────────────────────────────────────

export type Page = {
  id: string;
  name: string;
  username: string | null;
  link: string;
  category: string | null;
  pictureUrl: string | null;
  followers: number;
  likes: number;
  talkingAbout: number;
};

export async function getPage(): Promise<Page> {
  const p = await graph<{
    id: string;
    name: string;
    username?: string;
    link?: string;
    category?: string;
    picture?: { data?: { url?: string } };
    followers_count?: number;
    fan_count?: number;
    talking_about_count?: number;
  }>("{page}", { fields: "id,name,username,link,category,picture.type(large){url},followers_count,fan_count,talking_about_count" });
  return {
    id: p.id,
    name: p.name,
    username: p.username ?? null,
    link: p.link ?? `https://www.facebook.com/${p.id}`,
    category: p.category ?? null,
    pictureUrl: p.picture?.data?.url ?? null,
    followers: p.followers_count ?? 0,
    likes: p.fan_count ?? 0,
    talkingAbout: p.talking_about_count ?? 0,
  };
}

// ─── Insights ──────────────────────────────────────────────────────────

type InsightRow = { name: string; values?: { value: number | Record<string, number>; end_time?: string }[] };

/** Metrics Facebook refused as invalid (it retires and renames them often); skipped from then on. */
const unsupported = new Set<string>();

/** One insights call; if Facebook rejects a metric, asks for them one by one and drops the bad ones. */
async function insights(node: string, metrics: string[], params: Record<string, string | number> = {}): Promise<InsightRow[]> {
  const asked = metrics.filter((m) => !unsupported.has(m));
  if (!asked.length) return [];
  try {
    return (await graph<{ data: InsightRow[] }>(`${node}/insights`, { metric: asked.join(","), ...params })).data;
  } catch (e) {
    // 100: invalid parameter, e.g. a retired metric.
    if (!(e instanceof FacebookError) || e.code !== 100) throw e;
    if (asked.length === 1) {
      unsupported.add(asked[0]!);
      return [];
    }
    return (await Promise.all(asked.map((m) => insights(node, [m], params)))).flat();
  }
}

const numberOf = (value: number | Record<string, number> | undefined) =>
  typeof value === "number" ? value : value ? Object.values(value).reduce((s, v) => s + v, 0) : 0;

/**
 * Each number on the page and the Page metrics it can come from, newest name first: Meta replaced
 * the "impressions" metrics with "media view" ones, and older Pages may only have the old names.
 */
const PAGE_METRICS = {
  views: ["page_media_view", "page_impressions"],
  reach: ["page_total_media_view_unique", "page_impressions_unique"],
  engagements: ["page_post_engagements"],
  pageViews: ["page_views_total"],
  follows: ["page_daily_follows_unique", "page_fan_adds_unique"],
  unfollows: ["page_daily_unfollows_unique", "page_fan_removes_unique"],
} as const;

export type Totals = Record<keyof typeof PAGE_METRICS, number>;
/** Which numbers Facebook gave us. */
export type Available = Partial<Record<keyof Totals, boolean>>;

/**
 * Facebook allows at most 93 days per insights call, so longer ranges are fetched in pieces. Page
 * insights only go back 2 years and older dates are rejected, so those days are left out.
 */
function windows(from: string, to: string) {
  const out: { since: number; until: number }[] = [];
  const oldest = Date.now() - 2 * 365 * DAY + DAY;
  for (let start = Math.max(Date.parse(`${from}T00:00:00Z`), Date.parse(`${isoDay(new Date(oldest))}T00:00:00Z`)), end = Date.parse(`${to}T00:00:00Z`); start <= end; start += 90 * DAY) {
    const last = Math.min(start + 89 * DAY, end);
    out.push({ since: start / 1000, until: (last + DAY) / 1000 });
  }
  return out;
}

/** "2026-10-02T07:00:00+0000" ends the day of Oct 1 (Pacific), so step back a day. */
const dayOf = (endTime: string) => isoDay(new Date(Date.parse(endTime) - DAY));

/** Every Page metric per day over the range: metric name → day → value. */
async function pageSeries(from: string, to: string) {
  const all = Object.values(PAGE_METRICS).flat();
  const rows = await Promise.all(windows(from, to).map((w) => insights("{page}", all, { period: "day", since: w.since, until: w.until })));
  const out = new Map<string, Map<string, number>>();
  for (const row of rows.flat()) {
    const byDay = out.get(row.name) ?? new Map<string, number>();
    for (const v of row.values ?? []) {
      if (!v.end_time) continue;
      const day = dayOf(v.end_time);
      if (day >= from && day <= to) byDay.set(day, (byDay.get(day) ?? 0) + numberOf(v.value));
    }
    out.set(row.name, byDay);
  }
  /** The first of a number's metric names Facebook answered for. */
  const pick = (key: keyof Totals) => PAGE_METRICS[key].map((m) => out.get(m)).find(Boolean) ?? null;
  return pick;
}

const zeroTotals = () => Object.fromEntries(Object.keys(PAGE_METRICS).map((k) => [k, 0])) as Totals;

async function totals(from: string, to: string) {
  const pick = await pageSeries(from, to);
  const out = zeroTotals();
  const available: Available = {};
  for (const key of Object.keys(PAGE_METRICS) as (keyof Totals)[]) {
    const byDay = pick(key);
    out[key] = byDay ? [...byDay.values()].reduce((s, v) => s + v, 0) : 0;
    if (byDay) available[key] = true;
  }
  return { totals: out, available, pick };
}

// ─── Posts ─────────────────────────────────────────────────────────────

export type Post = {
  id: string;
  message: string;
  /** "Photo", "Video", "Link", "Text", … */
  kind: string;
  permalink: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  reactions: number;
  comments: number;
  shares: number;
  reach: number;
  views: number;
  clicks: number;
  interactions: number;
};

type FeedItem = {
  id: string;
  message?: string;
  story?: string;
  created_time: string;
  permalink_url?: string;
  full_picture?: string;
  status_type?: string;
  shares?: { count?: number };
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
};

const KINDS: Record<string, string> = {
  added_photos: "Photo",
  added_video: "Video",
  shared_story: "Link",
  mobile_status_update: "Text",
  created_event: "Event",
  created_note: "Note",
};

/** One post's lifetime numbers, by the same newest-name-first rule as the Page metrics. */
const POST_METRICS = {
  views: ["post_media_view", "post_impressions"],
  reach: ["post_total_media_view_unique", "post_impressions_unique"],
  clicks: ["post_clicks"],
} as const;

async function postInsights(id: string) {
  const rows = await insights(id, Object.values(POST_METRICS).flat(), { period: "lifetime" });
  const byName = new Map(rows.map((r) => [r.name, numberOf(r.values?.[0]?.value)]));
  const pick = (key: keyof typeof POST_METRICS) => POST_METRICS[key].map((m) => byName.get(m)).find((v) => v !== undefined) ?? 0;
  return { views: pick("views"), reach: pick("reach"), clicks: pick("clicks") };
}

const FEED_FIELDS = "id,message,story,created_time,permalink_url,full_picture,status_type,shares";
const COUNT_FIELDS = "reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)";

/** The latest posts (up to 100, the most Facebook sends at once), newest first, with their lifetime numbers. */
export async function getPosts(count = 25): Promise<Post[]> {
  let data: FeedItem[];
  try {
    ({ data } = await graph<{ data: FeedItem[] }>("{page}/posts", { fields: `${FEED_FIELDS},${COUNT_FIELDS}`, limit: Math.min(count, 100) }));
  } catch (e) {
    // 10 / 200: reactions or comments need a permission we weren't given; show the posts without them.
    if (!(e instanceof FacebookError) || (e.code !== 10 && e.code !== 200)) throw e;
    ({ data } = await graph<{ data: FeedItem[] }>("{page}/posts", { fields: FEED_FIELDS, limit: Math.min(count, 100) }));
  }
  return mapLimit(data, 6, async (m) => {
    const i = await postInsights(m.id).catch(() => ({ views: 0, reach: 0, clicks: 0 }));
    const reactions = m.reactions?.summary?.total_count ?? 0;
    const comments = m.comments?.summary?.total_count ?? 0;
    const shares = m.shares?.count ?? 0;
    return {
      id: m.id,
      message: m.message ?? m.story ?? "",
      kind: KINDS[m.status_type ?? ""] ?? "Post",
      permalink: m.permalink_url ?? `https://www.facebook.com/${m.id}`,
      thumbnailUrl: imageUrl(m.full_picture),
      publishedAt: m.created_time,
      reactions,
      comments,
      shares,
      ...i,
      interactions: reactions + comments + shares,
    };
  });
}

// ─── Report ────────────────────────────────────────────────────────────

export type DayPoint = { date: string; reach: number; newFollowers: number | null };

export type FacebookReport = {
  totals: Totals;
  prev: Totals;
  available: Available;
  daily: DayPoint[];
  posts: Post[];
};

/** Everything the Facebook page shows for one date range. Insights fall back to empty instead of failing the page. */
export async function getFacebookReport(
  range: { from: string; to: string; prevFrom: string; prevTo: string },
  days: string[],
): Promise<FacebookReport> {
  const empty = { totals: zeroTotals(), available: {} as Available, pick: () => null };
  const [current, prev, posts] = await Promise.all([
    totals(range.from, range.to).catch(() => empty),
    totals(range.prevFrom, range.prevTo).catch(() => empty),
    getPosts(),
  ]);
  const reach = current.pick("reach");
  const follows = current.pick("follows");
  return {
    totals: current.totals,
    prev: prev.totals,
    available: current.available,
    daily: days.map((date) => ({
      date,
      reach: reach?.get(date) ?? 0,
      newFollowers: follows ? (follows.get(date) ?? 0) : null,
    })),
    posts,
  };
}
