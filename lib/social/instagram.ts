import { prisma } from "@/lib/prisma";
import { routes } from "@/lib/routes";
import { decrypt, encrypt } from "@/lib/social/token-crypto";
import { countryName, isoDay, mapLimit, missingEnv } from "@/lib/stores/shared";

/**
 * Our Instagram account, signed in with Instagram ("Instagram API with Instagram Login": free, no
 * Facebook Page needed). The account has to be a Business or Creator account.
 *
 * developers.facebook.com → My Apps → Create app → use case "Manage messaging & content on
 * Instagram" → "API setup with Instagram login": copy the Instagram app ID and secret, add the
 * redirect URI `<site>/dridha/social/instagram/callback` (Meta wants https), and while the app is
 * in Development add the account under App roles → Instagram testers (accept the invite in
 * Instagram → Settings → Apps and websites).
 *
 * Instagram gives a token for 60 days instead of a refresh token; we save it encrypted in
 * SocialConnection.refreshToken and swap it for a fresh 60-day one while it's still valid.
 */

const PLATFORM = "INSTAGRAM" as const;
const GRAPH = "https://graph.instagram.com";
const VERSION = "v23.0";
/** Basic profile and posts, insights, and reading comments. */
const SCOPES = ["instagram_business_basic", "instagram_business_manage_insights", "instagram_business_manage_comments"];
const REQUIRED_SCOPES = SCOPES.slice(0, 2);
const ENV = ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"];

export const instagramMissingEnv = () => missingEnv(ENV);
const appId = () => process.env.INSTAGRAM_APP_ID!.trim();
const appSecret = () => process.env.INSTAGRAM_APP_SECRET!.trim();

export const OAUTH_STATE_COOKIE = "ig_oauth_state";
export const callbackUrl = (origin: string) => `${origin}${routes.instagram}/callback`;

const DAY = 86_400_000;

class InstagramError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
  }
}

/** Instagram answers errors as `{ error: { message, code } }`, or `{ error_message, code }` from the login endpoints. */
async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error || body.error_message) {
    const message = body.error?.message ?? body.error_message ?? `HTTP ${res.status}`;
    throw new InstagramError(`Instagram: ${message}`, body.error?.code ?? body.code);
  }
  return body as T;
}

// ─── Sign in ───────────────────────────────────────────────────────────

/** Instagram's consent page. */
export function authorizeUrl(origin: string, state: string) {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: appId(),
    redirect_uri: callbackUrl(origin),
    response_type: "code",
    scope: SCOPES.join(","),
    force_reauth: "true",
    state,
  }).toString();
  return url.toString();
}

type SavedToken = { token: string; expiresAt: number };
type TokenBody = { access_token: string; expires_in: number };

const tokenFrom = (body: TokenBody): SavedToken => ({ token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 });

let cached: SavedToken | null = null;

/** Swaps the code from Instagram's redirect for a 60-day token and saves the account. */
export async function completeSignIn(origin: string, code: string) {
  const short = await parse<{ access_token: string; permissions?: string | string[] } | { data: { access_token: string; permissions?: string | string[] }[] }>(
    await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId(),
        client_secret: appSecret(),
        grant_type: "authorization_code",
        redirect_uri: callbackUrl(origin),
        // Instagram adds "#_" to the code in the redirect.
        code: code.replace(/#_$/, ""),
      }),
      cache: "no-store",
    }),
  );
  const first = "data" in short ? short.data[0]! : short;
  const granted = Array.isArray(first.permissions) ? first.permissions : (first.permissions ?? "").split(",");
  if (first.permissions && REQUIRED_SCOPES.some((s) => !granted.includes(s))) {
    throw new Error("Please allow reading the profile and insights on Instagram's screen.");
  }

  const long = await parse<TokenBody>(
    await fetch(
      `${GRAPH}/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: appSecret(), access_token: first.access_token })}`,
      { cache: "no-store" },
    ),
  );
  cached = tokenFrom(long);
  const profile = await getProfile();

  const data = {
    accountId: profile.id,
    name: profile.username,
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

/** Forgets the account. Instagram has no revoke call; the app stays under Settings → Apps and websites until removed there. */
export async function disconnect() {
  cached = null;
  await prisma.socialConnection.deleteMany({ where: { platform: PLATFORM } });
}

async function markError(message: string) {
  cached = null;
  await prisma.socialConnection.updateMany({ where: { platform: PLATFORM }, data: { error: message } });
  return new Error(message);
}

/** Swap the token for a fresh 60-day one once it has fewer days than this left (Instagram needs it to be a day old). */
const REFRESH_BEFORE = 50 * DAY;
let refreshFailedUntil = 0;
let pending: Promise<string> | null = null;

/** The saved token, refreshed when it gets old. Page loads fire many calls at once, so they share one lookup. */
async function accessToken() {
  const now = Date.now();
  if (cached && (cached.expiresAt - now > REFRESH_BEFORE || (refreshFailedUntil > now && cached.expiresAt > now))) {
    return cached.token;
  }
  pending ??= (async () => {
    const connection = await getConnection();
    if (!connection) throw new Error("Instagram isn't connected.");
    let saved = JSON.parse(decrypt(connection.refreshToken)) as SavedToken;
    if (saved.expiresAt <= Date.now()) throw await markError("Instagram's 60-day sign-in ran out. Connect again.");
    if (saved.expiresAt - Date.now() < REFRESH_BEFORE) {
      try {
        saved = tokenFrom(
          await parse<TokenBody>(
            await fetch(`${GRAPH}/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: saved.token })}`, {
              cache: "no-store",
            }),
          ),
        );
        await prisma.socialConnection.update({ where: { platform: PLATFORM }, data: { refreshToken: encrypt(JSON.stringify(saved)) } });
      } catch {
        // Keep using the current token until it runs out; try again in an hour.
        refreshFailedUntil = Date.now() + 3_600_000;
      }
    }
    cached = saved;
    return saved.token;
  })().finally(() => (pending = null));
  return pending;
}

async function graph<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${GRAPH}/${VERSION}/${path}`);
  url.search = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    access_token: await accessToken(),
  }).toString();
  try {
    return await parse<T>(await fetch(url, { cache: "no-store" }));
  } catch (e) {
    // 190: the token stopped working (password changed, access removed in Instagram).
    if (e instanceof InstagramError && e.code === 190) {
      throw await markError("Instagram signed us out (password changed or access removed). Connect again.");
    }
    throw e;
  }
}

/** Instagram's image hosts send headers that can stop other sites showing them, so pages load them through our route. */
export const imageUrl = (src: string | null | undefined) => (src ? `${routes.instagram}/image?url=${encodeURIComponent(src)}` : null);

// ─── Profile ───────────────────────────────────────────────────────────

export type Profile = {
  id: string;
  username: string;
  name: string | null;
  pictureUrl: string | null;
  followers: number;
  following: number;
  posts: number;
  accountType: string | null;
};

export async function getProfile(): Promise<Profile> {
  const p = await graph<{
    id: string;
    user_id?: string | number;
    username: string;
    name?: string;
    profile_picture_url?: string;
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
    account_type?: string;
  }>("me", { fields: "user_id,username,name,profile_picture_url,followers_count,follows_count,media_count,account_type" });
  return {
    id: String(p.user_id ?? p.id),
    username: p.username,
    name: p.name ?? null,
    pictureUrl: p.profile_picture_url ?? null,
    followers: p.followers_count ?? 0,
    following: p.follows_count ?? 0,
    posts: p.media_count ?? 0,
    accountType: p.account_type ?? null,
  };
}

// ─── Account insights ──────────────────────────────────────────────────

type Breakdown = { results?: { dimension_values: string[]; value: number }[] };
type InsightRow = {
  name: string;
  total_value?: { value?: number; breakdowns?: Breakdown[] };
  values?: { value: number; end_time: string }[];
};

/** Instagram allows at most 30 days per insights call, so longer ranges are fetched in pieces. */
function windows(from: string, to: string) {
  const out: { since: number; until: number; from: string; to: string }[] = [];
  for (let start = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); start <= end; start += 30 * DAY) {
    const last = Math.min(start + 29 * DAY, end);
    out.push({ since: start / 1000, until: (last + DAY) / 1000, from: isoDay(new Date(start)), to: isoDay(new Date(last)) });
  }
  return out;
}

/** Metrics Instagram refused as invalid for this account; skipped from then on. */
const unsupported = new Set<string>();

/** One insights call; if Instagram rejects a metric, asks for them one by one and drops the bad ones. */
async function insights(metrics: string[], params: Record<string, string | number>): Promise<InsightRow[]> {
  const asked = metrics.filter((m) => !unsupported.has(m));
  if (!asked.length) return [];
  try {
    return (await graph<{ data: InsightRow[] }>("me/insights", { metric: asked.join(","), ...params })).data;
  } catch (e) {
    // 100: invalid parameter, e.g. a metric this account doesn't have (yet).
    if (!(e instanceof InstagramError) || e.code !== 100) throw e;
    if (asked.length === 1) {
      unsupported.add(asked[0]!);
      return [];
    }
    return (await Promise.all(asked.map((m) => insights([m], params)))).flat();
  }
}

const TOTAL_METRICS = [
  "reach",
  "views",
  "accounts_engaged",
  "total_interactions",
  "likes",
  "comments",
  "shares",
  "saves",
  "replies",
  "profile_links_taps",
] as const;

export type Totals = Record<(typeof TOTAL_METRICS)[number] | "follows" | "unfollows", number>;
/** Which numbers Instagram gave us (some need 100+ followers or a newer account). */
export type Available = Partial<Record<keyof Totals, boolean>>;

const zeroTotals = (): Totals => ({
  ...(Object.fromEntries(TOTAL_METRICS.map((m) => [m, 0])) as Record<(typeof TOTAL_METRICS)[number], number>),
  follows: 0,
  unfollows: 0,
});

async function totals(from: string, to: string) {
  const out = zeroTotals();
  const available: Available = {};
  const rows = await Promise.all(
    windows(from, to).map(async (w) => {
      const range = { period: "day", metric_type: "total_value", since: w.since, until: w.until };
      const [main, follows] = await Promise.all([
        insights([...TOTAL_METRICS], range),
        insights(["follows_and_unfollows"], { ...range, breakdown: "follow_type" }),
      ]);
      return [...main, ...follows];
    }),
  );
  for (const row of rows.flat()) {
    if (row.name === "follows_and_unfollows") {
      for (const r of row.total_value?.breakdowns?.[0]?.results ?? []) {
        // FOLLOWER: accounts that followed; NON_FOLLOWER: accounts that unfollowed.
        const key = r.dimension_values[0] === "FOLLOWER" ? "follows" : "unfollows";
        out[key] += r.value;
        available[key] = true;
      }
      continue;
    }
    if (row.name in out) {
      out[row.name as keyof Totals] += row.total_value?.value ?? 0;
      available[row.name as keyof Totals] = true;
    }
  }
  return { totals: out, available };
}

/** "2026-10-02T07:00:00+0000" ends the day of Oct 1 (Pacific), so step back a day. */
const dayOf = (endTime: string) => isoDay(new Date(Date.parse(endTime) - DAY));

/** A per-day metric over the range, as a map from day to value. */
async function series(metric: string, from: string, to: string) {
  const byDay = new Map<string, number>();
  const rows = await Promise.all(
    windows(from, to).map((w) => insights([metric], { period: "day", metric_type: "time_series", since: w.since, until: w.until })),
  );
  for (const row of rows.flat()) for (const v of row.values ?? []) byDay.set(dayOf(v.end_time), (byDay.get(dayOf(v.end_time)) ?? 0) + v.value);
  return byDay;
}

// ─── Audience ──────────────────────────────────────────────────────────

export type AudienceRow = { age: string; female: number; male: number; other: number };
export type Slice = { label: string; value: number };

/** Followers by one or two breakdowns. Instagram only shows this from 100 followers on. */
async function followerDemographics(breakdown: string) {
  const params = { period: "lifetime", metric_type: "total_value", breakdown };
  let rows: InsightRow[];
  try {
    rows = await insights(["follower_demographics"], params);
  } catch {
    rows = [];
  }
  // Some API versions want a timeframe; ask once more with one.
  if (!rows.length && !unsupported.has("follower_demographics")) {
    rows = await insights(["follower_demographics"], { ...params, timeframe: "this_month" }).catch(() => []);
  }
  return rows[0]?.total_value?.breakdowns?.[0]?.results ?? [];
}

async function audience() {
  const [ageGender, countries, cities] = await Promise.all([
    followerDemographics("age,gender"),
    followerDemographics("country"),
    followerDemographics("city"),
  ]);
  const total = ageGender.reduce((s, r) => s + r.value, 0);
  const ages = new Map<string, AudienceRow>();
  for (const r of ageGender) {
    const [age = "?", gender] = r.dimension_values;
    const row = ages.get(age) ?? { age, female: 0, male: 0, other: 0 };
    const pct = total ? (r.value / total) * 100 : 0;
    if (gender === "F") row.female += pct;
    else if (gender === "M") row.male += pct;
    else row.other += pct;
    ages.set(age, row);
  }
  const top = (rows: typeof countries, label: (v: string) => string) =>
    rows
      .map((r) => ({ label: label(r.dimension_values[0] ?? ""), value: r.value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  return {
    ages: [...ages.values()].sort((a, b) => a.age.localeCompare(b.age)),
    countries: top(countries, (c) => countryName(c) || c),
    cities: top(cities, (c) => c),
  };
}

// ─── Posts ─────────────────────────────────────────────────────────────

export type Post = {
  id: string;
  caption: string;
  /** "Reel", "Photo", "Carousel", "Video". */
  kind: string;
  permalink: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  views: number;
  interactions: number;
};

type MediaItem = {
  id: string;
  caption?: string;
  media_type: string;
  media_product_type?: string;
  permalink: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
};

function kind(m: MediaItem) {
  if (m.media_product_type === "REELS") return "Reel";
  if (m.media_type === "CAROUSEL_ALBUM") return "Carousel";
  if (m.media_type === "VIDEO") return "Video";
  return "Photo";
}

/** One post's lifetime numbers. Older posts may not have every metric, so fall back to fewer. */
async function postInsights(id: string): Promise<Record<string, number>> {
  for (const metric of ["reach,views,likes,comments,shares,saved,total_interactions", "reach,likes,comments,shares,saved,total_interactions"]) {
    try {
      const { data } = await graph<{ data: { name: string; values?: { value: number }[] }[] }>(`${id}/insights`, { metric });
      return Object.fromEntries(data.map((d) => [d.name, d.values?.[0]?.value ?? 0]));
    } catch (e) {
      if (!(e instanceof InstagramError) || e.code !== 100) throw e;
    }
  }
  return {};
}

/** The latest posts, newest first, with their lifetime numbers. */
export async function getPosts(count = 30): Promise<Post[]> {
  const { data } = await graph<{ data: MediaItem[] }>("me/media", {
    fields: "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count",
    limit: count,
  });
  return mapLimit(data, 6, async (m) => {
    const i = await postInsights(m.id).catch(() => ({}) as Record<string, number>);
    const likes = i.likes ?? m.like_count ?? 0;
    const comments = i.comments ?? m.comments_count ?? 0;
    const shares = i.shares ?? 0;
    const saves = i.saved ?? 0;
    return {
      id: m.id,
      caption: m.caption ?? "",
      kind: kind(m),
      permalink: m.permalink,
      thumbnailUrl: imageUrl(m.media_type === "VIDEO" ? m.thumbnail_url : (m.media_url ?? m.thumbnail_url)),
      publishedAt: m.timestamp,
      likes,
      comments,
      shares,
      saves,
      reach: i.reach ?? 0,
      views: i.views ?? 0,
      interactions: i.total_interactions ?? likes + comments + shares + saves,
    };
  });
}

export type Comment = { id: string; text: string; username: string; publishedAt: string; likes: number; post: Post };

/**
 * Newest comments on the latest posts that have any. Returns null when Instagram didn't allow
 * reading comments (the permission wasn't granted).
 */
export async function getRecentComments(posts: Post[], postCount = 6): Promise<Comment[] | null> {
  const withComments = posts.filter((p) => p.comments > 0).slice(0, postCount);
  try {
    const lists = await mapLimit(withComments, 4, async (post) => {
      const { data } = await graph<{ data: { id: string; text: string; username?: string; timestamp: string; like_count?: number }[] }>(
        `${post.id}/comments`,
        { fields: "id,text,username,timestamp,like_count", limit: 5 },
      );
      return data.map((c) => ({
        id: c.id,
        text: c.text,
        username: c.username ?? "",
        publishedAt: c.timestamp,
        likes: c.like_count ?? 0,
        post,
      }));
    });
    return lists.flat().sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  } catch (e) {
    // 10 / 200: permission missing.
    if (e instanceof InstagramError && (e.code === 10 || e.code === 200)) return null;
    throw e;
  }
}

// ─── Report ────────────────────────────────────────────────────────────

export type DayPoint = { date: string; reach: number; newFollowers: number | null };

export type InstagramReport = {
  totals: Totals;
  prev: Totals;
  available: Available;
  daily: DayPoint[];
  /** First day with follower numbers: Instagram only keeps the last 30 days. */
  followersFrom: string;
  audience: Awaited<ReturnType<typeof audience>>;
  posts: Post[];
  comments: Comment[] | null;
};

/** Everything the Instagram page shows for one date range. Optional parts fall back to empty instead of failing the page. */
export async function getInstagramReport(
  range: { from: string; to: string; prevFrom: string; prevTo: string },
  days: string[],
): Promise<InstagramReport> {
  const followersFrom = [range.from, isoDay(new Date(Date.now() - 30 * DAY))].sort().at(-1)!;
  const [current, prev, reach, followers, people, posts] = await Promise.all([
    totals(range.from, range.to),
    totals(range.prevFrom, range.prevTo),
    series("reach", range.from, range.to).catch(() => new Map<string, number>()),
    followersFrom <= range.to
      ? series("follower_count", followersFrom, range.to).catch(() => new Map<string, number>())
      : new Map<string, number>(),
    audience().catch(() => ({ ages: [], countries: [], cities: [] })),
    getPosts(),
  ]);
  const comments = await getRecentComments(posts).catch(() => null);

  return {
    totals: current.totals,
    prev: prev.totals,
    available: current.available,
    daily: days.map((date) => ({
      date,
      reach: reach.get(date) ?? 0,
      newFollowers: date >= followersFrom ? (followers.get(date) ?? 0) : null,
    })),
    followersFrom,
    audience: people,
    posts,
    comments,
  };
}
