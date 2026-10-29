import { connection } from "next/server";
import {
  EyeIcon,
  FileTextIcon,
  UserMinusIcon,
  MessageCircleIcon,
  MousePointerClickIcon,
  PercentIcon,
  SparklesIcon,
  ThumbsUpIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { StatCard } from "@/components/analytics/stat-card";
import { FollowersChart, ReachChart } from "@/components/instagram/instagram-charts";
import { PageHeader } from "@/components/page-header";
import { StoreRangeFilter } from "@/components/stores/store-range-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { percentChange } from "@/lib/analytics";
import { formatCompact, formatNumber, timeAgo } from "@/lib/format";
import { routes } from "@/lib/routes";
import { disconnectFacebook } from "@/lib/social/actions";
import {
  facebookMissingEnv,
  getConnection,
  getFacebookReport,
  getPage,
  usesEnvToken,
  type Available,
  type FacebookReport,
  type Page,
  type Post,
  type Totals,
} from "@/lib/social/facebook";
import { imageUrl } from "@/lib/social/instagram";
import { parseStoreRange, rangeDays } from "@/lib/stores/range";
import { errorMessage } from "@/lib/stores/shared";

const TITLE = "Facebook";
const DESCRIPTION = "Our Page's followers, reach, engagement and posts from Facebook Page insights.";

const shortDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Interactions per account reached, as a percentage with one decimal. */
const rate = (interactions: number, reach: number) => (reach ? Math.round((interactions / reach) * 1000) / 10 : null);
const formatRate = (r: number | null) => (r === null ? "—" : `${r}%`);

export function FacebookDashboardSkeleton() {
  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-9 rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </>
  );
}

export async function FacebookDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const signInError = typeof params.error === "string" ? params.error : null;

  const missing = facebookMissingEnv();
  if (missing.length) return <SetupNeeded missing={missing} />;

  const saved = await getConnection();
  if (!saved && !usesEnvToken()) return <ConnectCard error={signInError} />;

  const range = parseStoreRange(params);
  let page: Page;
  let data: FacebookReport;
  try {
    [page, data] = await Promise.all([getPage(), getFacebookReport(range, rangeDays(range))]);
  } catch (e) {
    return <ConnectCard error={errorMessage(e)} reconnect name={saved?.name} />;
  }

  const { totals, prev, available } = data;
  const engagement = rate(totals.engagements, totals.reach);
  const prevEngagement = rate(prev.engagements, prev.reach);
  const netFollows = totals.follows - totals.unfollows;
  const picture = imageUrl(page.pictureUrl);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {picture && (
              // Served through our image route (see imageUrl); not worth routing through next/image.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={picture} alt="" className="size-9 rounded-full" />
            )}
            {page.name}
          </span>
        }
        description={
          <>
            <a href={page.link} target="_blank" rel="noreferrer" className="hover:underline">
              {page.username ? `@${page.username}` : "Facebook Page"}
            </a>
            {page.category && ` · ${page.category}`}
            {" · "}
            {saved ? `Connected ${timeAgo(saved.connectedAt)}` : "Using FACEBOOK_PAGE_TOKEN"}
          </>
        }
      >
        <Button variant="outline" nativeButton={false} render={<a href={page.link} target="_blank" rel="noreferrer" />}>
          Open Facebook
        </Button>
        {saved && (
          <form action={disconnectFacebook}>
            <Button type="submit" variant="ghost" className="text-muted-foreground">
              Disconnect
            </Button>
          </form>
        )}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<UsersIcon />} accent="ios" label="Followers" value={formatNumber(page.followers)} hint="Right now" />
        <StatCard icon={<ThumbsUpIcon />} accent="android" label="Page likes" value={formatNumber(page.likes)} hint="Right now" />
        <StatCard
          icon={<MessageCircleIcon />}
          accent="others"
          label="Talking about this"
          value={formatNumber(page.talkingAbout)}
          hint="People who interacted in the last 7 days"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {shortDate(range.from)} – {shortDate(range.to)}
          <span className="ml-2 text-sm font-normal text-muted-foreground">{range.days} days</span>
        </h2>
        <StoreRangeFilter range={range} basePath={routes.facebook} />
      </div>

      <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        Facebook insights arrive about a day late. Accounts reached is added up per day, so the same person can be
        counted more than once.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric totals={totals} prev={prev} available={available} name="reach" icon={<UsersIcon />} accent="ios" label="Accounts reached" hint="Accounts that saw the Page or its posts, per day" />
        <Metric totals={totals} prev={prev} available={available} name="views" icon={<EyeIcon />} accent="android" label="Views" hint="Times the Page's content was shown" />
        <Metric totals={totals} prev={prev} available={available} name="engagements" icon={<SparklesIcon />} accent="others" label="Post engagements" hint="Reactions, comments, shares and clicks" />
        <StatCard
          icon={<PercentIcon />}
          accent="signups"
          label="Engagement rate"
          value={formatRate(engagement)}
          change={engagement !== null && prevEngagement ? percentChange(engagement, prevEngagement) : undefined}
          hint={`${formatNumber(totals.engagements)} engagements ÷ ${formatNumber(totals.reach)} reached`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric totals={totals} prev={prev} available={available} name="pageViews" icon={<FileTextIcon />} label="Page visits" hint="Times the Page itself was opened" />
        <Metric totals={totals} prev={prev} available={available} name="follows" icon={<UserPlusIcon />} label="New follows" />
        <Metric totals={totals} prev={prev} available={available} name="unfollows" icon={<UserMinusIcon />} label="Unfollows" />
        {available.follows || available.unfollows ? (
          <StatCard
            icon={<UserPlusIcon />}
            label="Followers (net)"
            value={`${netFollows > 0 ? "+" : ""}${formatNumber(netFollows)}`}
            hint={`${formatNumber(totals.follows)} followed · ${formatNumber(totals.unfollows)} unfollowed`}
          />
        ) : (
          <StatCard icon={<UserPlusIcon />} label="Followers (net)" value="—" hint="Not available for this Page yet" />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Reach</CardTitle>
            <CardDescription>Accounts reached per day</CardDescription>
          </CardHeader>
          <CardContent>
            <ReachChart data={data.daily} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>New followers</CardTitle>
            <CardDescription>Per day</CardDescription>
          </CardHeader>
          <CardContent>
            {data.daily.some((d) => d.newFollowers) ? (
              <FollowersChart data={data.daily} />
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">No new followers in these dates</p>
            )}
          </CardContent>
        </Card>
      </div>

      <TopPostsCard posts={data.posts.filter((p) => p.publishedAt.slice(0, 10) >= range.from && p.publishedAt.slice(0, 10) <= range.to)} />

      <LatestPostsCard posts={data.posts} />
    </div>
  );
}

/** A period metric with its change, or "—" when Facebook doesn't give it for this Page. */
function Metric({
  totals,
  prev,
  available,
  name,
  hint,
  ...props
}: {
  totals: Totals;
  prev: Totals;
  available: Available;
  name: keyof Totals;
  icon: React.ReactNode;
  accent?: "primary" | "android" | "ios" | "others" | "signups";
  label: string;
  hint?: string;
}) {
  return available[name] ? (
    <StatCard {...props} value={formatNumber(totals[name])} change={percentChange(totals[name], prev[name])} hint={hint} />
  ) : (
    <StatCard {...props} value="—" hint="Not available for this Page yet" />
  );
}

function PostCell({ post }: { post: Post }) {
  return (
    <a href={post.permalink} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-3 hover:underline">
      {post.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.thumbnailUrl} alt="" className="size-12 shrink-0 rounded-md object-cover" />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <FileTextIcon className="size-4" />
        </span>
      )}
      <span className="line-clamp-2 max-w-72 text-sm whitespace-normal" title={post.message}>
        {post.message || <span className="text-muted-foreground">No text</span>}
      </span>
    </a>
  );
}

function PostsTable({ posts, showDate }: { posts: Post[]; showDate?: boolean }) {
  return (
    <div className="overflow-x-auto border-t">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-6">Post</TableHead>
            <TableHead>Type</TableHead>
            {showDate && <TableHead>Published</TableHead>}
            <TableHead className="text-right">Reach</TableHead>
            <TableHead className="text-right">Views</TableHead>
            <TableHead className="text-right">Reactions</TableHead>
            <TableHead className="text-right">Comments</TableHead>
            <TableHead className="text-right">Shares</TableHead>
            <TableHead className="text-right">
              <MousePointerClickIcon className="inline size-3.5" /> Clicks
            </TableHead>
            <TableHead className="pr-6 text-right">Engagement</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="pl-6">
                <PostCell post={p} />
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{p.kind}</Badge>
              </TableCell>
              {showDate && <TableCell className="text-muted-foreground">{timeAgo(new Date(p.publishedAt))}</TableCell>}
              <TableCell className="text-right tabular-nums" title={formatNumber(p.reach)}>
                {p.reach ? formatCompact(p.reach) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums" title={formatNumber(p.views)}>
                {p.views ? formatCompact(p.views) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(p.reactions)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(p.comments)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(p.shares)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(p.clicks)}</TableCell>
              <TableCell className="pr-6 text-right tabular-nums" title="Reactions, comments and shares ÷ accounts reached">
                {formatRate(rate(p.interactions, p.reach))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Posts published in the selected dates, best first, with averages. */
function TopPostsCard({ posts }: { posts: Post[] }) {
  const sorted = [...posts].sort((a, b) => b.interactions - a.interactions);
  const avg = (pick: (p: Post) => number) => (posts.length ? Math.round(posts.reduce((s, p) => s + pick(p), 0) / posts.length) : 0);
  const reach = posts.reduce((s, p) => s + p.reach, 0);
  const interactions = posts.reduce((s, p) => s + p.interactions, 0);
  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>Posts in these dates</CardTitle>
        <CardDescription>
          {posts.length
            ? `${posts.length} post${posts.length === 1 ? "" : "s"} · avg ${formatNumber(avg((p) => p.reactions))} reactions, ${formatNumber(avg((p) => p.comments))} comments, ${formatNumber(avg((p) => p.reach))} reached · engagement ${formatRate(rate(interactions, reach))}`
            : "Most interactions first, lifetime numbers"}
        </CardDescription>
      </CardHeader>
      {sorted.length ? (
        <PostsTable posts={sorted.slice(0, 10)} />
      ) : (
        <p className="px-6 pb-8 text-center text-sm text-muted-foreground">No posts in these dates (among the latest 25)</p>
      )}
    </Card>
  );
}

function LatestPostsCard({ posts }: { posts: Post[] }) {
  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>Latest posts</CardTitle>
        <CardDescription>Lifetime numbers for each post · engagement = reactions, comments and shares ÷ accounts reached</CardDescription>
        <CardAction>
          <Badge variant="secondary">{posts.length}</Badge>
        </CardAction>
      </CardHeader>
      {posts.length ? (
        <PostsTable posts={posts} showDate />
      ) : (
        <p className="px-6 pb-8 text-center text-sm text-muted-foreground">No posts yet</p>
      )}
    </Card>
  );
}

function ConnectCard({ error, reconnect, name }: { error: string | null; reconnect?: boolean; name?: string }) {
  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <Card>
        <CardHeader>
          <CardTitle>{reconnect ? `Reconnect ${name ?? "Facebook"}` : "Connect your Facebook Page"}</CardTitle>
          <CardDescription>
            Sign in with a Facebook account that manages the Page, and tick the Page on Facebook&apos;s screen. We only
            read the Page, its posts and insights, and it&apos;s free.
          </CardDescription>
          <CardAction>
            <Badge variant="outline">{reconnect ? "Needs attention" : "Not connected"}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm break-words text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {/* A plain link: the route redirects to Facebook, which a client-side navigation can't follow. */}
            <Button nativeButton={false} render={<a href={`${routes.facebook}/connect`} />}>
              {reconnect ? "Connect again" : "Connect Facebook"}
            </Button>
            {reconnect && (
              <form action={disconnectFacebook}>
                <Button type="submit" variant="ghost" className="text-muted-foreground">
                  Disconnect
                </Button>
              </form>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function SetupNeeded({ missing }: { missing: string[] }) {
  const steps = [
    "Open developers.facebook.com → My Apps → your app (or Create app), then App settings → Basic and copy the App ID and App secret.",
    "Under Use cases, add “Manage everything on your Page” and make sure pages_show_list, pages_read_engagement and read_insights are in it.",
    "Under Facebook Login → Settings, add the redirect URI https://<your domain>/dridha/social/facebook/callback (localhost works without it).",
    "While the app is in Development, the person who connects needs a role on the app (App roles → Roles) and has to manage the Page.",
    "Optional: if that person manages several Pages, set FACEBOOK_PAGE_ID to the one to show.",
    "Or skip the above: paste a Page access token (Graph API Explorer → Get Page Access Token) into FACEBOOK_PAGE_TOKEN.",
  ];
  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <Card>
        <CardHeader>
          <CardTitle>Set up Facebook</CardTitle>
          <CardDescription>A few settings are still empty.</CardDescription>
          <CardAction>
            <Badge variant="outline">Not connected</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="text-muted-foreground">Then fill these in .env (and in Vercel) and restart the server:</p>
          <ul className="flex flex-wrap gap-1.5">
            {missing.map((name) => (
              <li key={name}>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{name}</code>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
