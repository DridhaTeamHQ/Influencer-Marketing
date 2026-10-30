import { Suspense } from "react";
import { connection } from "next/server";
import {
  BookmarkIcon,
  EyeIcon,
  HeartIcon,
  ImageIcon,
  LinkIcon,
  MessageCircleIcon,
  PercentIcon,
  ReplyIcon,
  SendIcon,
  SparklesIcon,
  UserCheckIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { StatCard } from "@/components/analytics/stat-card";
import { FollowersChart, ReachChart } from "@/components/instagram/instagram-charts";
import { PageHeader } from "@/components/page-header";
import { StoreRangeFilter } from "@/components/stores/store-range-filter";
import { AudienceChart } from "@/components/youtube/youtube-charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiTrending, AiTrendingSkeleton } from "@/components/social/ai-trending";
import { percentChange } from "@/lib/analytics";
import { formatCompact, formatNumber, timeAgo } from "@/lib/format";
import { routes } from "@/lib/routes";
import { disconnectInstagram } from "@/lib/social/actions";
import {
  getConnection,
  getInstagramReport,
  getProfile,
  imageUrl,
  instagramMissingEnv,
  type Available,
  type Comment,
  type InstagramReport,
  type Post,
  type Profile,
  type Slice,
  type Totals,
} from "@/lib/social/instagram";
import { parseStoreRange, rangeDays } from "@/lib/stores/range";
import { errorMessage } from "@/lib/stores/shared";

const TITLE = "Instagram";
const DESCRIPTION = "Our account's followers, reach, engagement, posts and comments from Instagram insights.";

const shortDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Interactions per account reached, as a percentage with one decimal. */
const rate = (interactions: number, reach: number) => (reach ? Math.round((interactions / reach) * 1000) / 10 : null);
const formatRate = (r: number | null) => (r === null ? "—" : `${r}%`);

export function InstagramDashboardSkeleton() {
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

export async function InstagramDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const signInError = typeof params.error === "string" ? params.error : null;

  const missing = instagramMissingEnv();
  if (missing.length) return <SetupNeeded missing={missing} />;

  const saved = await getConnection();
  if (!saved) return <ConnectCard error={signInError} />;

  const range = parseStoreRange(params);
  let profile: Profile;
  let data: InstagramReport;
  try {
    [profile, data] = await Promise.all([getProfile(), getInstagramReport(range, rangeDays(range))]);
  } catch (e) {
    return <ConnectCard error={errorMessage(e)} reconnect name={saved.name} />;
  }

  const { totals, prev, available } = data;
  const engagement = rate(totals.total_interactions, totals.reach);
  const prevEngagement = rate(prev.total_interactions, prev.reach);
  const netFollows = totals.follows - totals.unfollows;
  const picture = imageUrl(profile.pictureUrl);

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
            {profile.name || profile.username}
          </span>
        }
        description={
          <>
            <a href={`https://www.instagram.com/${profile.username}`} target="_blank" rel="noreferrer" className="hover:underline">
              @{profile.username}
            </a>
            {" · "}Connected {timeAgo(saved.connectedAt)}
          </>
        }
      >
        <Button
          variant="outline"
          nativeButton={false}
          render={<a href={`https://www.instagram.com/${profile.username}`} target="_blank" rel="noreferrer" />}
        >
          Open Instagram
        </Button>
        <form action={disconnectInstagram}>
          <Button type="submit" variant="ghost" className="text-muted-foreground">
            Disconnect
          </Button>
        </form>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<UsersIcon />} accent="ios" label="Followers" value={formatNumber(profile.followers)} hint="Right now" />
        <StatCard icon={<UserCheckIcon />} accent="android" label="Following" value={formatNumber(profile.following)} hint="Right now" />
        <StatCard icon={<ImageIcon />} accent="others" label="Posts" value={formatNumber(profile.posts)} hint="All time" />
        <Suspense fallback={<AiTrendingSkeleton />}>
          <AiTrending platform="instagram" />
        </Suspense>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {shortDate(range.from)} – {shortDate(range.to)}
          <span className="ml-2 text-sm font-normal text-muted-foreground">{range.days} days</span>
        </h2>
        <StoreRangeFilter range={range} basePath={routes.instagram} />
      </div>

      <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        Instagram insights arrive about a day late, and some (followers per day, audience) only show once the account
        has 100 followers.
        {range.days > 30 &&
          " Instagram gives at most 30 days per request, so reach and accounts engaged are added up per 30 days and the same person can be counted more than once."}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric totals={totals} prev={prev} available={available} name="reach" icon={<UsersIcon />} accent="ios" label="Accounts reached" hint="Unique accounts that saw your content" />
        <Metric totals={totals} prev={prev} available={available} name="views" icon={<EyeIcon />} accent="android" label="Views" hint="Times your content was played or shown" />
        <Metric totals={totals} prev={prev} available={available} name="accounts_engaged" icon={<SparklesIcon />} accent="others" label="Accounts engaged" hint="Accounts that liked, commented, shared, saved or replied" />
        <StatCard
          icon={<PercentIcon />}
          accent="signups"
          label="Engagement rate"
          value={formatRate(engagement)}
          change={engagement !== null && prevEngagement ? percentChange(engagement, prevEngagement) : undefined}
          hint={`${formatNumber(totals.total_interactions)} interactions ÷ ${formatNumber(totals.reach)} reached`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric totals={totals} prev={prev} available={available} name="likes" icon={<HeartIcon />} label="Likes" />
        <Metric totals={totals} prev={prev} available={available} name="comments" icon={<MessageCircleIcon />} label="Comments" />
        <Metric totals={totals} prev={prev} available={available} name="shares" icon={<SendIcon />} label="Shares" />
        <Metric totals={totals} prev={prev} available={available} name="saves" icon={<BookmarkIcon />} label="Saves" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric totals={totals} prev={prev} available={available} name="total_interactions" icon={<SparklesIcon />} label="Total interactions" hint="Likes, comments, shares, saves and replies" />
        <Metric totals={totals} prev={prev} available={available} name="replies" icon={<ReplyIcon />} label="Story replies" />
        <Metric totals={totals} prev={prev} available={available} name="profile_links_taps" icon={<LinkIcon />} label="Profile link taps" hint="Taps on links, email, call and address in the profile" />
        {available.follows || available.unfollows ? (
          <StatCard
            icon={<UserPlusIcon />}
            label="Followers (net)"
            value={`${netFollows > 0 ? "+" : ""}${formatNumber(netFollows)}`}
            hint={`${formatNumber(totals.follows)} followed · ${formatNumber(totals.unfollows)} unfollowed`}
          />
        ) : (
          <StatCard icon={<UserPlusIcon />} label="Followers (net)" value="—" hint="Shows from 100 followers on" />
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
            <CardDescription>
              Per day from {shortDate(data.followersFrom)} · Instagram only keeps the last 30 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.daily.some((d) => d.newFollowers) ? (
              <FollowersChart data={data.daily} />
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">No follower numbers for these dates</p>
            )}
          </CardContent>
        </Card>
      </div>

      <AudienceCard audience={data.audience} />

      <TopPostsCard posts={data.posts.filter((p) => p.publishedAt.slice(0, 10) >= range.from && p.publishedAt.slice(0, 10) <= range.to)} />

      <LatestPostsCard posts={data.posts} />

      <CommentsCard comments={data.comments} />
    </div>
  );
}

/** A period metric with its change, or "—" when Instagram doesn't give it for this account. */
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
    <StatCard {...props} value="—" hint="Not available for this account yet" />
  );
}

function AudienceCard({ audience }: { audience: InstagramReport["audience"] }) {
  const tabs: { key: string; title: string; rows: Slice[] }[] = [
    { key: "country", title: "Countries", rows: audience.countries },
    { key: "city", title: "Cities", rows: audience.cities },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Followers by age and gender</CardTitle>
          <CardDescription>Share of followers</CardDescription>
        </CardHeader>
        <CardContent>
          {audience.ages.length ? (
            <AudienceChart data={audience.ages} />
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">Instagram shows this from 100 followers on</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <Tabs defaultValue="country" className="gap-0">
          <CardHeader>
            <CardTitle>Where followers are</CardTitle>
            <CardDescription>Top 10</CardDescription>
          </CardHeader>
          <div className="overflow-x-auto px-6 pt-4 pb-4">
            <TabsList>
              {tabs.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.title}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {tabs.map((t) => (
            <TabsContent key={t.key} value={t.key} className="px-6">
              <BreakdownList
                items={t.rows.map((r) => ({ label: r.label, clicks: r.value }))}
                emptyLabel="Instagram shows this from 100 followers on"
              />
            </TabsContent>
          ))}
        </Tabs>
      </Card>
    </div>
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
          <ImageIcon className="size-4" />
        </span>
      )}
      <span className="line-clamp-2 max-w-72 text-sm whitespace-normal" title={post.caption}>
        {post.caption || <span className="text-muted-foreground">No caption</span>}
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
            <TableHead className="text-right">Likes</TableHead>
            <TableHead className="text-right">Comments</TableHead>
            <TableHead className="text-right">Shares</TableHead>
            <TableHead className="text-right">Saves</TableHead>
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
                {formatCompact(p.reach)}
              </TableCell>
              <TableCell className="text-right tabular-nums" title={formatNumber(p.views)}>
                {p.views ? formatCompact(p.views) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(p.likes)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(p.comments)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(p.shares)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(p.saves)}</TableCell>
              <TableCell className="pr-6 text-right tabular-nums" title="Interactions ÷ accounts reached">
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
            ? `${posts.length} post${posts.length === 1 ? "" : "s"} · avg ${formatNumber(avg((p) => p.likes))} likes, ${formatNumber(avg((p) => p.comments))} comments, ${formatNumber(avg((p) => p.reach))} reached · engagement ${formatRate(rate(interactions, reach))}`
            : "Most interactions first, lifetime numbers"}
        </CardDescription>
      </CardHeader>
      {sorted.length ? (
        <PostsTable posts={sorted.slice(0, 10)} />
      ) : (
        <p className="px-6 pb-8 text-center text-sm text-muted-foreground">No posts in these dates (among the latest 30)</p>
      )}
    </Card>
  );
}

function LatestPostsCard({ posts }: { posts: Post[] }) {
  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>Latest posts</CardTitle>
        <CardDescription>Lifetime numbers for each post · engagement = interactions ÷ accounts reached</CardDescription>
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

function CommentsCard({ comments }: { comments: Comment[] | null }) {
  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>Latest comments</CardTitle>
        <CardDescription>Newest comments on the latest posts</CardDescription>
      </CardHeader>
      {comments === null ? (
        <p className="px-6 pb-8 text-sm text-muted-foreground">
          Instagram didn&apos;t allow reading comments. Connect again and allow comments on Instagram&apos;s screen.
        </p>
      ) : comments.length === 0 ? (
        <p className="px-6 pb-8 text-center text-sm text-muted-foreground">No comments yet</p>
      ) : (
        <ul className="max-h-[32rem] divide-y overflow-y-auto border-t">
          {comments.slice(0, 30).map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-6 py-3">
              {c.post.thumbnailUrl && (
                <a href={c.post.permalink} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.post.thumbnailUrl} alt="" className="size-10 rounded-md object-cover" />
                </a>
              )}
              <div className="min-w-0 space-y-0.5 text-sm">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.username ? `@${c.username}` : "Someone"}</span>
                  {" · "}
                  {timeAgo(new Date(c.publishedAt))}
                  {c.likes > 0 && ` · ${formatNumber(c.likes)} like${c.likes === 1 ? "" : "s"}`}
                </p>
                <p className="break-words">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
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
          <CardTitle>{reconnect ? `Reconnect ${name ? `@${name}` : "Instagram"}` : "Connect your Instagram account"}</CardTitle>
          <CardDescription>
            Sign in with the Instagram account (Business or Creator). We only read profile, insights and comments, and
            it&apos;s free.
          </CardDescription>
          <CardAction>
            <Badge variant="outline">{reconnect ? "Needs attention" : "Not connected"}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm break-words text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {/* A plain link: the route redirects to Instagram, which a client-side navigation can't follow. */}
            <Button nativeButton={false} render={<a href={`${routes.instagram}/connect`} />}>
              {reconnect ? "Connect again" : "Connect Instagram"}
            </Button>
            {reconnect && (
              <form action={disconnectInstagram}>
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
    "In the Instagram app, switch the account to a professional account (Business or Creator). It's free.",
    "Open developers.facebook.com → My Apps → Create app, and pick the use case “Manage messaging & content on Instagram”.",
    "In the use case, open “API setup with Instagram login” and copy the Instagram app ID and Instagram app secret.",
    "Under Business login settings, add the redirect URI https://<your domain>/dridha/social/instagram/callback (Meta only accepts https).",
    "While the app is in Development: App roles → Roles → add the account as an Instagram tester, then accept the invite in Instagram → Settings → Apps and websites.",
  ];
  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <Card>
        <CardHeader>
          <CardTitle>Set up Instagram</CardTitle>
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
