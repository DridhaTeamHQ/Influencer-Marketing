import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { routes } from "@/lib/routes";
import { countryName, errorMessage, missingEnv } from "@/lib/stores/shared";

/**
 * Our YouTube channel, signed in with Google (OAuth). Both APIs are free:
 * - YouTube Data API v3: channel and video totals (10,000 quota units a day, a page load uses ~5),
 * - YouTube Analytics API: views, watch time, subscribers, traffic sources, audience per day.
 *
 * Google Cloud Console → APIs & Services: enable both APIs, set up the OAuth consent screen,
 * then Credentials → Create OAuth client ID (Web application) with the redirect URI
 * `<site>/dridha/social/youtube/callback` (one for localhost, one for the live domain).
 */

const PLATFORM = "YOUTUBE" as const;
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];
const ENV = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"];

export const youtubeMissingEnv = () => missingEnv(ENV);
const clientId = () => process.env.GOOGLE_OAUTH_CLIENT_ID!.trim();
const clientSecret = () => process.env.GOOGLE_OAUTH_CLIENT_SECRET!.trim();

export const OAUTH_STATE_COOKIE = "yt_oauth_state";
export const callbackUrl = (origin: string) => `${origin}${routes.youtube}/callback`;

// ─── Refresh token encryption ──────────────────────────────────────────

function key() {
  const secret = process.env.AUTH_SECRET ?? process.env.DATABASE_URL ?? "";
  return createHash("sha256").update(`social-token:${secret}`).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

function decrypt(value: string) {
  const [iv, tag, data] = value.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8");
}

// ─── Sign in ───────────────────────────────────────────────────────────

/** Google's consent page. `prompt=consent` makes Google send a refresh token every time. */
export function authorizeUrl(origin: string, state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: callbackUrl(origin),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return url.toString();
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...params }),
    cache: "no-store",
  });
  const body = await res.json();
  if (!res.ok) {
    const error = new Error(`Google sign-in failed: ${body.error_description ?? body.error ?? res.status}`);
    (error as Error & { code?: string }).code = body.error;
    throw error;
  }
  return body as { access_token: string; expires_in: number; refresh_token?: string; scope: string };
}

let token: { value: string; expires: number } | null = null;

/** Swaps the code from Google's redirect for tokens and saves the channel. */
export async function completeSignIn(origin: string, code: string) {
  const body = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: callbackUrl(origin) });
  if (!body.refresh_token) throw new Error("Google didn't send a refresh token. Remove the app's access in your Google account and connect again.");
  const missing = SCOPES.filter((s) => !body.scope.split(" ").includes(s));
  if (missing.length) throw new Error("Please allow both YouTube permissions on Google's screen.");

  token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  const channel = await getChannel();
  if (!channel) throw new Error("This Google account has no YouTube channel. Pick the account (or brand account) that owns the channel.");

  const data = {
    accountId: channel.id,
    name: channel.title,
    thumbnailUrl: channel.thumbnailUrl,
    refreshToken: encrypt(body.refresh_token),
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

export async function disconnect() {
  const connection = await getConnection();
  token = null;
  if (!connection) return;
  await prisma.socialConnection.delete({ where: { platform: PLATFORM } });
  // Also tell Google, so the app disappears from the account's permissions. Fine if it fails.
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(connection.refreshToken))}`, {
      method: "POST",
      cache: "no-store",
    });
  } catch {}
}

/** Access token from the saved refresh token, reused until shortly before it expires. */
async function accessToken() {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const connection = await getConnection();
  if (!connection) throw new Error("YouTube isn't connected.");
  try {
    const body = await tokenRequest({ refresh_token: decrypt(connection.refreshToken), grant_type: "refresh_token" });
    token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
    return token.value;
  } catch (e) {
    const code = (e as { code?: string }).code;
    const message =
      code === "invalid_grant"
        ? "Google signed us out of YouTube (access removed, password changed, or the 7-day limit of a consent screen in Testing). Connect again."
        : errorMessage(e);
    await prisma.socialConnection.update({ where: { platform: PLATFORM }, data: { error: message } });
    throw new Error(message);
  }
}

async function google<T>(url: string, params: Record<string, string>): Promise<T> {
  const full = new URL(url);
  full.search = new URLSearchParams(params).toString();
  const res = await fetch(full, { headers: { Authorization: `Bearer ${await accessToken()}` }, cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(`YouTube: ${body.error?.message ?? res.status}`);
  return body as T;
}

// ─── YouTube Data API ──────────────────────────────────────────────────

const DATA_API = "https://www.googleapis.com/youtube/v3";

type Thumbs = Record<string, { url: string } | undefined>;
const thumb = (t: Thumbs | undefined) => t?.medium?.url ?? t?.default?.url ?? null;

export type Channel = {
  id: string;
  title: string;
  handle: string | null;
  thumbnailUrl: string | null;
  subscribers: number | null;
  views: number;
  videos: number;
  uploadsPlaylist: string | null;
};

export async function getChannel(): Promise<Channel | null> {
  const body = await google<{ items?: ChannelItem[] }>(`${DATA_API}/channels`, {
    part: "snippet,statistics,contentDetails",
    mine: "true",
  });
  const item = body.items?.[0];
  if (!item) return null;
  return {
    id: item.id,
    title: item.snippet.title,
    handle: item.snippet.customUrl ?? null,
    thumbnailUrl: thumb(item.snippet.thumbnails),
    subscribers: item.statistics.hiddenSubscriberCount ? null : Number(item.statistics.subscriberCount ?? 0),
    views: Number(item.statistics.viewCount ?? 0),
    videos: Number(item.statistics.videoCount ?? 0),
    uploadsPlaylist: item.contentDetails?.relatedPlaylists?.uploads ?? null,
  };
}

type ChannelItem = {
  id: string;
  snippet: { title: string; customUrl?: string; thumbnails?: Thumbs };
  statistics: { subscriberCount?: string; hiddenSubscriberCount?: boolean; viewCount?: string; videoCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

export type Video = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  /** Seconds. */
  duration: number;
  views: number;
  likes: number;
  comments: number;
};

/** "PT1H2M3S" → 3723. */
function parseDuration(iso: string | undefined) {
  const m = iso?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [, d, h, min, s] = m.map((v) => Number(v ?? 0));
  return d! * 86_400 + h! * 3_600 + min! * 60 + s!;
}

/** Videos by id (up to 50), with their lifetime counts. */
export async function getVideos(ids: string[]): Promise<Video[]> {
  if (!ids.length) return [];
  const body = await google<{ items?: VideoItem[] }>(`${DATA_API}/videos`, {
    part: "snippet,statistics,contentDetails",
    id: ids.slice(0, 50).join(","),
  });
  return (body.items ?? []).map((v) => ({
    id: v.id,
    title: v.snippet.title,
    thumbnailUrl: thumb(v.snippet.thumbnails),
    publishedAt: v.snippet.publishedAt,
    duration: parseDuration(v.contentDetails?.duration),
    views: Number(v.statistics?.viewCount ?? 0),
    likes: Number(v.statistics?.likeCount ?? 0),
    comments: Number(v.statistics?.commentCount ?? 0),
  }));
}

type VideoItem = {
  id: string;
  snippet: { title: string; publishedAt: string; thumbnails?: Thumbs };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
};

/** The latest uploads, newest first. */
export async function getRecentVideos(uploadsPlaylist: string | null, count = 12) {
  if (!uploadsPlaylist) return [];
  const body = await google<{ items?: { contentDetails: { videoId: string } }[] }>(`${DATA_API}/playlistItems`, {
    part: "contentDetails",
    playlistId: uploadsPlaylist,
    maxResults: String(count),
  });
  const ids = (body.items ?? []).map((i) => i.contentDetails.videoId);
  const videos = await getVideos(ids);
  return videos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ─── YouTube Analytics API ─────────────────────────────────────────────

type Report = { columnHeaders: { name: string }[]; rows?: (string | number)[][] };

/** One Analytics report as objects keyed by column name. Analytics data lags 2–3 days. */
async function report(params: { from: string; to: string; metrics: string; dimensions?: string; sort?: string; maxResults?: number }) {
  const body = await google<Report>("https://youtubeanalytics.googleapis.com/v2/reports", {
    ids: "channel==MINE",
    startDate: params.from,
    endDate: params.to,
    metrics: params.metrics,
    ...(params.dimensions && { dimensions: params.dimensions }),
    ...(params.sort && { sort: params.sort }),
    ...(params.maxResults && { maxResults: String(params.maxResults) }),
  });
  const names = body.columnHeaders.map((c) => c.name);
  return (body.rows ?? []).map((row) => Object.fromEntries(names.map((n, i) => [n, row[i]!])));
}

const num = (v: string | number | undefined) => Number(v ?? 0);

export type Totals = {
  views: number;
  minutesWatched: number;
  /** Seconds. */
  averageViewDuration: number;
  averageViewPercentage: number;
  subscribersGained: number;
  subscribersLost: number;
  likes: number;
  comments: number;
  shares: number;
};

const TOTAL_METRICS =
  "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares";

async function totals(from: string, to: string): Promise<Totals> {
  const [row] = await report({ from, to, metrics: TOTAL_METRICS });
  return {
    views: num(row?.views),
    minutesWatched: num(row?.estimatedMinutesWatched),
    averageViewDuration: num(row?.averageViewDuration),
    averageViewPercentage: num(row?.averageViewPercentage),
    subscribersGained: num(row?.subscribersGained),
    subscribersLost: num(row?.subscribersLost),
    likes: num(row?.likes),
    comments: num(row?.comments),
    shares: num(row?.shares),
  };
}

export type DayPoint = { date: string; views: number; watchHours: number; gained: number; lost: number };
export type Slice = { label: string; views: number; watchHours?: number };
export type AudienceRow = { age: string; female: number; male: number; other: number };
export type TopVideo = Video & { periodViews: number; periodWatchHours: number; averageViewDuration: number };

const TRAFFIC_LABELS: Record<string, string> = {
  YT_SEARCH: "YouTube search",
  RELATED_VIDEO: "Suggested videos",
  SHORTS: "Shorts feed",
  SUBSCRIBER: "Browse features (home, subscriptions)",
  YT_CHANNEL: "Channel pages",
  EXT_URL: "External websites and apps",
  NO_LINK_OTHER: "Direct or unknown",
  NO_LINK_EMBEDDED: "Embedded players",
  PLAYLIST: "Playlists",
  YT_PLAYLIST_PAGE: "Playlist pages",
  YT_OTHER_PAGE: "Other YouTube features",
  NOTIFICATION: "Notifications",
  END_SCREEN: "End screens",
  ANNOTATION: "Cards and annotations",
  CAMPAIGN_CARD: "Campaign cards",
  ADVERTISING: "YouTube ads",
  PROMOTED: "Promoted",
  HASHTAGS: "Hashtag pages",
  SOUND_PAGE: "Sound pages",
  SHORTS_CONTENT_LINKS: "Shorts related links",
  VIDEO_REMIXES: "Remixes",
  LIVE_REDIRECT: "Live redirects",
  PRODUCT_PAGE: "Product pages",
};

const DEVICE_LABELS: Record<string, string> = {
  MOBILE: "Mobile",
  DESKTOP: "Computer",
  TABLET: "Tablet",
  TV: "TV",
  GAME_CONSOLE: "Game console",
  UNKNOWN_PLATFORM: "Unknown",
};

const titleCase = (v: string) => v.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

export type YoutubeReport = {
  totals: Totals;
  prev: Totals;
  daily: DayPoint[];
  traffic: Slice[];
  countries: Slice[];
  devices: Slice[];
  audience: AudienceRow[];
  topVideos: TopVideo[];
};

/** Everything the analytics page shows for one date range, fetched in parallel. */
export async function getYoutubeReport(range: { from: string; to: string; prevFrom: string; prevTo: string }, days: string[]): Promise<YoutubeReport> {
  const { from, to } = range;
  const [current, prev, daily, traffic, countries, devices, audience, top] = await Promise.all([
    totals(from, to),
    totals(range.prevFrom, range.prevTo),
    report({ from, to, metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost", dimensions: "day", sort: "day" }),
    report({ from, to, metrics: "views,estimatedMinutesWatched", dimensions: "insightTrafficSourceType", sort: "-views" }),
    report({ from, to, metrics: "views,estimatedMinutesWatched", dimensions: "country", sort: "-views", maxResults: 10 }),
    report({ from, to, metrics: "views,estimatedMinutesWatched", dimensions: "deviceType", sort: "-views" }),
    report({ from, to, metrics: "viewerPercentage", dimensions: "ageGroup,gender", sort: "ageGroup" }),
    report({
      from,
      to,
      metrics: "views,estimatedMinutesWatched,averageViewDuration",
      dimensions: "video",
      sort: "-views",
      maxResults: 10,
    }),
  ]);

  // Fill days without views with zeros so the chart has no gaps.
  const byDay = new Map(daily.map((r) => [String(r.day), r]));
  const dailyPoints = days.map((date) => {
    const r = byDay.get(date);
    return {
      date,
      views: num(r?.views),
      watchHours: hours(num(r?.estimatedMinutesWatched)),
      gained: num(r?.subscribersGained),
      lost: num(r?.subscribersLost),
    };
  });

  const ages = new Map<string, AudienceRow>();
  for (const r of audience) {
    const age = String(r.ageGroup).replace(/^age/, "").replace(/-$/, "+");
    const row = ages.get(age) ?? { age, female: 0, male: 0, other: 0 };
    const pct = num(r.viewerPercentage);
    if (r.gender === "female") row.female += pct;
    else if (r.gender === "male") row.male += pct;
    else row.other += pct;
    ages.set(age, row);
  }

  const videoDetails = new Map((await getVideos(top.map((r) => String(r.video)))).map((v) => [v.id, v]));
  const topVideos = top.flatMap((r) => {
    const video = videoDetails.get(String(r.video));
    return video
      ? [
          {
            ...video,
            periodViews: num(r.views),
            periodWatchHours: hours(num(r.estimatedMinutesWatched)),
            averageViewDuration: num(r.averageViewDuration),
          },
        ]
      : [];
  });

  const slice = (labels: Record<string, string>, key: string) => (r: Record<string, string | number>) => ({
    label: labels[String(r[key])] ?? titleCase(String(r[key])),
    views: num(r.views),
    watchHours: hours(num(r.estimatedMinutesWatched)),
  });

  return {
    totals: current,
    prev,
    daily: dailyPoints,
    traffic: traffic.map(slice(TRAFFIC_LABELS, "insightTrafficSourceType")),
    countries: countries.map((r) => ({ ...slice({}, "country")(r), label: countryName(String(r.country)) })),
    devices: devices.map(slice(DEVICE_LABELS, "deviceType")),
    audience: [...ages.values()],
    topVideos,
  };
}
