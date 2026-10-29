import { prisma } from "@/lib/prisma";
import { routes } from "@/lib/routes";
import { decrypt, encrypt } from "@/lib/social/token-crypto";
import { isoDay, mapLimit, missingEnv } from "@/lib/stores/shared";

/**
 * Our LinkedIn company page, signed in with LinkedIn by one of the page's admins.
 *
 * linkedin.com/developers → Create app (link it to the company page and verify it from the page) →
 * Products → request "Community Management API" (it has to be the only product on the app; LinkedIn
 * reviews the request). Then Auth: copy the client ID and secret and add the redirect URL
 * `<site>/dridha/social/linkedin/callback`.
 *
 * LinkedIn gives a 60-day token, plus a 1-year refresh token once the app is approved; both are saved
 * encrypted in SocialConnection.refreshToken. The REST API is versioned by month (LINKEDIN_API_VERSION,
 * YYYYMM) and LinkedIn retires a version about a year after it comes out.
 */

const PLATFORM = "LINKEDIN" as const;
const API = "https://api.linkedin.com/rest";
const OAUTH = "https://www.linkedin.com/oauth/v2";
/** Page details, follower and post statistics; reading the page's posts, comments and reactions. */
const SCOPES = ["rw_organization_admin", "r_organization_social"];
const ENV = ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"];

export const linkedinMissingEnv = () => missingEnv(ENV);
const clientId = () => process.env.LINKEDIN_CLIENT_ID!.trim();
const clientSecret = () => process.env.LINKEDIN_CLIENT_SECRET!.trim();
const apiVersion = () => process.env.LINKEDIN_API_VERSION?.trim() || "202609";

export const OAUTH_STATE_COOKIE = "li_oauth_state";
export const callbackUrl = (origin: string) => `${origin}${routes.linkedinPage}/callback`;

const DAY = 86_400_000;

class LinkedInError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** LinkedIn answers errors as `{ message, status }`, or `{ error, error_description }` from the sign-in endpoints. */
async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const message = body.message ?? body.error_description ?? body.error ?? `HTTP ${res.status}`;
    throw new LinkedInError(`LinkedIn: ${message}`, res.status);
  }
  return body as T;
}

// ─── Sign in ───────────────────────────────────────────────────────────

/** LinkedIn's consent page. */
export function authorizeUrl(origin: string, state: string) {
  const url = new URL(`${OAUTH}/authorization`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    redirect_uri: callbackUrl(origin),
    scope: SCOPES.join(" "),
    state,
  }).toString();
  return url.toString();
}

type SavedToken = { token: string; expiresAt: number; refreshToken?: string; refreshExpiresAt?: number };
type TokenBody = { access_token: string; expires_in: number; refresh_token?: string; refresh_token_expires_in?: number; scope?: string };

const tokenFrom = (body: TokenBody, previous?: SavedToken): SavedToken => ({
  token: body.access_token,
  expiresAt: Date.now() + body.expires_in * 1000,
  refreshToken: body.refresh_token ?? previous?.refreshToken,
  refreshExpiresAt: body.refresh_token_expires_in ? Date.now() + body.refresh_token_expires_in * 1000 : previous?.refreshExpiresAt,
});

const requestToken = async (params: Record<string, string>) =>
  parse<TokenBody>(
    await fetch(`${OAUTH}/accessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, client_id: clientId(), client_secret: clientSecret() }),
      cache: "no-store",
    }),
  );

let cached: SavedToken | null = null;
/** The page we read, found when signing in. */
let cachedOrg: string | null = null;

/** Swaps the code from LinkedIn's redirect for a token and saves the page the member admins. */
export async function completeSignIn(origin: string, code: string) {
  const body = await requestToken({ grant_type: "authorization_code", code, redirect_uri: callbackUrl(origin) });
  if (body.scope && SCOPES.some((s) => !body.scope!.split(/[ ,]/).includes(s))) {
    throw new Error("LinkedIn didn't give every permission. Check the app has the Community Management API, then try again.");
  }
  cached = tokenFrom(body);
  cachedOrg = null;

  const orgId = await adminOrganization();
  const page = await getPage(orgId);
  const data = {
    accountId: orgId,
    name: page.name,
    thumbnailUrl: page.logoUrl,
    refreshToken: encrypt(JSON.stringify(cached)),
    error: null,
  };
  await prisma.socialConnection.upsert({
    where: { platform: PLATFORM },
    create: { platform: PLATFORM, ...data },
    update: { ...data, connectedAt: new Date() },
  });
  cachedOrg = orgId;
}

/** LINKEDIN_ORGANIZATION_ID if set (the number in the page's admin URL), else the first page this member admins. */
async function adminOrganization() {
  const { elements } = await api<{ elements: { organization: string }[] }>(
    "organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100",
  );
  const ids = elements.map((e) => e.organization.split(":").at(-1)!);
  const wanted = process.env.LINKEDIN_ORGANIZATION_ID?.trim();
  if (wanted) {
    if (!ids.includes(wanted)) throw new Error(`This LinkedIn member isn't an admin of page ${wanted}.`);
    return wanted;
  }
  if (!ids.length) throw new Error("This LinkedIn member isn't an admin of any company page.");
  return ids[0]!;
}

export function getConnection() {
  return prisma.socialConnection.findUnique({ where: { platform: PLATFORM } });
}

/** Forgets the page and revokes the token at LinkedIn. */
export async function disconnect() {
  const connection = await getConnection();
  cached = null;
  cachedOrg = null;
  if (connection) {
    try {
      const { token } = JSON.parse(decrypt(connection.refreshToken)) as SavedToken;
      await fetch(`${OAUTH}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token, client_id: clientId(), client_secret: clientSecret() }),
        cache: "no-store",
      });
    } catch {
      // Already gone at LinkedIn; forget it here anyway.
    }
  }
  await prisma.socialConnection.deleteMany({ where: { platform: PLATFORM } });
}

async function markError(message: string) {
  cached = null;
  await prisma.socialConnection.updateMany({ where: { platform: PLATFORM }, data: { error: message } });
  return new Error(message);
}

/** Use the refresh token once the access token has fewer days than this left. */
const REFRESH_BEFORE = 7 * DAY;
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
    if (!connection) throw new Error("LinkedIn isn't connected.");
    let saved = JSON.parse(decrypt(connection.refreshToken)) as SavedToken;
    const canRefresh = saved.refreshToken && (saved.refreshExpiresAt ?? Infinity) > Date.now();
    if (saved.expiresAt - Date.now() < REFRESH_BEFORE && canRefresh) {
      try {
        saved = tokenFrom(await requestToken({ grant_type: "refresh_token", refresh_token: saved.refreshToken! }), saved);
        await prisma.socialConnection.update({ where: { platform: PLATFORM }, data: { refreshToken: encrypt(JSON.stringify(saved)) } });
      } catch {
        // Keep using the current token until it runs out; try again in an hour.
        refreshFailedUntil = Date.now() + 3_600_000;
      }
    }
    if (saved.expiresAt <= Date.now()) throw await markError("LinkedIn's sign-in ran out. Connect again.");
    cached = saved;
    cachedOrg = connection.accountId;
    return saved.token;
  })().finally(() => (pending = null));
  return pending;
}

/**
 * One REST call. `path` is already a query string in LinkedIn's own format, e.g. `List(...)` and
 * `(timeRange:(start:…))`, which must not be percent-encoded; only URNs inside it are (see `urn`).
 */
async function api<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "LinkedIn-Version": apiVersion(),
      "X-Restli-Protocol-Version": "2.0.0",
      ...headers,
    },
    cache: "no-store",
  });
  try {
    return await parse<T>(res);
  } catch (e) {
    // 401: the token stopped working (access removed, or the member is no longer a page admin).
    if (e instanceof LinkedInError && e.status === 401) {
      throw await markError("LinkedIn signed us out (access removed or the token ran out). Connect again.");
    }
    throw e;
  }
}

/** URNs go into LinkedIn's query strings percent-encoded. */
const urn = (value: string) => encodeURIComponent(value);
const orgUrn = (id: string) => `urn:li:organization:${id}`;

async function organizationId() {
  await accessToken();
  if (!cachedOrg) throw new Error("LinkedIn isn't connected.");
  return cachedOrg;
}

// ─── Page ──────────────────────────────────────────────────────────────

export type Page = { id: string; name: string; vanityName: string | null; logoUrl: string | null; followers: number };

type Media = { "original~"?: { elements?: { identifiers?: { identifier: string }[] }[] } };

async function getPage(id: string): Promise<Page> {
  const [org, followers] = await Promise.all([
    api<{ localizedName: string; vanityName?: string; logoV2?: Media }>(
      `organizations/${id}?projection=(id,localizedName,vanityName,logoV2(original~:playableStreams))`,
    ),
    api<{ firstDegreeSize: number }>(`networkSizes/${urn(orgUrn(id))}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`).catch(() => ({
      firstDegreeSize: 0,
    })),
  ]);
  return {
    id,
    name: org.localizedName,
    vanityName: org.vanityName ?? null,
    logoUrl: org.logoV2?.["original~"]?.elements?.at(-1)?.identifiers?.[0]?.identifier ?? null,
    followers: followers.firstDegreeSize,
  };
}

export async function getLinkedInPage() {
  return getPage(await organizationId());
}

// ─── Statistics over time ──────────────────────────────────────────────

/**
 * LinkedIn keeps daily statistics for the last 12 months and has them about 2 days late, so ranges are
 * clipped to that; the first and last day we can ask for.
 */
function clip(from: string, to: string) {
  const first = isoDay(new Date(Date.now() - 364 * DAY));
  const last = isoDay(new Date(Date.now() - 2 * DAY));
  const start = from < first ? first : from;
  const end = to > last ? last : to;
  return start <= end ? { from: start, to: end } : null;
}

/** Per-day statistics between two days, inclusive. */
const timeIntervals = (from: string, to: string) =>
  `timeIntervals=(timeRange:(start:${Date.parse(`${from}T00:00:00Z`)},end:${Date.parse(`${to}T00:00:00Z`) + DAY}),timeGranularityType:DAY)`;

const dayOf = (start: number) => isoDay(new Date(start));

type ShareStats = {
  impressionCount?: number;
  uniqueImpressionsCount?: number;
  clickCount?: number;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
};

export type Totals = {
  impressions: number;
  /** Members who saw a post, added up per day (the same member can count on several days). */
  uniqueImpressions: number;
  clicks: number;
  reactions: number;
  comments: number;
  reposts: number;
  pageViews: number;
  organicFollowers: number;
  paidFollowers: number;
};

/** Which numbers LinkedIn gave us for the range. */
export type Available = { posts: boolean; pageViews: boolean; followers: boolean };

export type DayPoint = {
  date: string;
  impressions: number;
  clicks: number;
  engagements: number;
  pageViews: number;
  /** Null for days LinkedIn has no numbers for yet (the last 2 days) or anymore (over a year ago). */
  newFollowers: number | null;
  /** Followers at the end of the day, worked back from today's total. */
  followers: number | null;
};

const zeroTotals = (): Totals => ({
  impressions: 0,
  uniqueImpressions: 0,
  clicks: 0,
  reactions: 0,
  comments: 0,
  reposts: 0,
  pageViews: 0,
  organicFollowers: 0,
  paidFollowers: 0,
});

type Gain = { organic: number; paid: number };
type Daily = { posts: Map<string, ShareStats> | null; pageViews: Map<string, number> | null; followers: Map<string, Gain> | null };

async function daily(org: string, from: string, to: string): Promise<Daily> {
  const w = clip(from, to);
  if (!w) return { posts: null, pageViews: null, followers: null };
  const query = `q=organizationalEntity&organizationalEntity=${urn(orgUrn(org))}&${timeIntervals(w.from, w.to)}`;
  const [shares, views, follows] = await Promise.all([
    api<{ elements: { timeRange: { start: number }; totalShareStatistics: ShareStats }[] }>(`organizationalEntityShareStatistics?${query}`)
      .then(({ elements }) => new Map(elements.map((e) => [dayOf(e.timeRange.start), e.totalShareStatistics])))
      .catch(() => null),
    api<{ elements: { timeRange: { start: number }; totalPageStatistics?: { views?: { allPageViews?: { pageViews?: number } } } }[] }>(
      `organizationPageStatistics?q=organization&organization=${urn(orgUrn(org))}&${timeIntervals(w.from, w.to)}`,
    )
      .then(({ elements }) => new Map(elements.map((e) => [dayOf(e.timeRange.start), e.totalPageStatistics?.views?.allPageViews?.pageViews ?? 0])))
      .catch(() => null),
    api<{ elements: { timeRange: { start: number }; followerGains?: { organicFollowerGain?: number; paidFollowerGain?: number } }[] }>(
      `organizationalEntityFollowerStatistics?${query}`,
    )
      .then(
        ({ elements }) =>
          new Map(
            elements.map((e) => [
              dayOf(e.timeRange.start),
              { organic: e.followerGains?.organicFollowerGain ?? 0, paid: e.followerGains?.paidFollowerGain ?? 0 },
            ]),
          ),
      )
      .catch(() => null),
  ]);
  return { posts: shares, pageViews: views, followers: follows };
}

/** Adds up the daily numbers. */
async function totals(org: string, from: string, to: string) {
  const d = await daily(org, from, to);
  const out = zeroTotals();
  const available: Available = { posts: !!d.posts, pageViews: !!d.pageViews, followers: !!d.followers };
  for (const s of d.posts?.values() ?? []) {
    out.impressions += s.impressionCount ?? 0;
    out.uniqueImpressions += s.uniqueImpressionsCount ?? 0;
    out.clicks += s.clickCount ?? 0;
    out.reactions += s.likeCount ?? 0;
    out.comments += s.commentCount ?? 0;
    out.reposts += s.shareCount ?? 0;
  }
  for (const v of d.pageViews?.values() ?? []) out.pageViews += v;
  for (const g of d.followers?.values() ?? []) {
    out.organicFollowers += g.organic;
    out.paidFollowers += g.paid;
  }
  return { totals: out, available, daily: d };
}

// ─── Followers ─────────────────────────────────────────────────────────

export type Slice = { label: string; value: number };

/** LinkedIn's standard job seniorities and functions, by id. */
const SENIORITIES: Record<string, string> = {
  1: "Unpaid",
  2: "Training",
  3: "Entry",
  4: "Senior",
  5: "Manager",
  6: "Director",
  7: "VP",
  8: "CXO",
  9: "Partner",
  10: "Owner",
};
const FUNCTIONS: Record<string, string> = {
  1: "Accounting",
  2: "Administrative",
  3: "Arts and Design",
  4: "Business Development",
  5: "Community and Social Services",
  6: "Consulting",
  7: "Education",
  8: "Engineering",
  9: "Entrepreneurship",
  10: "Finance",
  11: "Healthcare Services",
  12: "Human Resources",
  13: "Information Technology",
  14: "Legal",
  15: "Marketing",
  16: "Media and Communication",
  17: "Military and Protective Services",
  18: "Operations",
  19: "Product Management",
  20: "Program and Project Management",
  21: "Purchasing",
  22: "Quality Assurance",
  23: "Real Estate",
  24: "Research",
  25: "Sales",
  26: "Customer Success and Support",
};
/** "SIZE_11_TO_50" → "11–50 employees". */
const companySize = (range: string) => {
  const [, low, high] = range.match(/SIZE_(\d+)(?:_TO_(\d+)|_OR_MORE)?/) ?? [];
  if (!low) return range;
  return high ? `${low}–${high} employees` : `${low}+ employees`;
};

type Counts = { followerCounts?: { organicFollowerCount?: number; paidFollowerCount?: number } };
const count = (c: Counts) => (c.followerCounts?.organicFollowerCount ?? 0) + (c.followerCounts?.paidFollowerCount ?? 0);
const top = (rows: Slice[]) => rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 10);

/** Country names for LinkedIn geo URNs; the number itself if LinkedIn won't say. */
async function geoNames(urns: string[]) {
  const ids = urns.map((u) => u.split(":").at(-1)!);
  if (!ids.length) return new Map<string, string>();
  const names = await api<{ results: Record<string, { defaultLocalizedName?: { value?: string } }> }>(`geo?ids=List(${ids.join(",")})`).catch(
    () => ({ results: {} as Record<string, { defaultLocalizedName?: { value?: string } }> }),
  );
  return new Map(ids.map((id) => [id, names.results[id]?.defaultLocalizedName?.value ?? `Location ${id}`]));
}

/** Who follows the page today: country, seniority, job function and company size. */
async function audience(org: string) {
  const { elements } = await api<{
    elements: {
      followerCountsByGeoCountry?: (Counts & { geo: string })[];
      followerCountsBySeniority?: (Counts & { seniority: string })[];
      followerCountsByFunction?: (Counts & { function: string })[];
      followerCountsByStaffCountRange?: (Counts & { staffCountRange: string })[];
    }[];
  }>(`organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${urn(orgUrn(org))}`);
  const e = elements[0] ?? {};
  const countries = top((e.followerCountsByGeoCountry ?? []).map((r) => ({ label: r.geo, value: count(r) })));
  const names = await geoNames(countries.map((c) => c.label));
  const id = (u: string) => u.split(":").at(-1)!;
  return {
    countries: countries.map((c) => ({ ...c, label: names.get(id(c.label)) ?? c.label })),
    seniorities: top((e.followerCountsBySeniority ?? []).map((r) => ({ label: SENIORITIES[id(r.seniority)] ?? r.seniority, value: count(r) }))),
    functions: top((e.followerCountsByFunction ?? []).map((r) => ({ label: FUNCTIONS[id(r.function)] ?? r.function, value: count(r) }))),
    sizes: top((e.followerCountsByStaffCountRange ?? []).map((r) => ({ label: companySize(r.staffCountRange), value: count(r) }))),
  };
}

// ─── Posts ─────────────────────────────────────────────────────────────

export type Post = {
  /** urn:li:share:… or urn:li:ugcPost:… */
  id: string;
  text: string;
  /** "Text", "Image", "Video", "Article", "Document", "Poll", "Carousel". */
  kind: string;
  permalink: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  impressions: number;
  uniqueImpressions: number;
  clicks: number;
  reactions: number;
  comments: number;
  reposts: number;
  /** Clicks, reactions, comments and reposts. */
  engagements: number;
};

type PostItem = {
  id: string;
  commentary?: string;
  publishedAt?: number;
  createdAt?: number;
  lifecycleState?: string;
  content?: {
    media?: { id: string };
    article?: { title?: string; thumbnail?: string };
    multiImage?: { images: { id: string }[] };
    poll?: unknown;
    carousel?: unknown;
  };
};

function kind(p: PostItem) {
  const c = p.content;
  if (!c) return "Text";
  if (c.poll) return "Poll";
  if (c.carousel) return "Carousel";
  if (c.article) return "Article";
  if (c.multiImage) return "Image";
  const media = c.media?.id ?? "";
  if (media.includes(":video:")) return "Video";
  if (media.includes(":document:")) return "Document";
  return media ? "Image" : "Text";
}

const thumbnailOf = (p: PostItem) => p.content?.multiImage?.images[0]?.id ?? p.content?.article?.thumbnail ?? p.content?.media?.id;

/** Download links for image URNs (videos and documents give no picture here). */
async function imageUrls(urns: string[]) {
  const images = urns.filter((u) => u.includes(":image:"));
  if (!images.length) return new Map<string, string>();
  const { results } = await api<{ results: Record<string, { downloadUrl?: string }> }>(`images?ids=List(${images.map(urn).join(",")})`).catch(
    () => ({ results: {} as Record<string, { downloadUrl?: string }> }),
  );
  return new Map(Object.entries(results).flatMap(([k, v]) => (v.downloadUrl ? [[k, v.downloadUrl] as const] : [])));
}

/** Lifetime numbers for each post, by post URN. */
async function postStats(org: string, ids: string[]) {
  const shares = ids.filter((id) => id.includes(":share:"));
  const ugc = ids.filter((id) => id.includes(":ugcPost:"));
  const params = [shares.length && `shares=List(${shares.map(urn).join(",")})`, ugc.length && `ugcPosts=List(${ugc.map(urn).join(",")})`]
    .filter(Boolean)
    .join("&");
  if (!params) return new Map<string, ShareStats>();
  const { elements } = await api<{ elements: { share?: string; ugcPost?: string; totalShareStatistics: ShareStats }[] }>(
    `organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${urn(orgUrn(org))}&${params}`,
  );
  return new Map(elements.map((e) => [(e.share ?? e.ugcPost)!, e.totalShareStatistics]));
}

/** The latest published posts, newest first, with their lifetime numbers. */
export async function getPosts(org: string, count = 30): Promise<Post[]> {
  const { elements } = await api<{ elements: PostItem[] }>(`posts?author=${urn(orgUrn(org))}&q=author&count=${count}&sortBy=LAST_MODIFIED`, {
    "X-RestLi-Method": "FINDER",
  });
  const posts = elements
    .filter((p) => (p.lifecycleState ?? "PUBLISHED") === "PUBLISHED")
    .sort((a, b) => (b.publishedAt ?? b.createdAt ?? 0) - (a.publishedAt ?? a.createdAt ?? 0));
  const [stats, pictures] = await Promise.all([
    postStats(
      org,
      posts.map((p) => p.id),
    ).catch(() => new Map<string, ShareStats>()),
    imageUrls(posts.map(thumbnailOf).filter((u): u is string => !!u)),
  ]);
  return posts.map((p) => {
    const s = stats.get(p.id) ?? {};
    const clicks = s.clickCount ?? 0;
    const reactions = s.likeCount ?? 0;
    const comments = s.commentCount ?? 0;
    const reposts = s.shareCount ?? 0;
    const thumb = thumbnailOf(p);
    return {
      id: p.id,
      text: p.commentary?.trim() || p.content?.article?.title || "",
      kind: kind(p),
      permalink: `https://www.linkedin.com/feed/update/${p.id}`,
      thumbnailUrl: thumb ? (pictures.get(thumb) ?? null) : null,
      publishedAt: new Date(p.publishedAt ?? p.createdAt ?? 0).toISOString(),
      impressions: s.impressionCount ?? 0,
      uniqueImpressions: s.uniqueImpressionsCount ?? 0,
      clicks,
      reactions,
      comments,
      reposts,
      engagements: clicks + reactions + comments + reposts,
    };
  });
}

export type Comment = { id: string; text: string; byPage: boolean; publishedAt: string; likes: number; post: Post };

/**
 * Newest comments on the latest posts that have any. LinkedIn doesn't give commenters' names to page
 * apps, so only whether the page itself replied. Null when LinkedIn didn't allow reading comments.
 */
export async function getRecentComments(org: string, posts: Post[], postCount = 6): Promise<Comment[] | null> {
  const withComments = posts.filter((p) => p.comments > 0).slice(0, postCount);
  try {
    const lists = await mapLimit(withComments, 4, async (post) => {
      const { elements } = await api<{
        elements: { id?: string; $URN?: string; actor: string; message?: { text?: string }; created?: { time: number }; likesSummary?: { totalLikes?: number } }[];
      }>(`socialActions/${urn(post.id)}/comments?count=5`);
      return elements.map((c, i) => ({
        id: c.$URN ?? c.id ?? `${post.id}-${i}`,
        text: c.message?.text ?? "",
        byPage: c.actor === orgUrn(org),
        publishedAt: new Date(c.created?.time ?? 0).toISOString(),
        likes: c.likesSummary?.totalLikes ?? 0,
        post,
      }));
    });
    return lists.flat().sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  } catch (e) {
    if (e instanceof LinkedInError && e.status === 403) return null;
    throw e;
  }
}

// ─── Report ────────────────────────────────────────────────────────────

export type LinkedInReport = {
  totals: Totals;
  prev: Totals;
  available: Available;
  daily: DayPoint[];
  audience: Awaited<ReturnType<typeof audience>>;
  posts: Post[];
  comments: Comment[] | null;
};

/** Everything the LinkedIn page shows for one date range. Optional parts fall back to empty instead of failing the page. */
export async function getLinkedInReport(
  range: { from: string; to: string; prevFrom: string; prevTo: string },
  days: string[],
  followersNow: number,
): Promise<LinkedInReport> {
  const org = await organizationId();
  const today = isoDay(new Date());
  const [current, prev, sinceRange, people, posts] = await Promise.all([
    totals(org, range.from, range.to),
    totals(org, range.prevFrom, range.prevTo),
    // Gains after the range, to work back from today's follower total.
    range.to < today ? daily(org, isoDay(new Date(Date.parse(`${range.to}T00:00:00Z`) + DAY)), today).then((d) => d.followers) : null,
    audience(org).catch(() => ({ countries: [], seniorities: [], functions: [], sizes: [] })),
    getPosts(org),
  ]);
  const comments = await getRecentComments(org, posts).catch(() => null);

  const { posts: shares, pageViews, followers } = current.daily;
  // Followers at the end of each day = today's total minus every gain after that day.
  const gain = (g: Gain | undefined) => (g ? g.organic + g.paid : 0);
  let running = followersNow - [...(sinceRange?.values() ?? [])].reduce((s, g) => s + gain(g), 0);
  const byDay = new Map<string, number>();
  for (const date of [...days].reverse()) {
    byDay.set(date, running);
    running -= gain(followers?.get(date));
  }

  return {
    totals: current.totals,
    prev: prev.totals,
    available: current.available,
    daily: days.map((date) => {
      const s = shares?.get(date) ?? {};
      return {
        date,
        impressions: s.impressionCount ?? 0,
        clicks: s.clickCount ?? 0,
        engagements: (s.clickCount ?? 0) + (s.likeCount ?? 0) + (s.commentCount ?? 0) + (s.shareCount ?? 0),
        pageViews: pageViews?.get(date) ?? 0,
        newFollowers: followers?.has(date) ? gain(followers.get(date)) : null,
        followers: followers && followersNow ? (byDay.get(date) ?? null) : null,
      };
    }),
    audience: people,
    posts,
    comments,
  };
}
