import { connection } from "next/server";
import {
  EyeIcon,
  FileTextIcon,
  MegaphoneIcon,
  MessageCircleIcon,
  MousePointerClickIcon,
  PercentIcon,
  Repeat2Icon,
  ThumbsUpIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { StatCard } from "@/components/analytics/stat-card";
import { ActivityChart, FollowerGrowthChart, NewFollowersChart } from "@/components/linkedin/linkedin-charts";
import { PageHeader } from "@/components/page-header";
import { StoreRangeFilter } from "@/components/stores/store-range-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { percentChange } from "@/lib/analytics";
import { formatCompact, formatNumber, timeAgo } from "@/lib/format";
import { routes } from "@/lib/routes";
import { disconnectLinkedin } from "@/lib/social/actions";
import {
  getConnection,
  getLinkedInPage,
  getLinkedInReport,
  linkedinMissingEnv,
  type Comment,
  type LinkedInReport,
  type Page,
  type Post,
  type Slice,
  type Totals,
} from "@/lib/social/linkedin";
import { parseStoreRange, rangeDays } from "@/lib/stores/range";
import { errorMessage } from "@/lib/stores/shared";

const TITLE = "LinkedIn";
const DESCRIPTION = "Our company page's followers, growth, post impressions, engagement and comments from LinkedIn.";

const shortDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Engagements (clicks, reactions, comments, reposts) per impression, as LinkedIn counts it, with one decimal. */
const rate = (engagements: number, impressions: number) => (impressions ? Math.round((engagements / impressions) * 1000) / 10 : null);
const formatRate = (r: number | null) => (r === null ? "—" : `${r}%`);
const engagementsOf = (t: Totals) => t.clicks + t.reactions + t.comments + t.reposts;
const signed = (n: number) => `${n > 0 ? "+" : ""}${formatNumber(n)}`;

export function LinkedInDashboardSkeleton() {
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

export async function LinkedInDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const signInError = typeof params.error === "string" ? params.error : null;

  const missing = linkedinMissingEnv();
  if (missing.length) return <SetupNeeded missing={missing} />;

  const saved = await getConnection();
  if (!saved) return <ConnectCard error={signInError} />;

  const range = parseStoreRange(params);
  let page: Page;
  let data: LinkedInReport;
  try {
    page = await getLinkedInPage();
    data = await getLinkedInReport(range, rangeDays(range), page.followers);
  } catch (e) {
    return <ConnectCard error={errorMessage(e)} reconnect name={saved.name} />;
  }

  const { totals, prev, available } = data;
  const engagement = rate(engagementsOf(totals), totals.impressions);
  const prevEngagement = rate(engagementsOf(prev), prev.impressions);
  const newFollowers = totals.organicFollowers + totals.paidFollowers;
  const prevNewFollowers = prev.organicFollowers + prev.paidFollowers;
  const startFollowers = data.daily.find((d) => d.followers !== null)?.followers;
  const growth = startFollowers ? Math.round((newFollowers / startFollowers) * 1000) / 10 : null;
  const pageUrl = `https://www.linkedin.com/company/${page.vanityName ?? page.id}`;

  /** A period number with its change, or "—" when LinkedIn didn't give it. */
  const metric = (ok: boolean, now: number, before: number) =>
    ok ? { value: formatNumber(now), change: percentChange(now, before) } : { value: "—", hint: "LinkedIn didn't give this for these dates" };

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {page.logoUrl && (
              // LinkedIn's media host; not worth routing through next/image.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={page.logoUrl} alt="" className="size-9 rounded-md" />
            )}
            {page.name}
          </span>
        }
        description={
          <>
            <a href={pageUrl} target="_blank" rel="noreferrer" className="hover:underline">
              Company page
            </a>
            {" · "}Connected {timeAgo(saved.connectedAt)}
          </>
        }
      >
        <Button variant="outline" nativeButton={false} render={<a href={pageUrl} target="_blank" rel="noreferrer" />}>
          Open LinkedIn
        </Button>
        <form action={disconnectLinkedin}>
          <Button type="submit" variant="ghost" className="text-muted-foreground">
            Disconnect
          </Button>
        </form>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<UsersIcon />} accent="ios" label="Followers" value={formatNumber(page.followers)} hint="Right now" />
        <StatCard
          icon={<UserPlusIcon />}
          accent="android"
          label="Follower growth"
          value={growth === null ? "—" : `${growth > 0 ? "+" : ""}${growth}%`}
          hint={available.followers ? `${signed(newFollowers)} followers in these dates` : "LinkedIn didn't give follower numbers"}
        />
        <StatCard icon={<FileTextIcon />} accent="others" label="Posts" value={formatNumber(data.posts.length)} hint="Latest, up to 30" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {shortDate(range.from)} – {shortDate(range.to)}
          <span className="ml-2 text-sm font-normal text-muted-foreground">{range.days} days</span>
        </h2>
        <StoreRangeFilter range={range} basePath={routes.linkedinPage} />
      </div>

      <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        LinkedIn&apos;s page statistics arrive about 2 days late and only go back 12 months. Members reached is added up
        per day, so the same member can be counted more than once.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<EyeIcon />} accent="ios" label="Impressions" hint="Times posts were shown" {...metric(available.posts, totals.impressions, prev.impressions)} />
        <StatCard icon={<UsersIcon />} accent="android" label="Members reached" hint="Unique members per day who saw a post" {...metric(available.posts, totals.uniqueImpressions, prev.uniqueImpressions)} />
        <StatCard
          icon={<PercentIcon />}
          accent="signups"
          label="Engagement rate"
          value={formatRate(engagement)}
          change={engagement !== null && prevEngagement ? percentChange(engagement, prevEngagement) : undefined}
          hint={`${formatNumber(engagementsOf(totals))} engagements ÷ ${formatNumber(totals.impressions)} impressions`}
        />
        <StatCard icon={<MegaphoneIcon />} accent="others" label="Page views" hint="Visits to the company page" {...metric(available.pageViews, totals.pageViews, prev.pageViews)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<ThumbsUpIcon />} label="Reactions" {...metric(available.posts, totals.reactions, prev.reactions)} />
        <StatCard icon={<MessageCircleIcon />} label="Comments" {...metric(available.posts, totals.comments, prev.comments)} />
        <StatCard icon={<Repeat2Icon />} label="Reposts" {...metric(available.posts, totals.reposts, prev.reposts)} />
        <StatCard icon={<MousePointerClickIcon />} label="Clicks" hint="Clicks on posts, links and the page name" {...metric(available.posts, totals.clicks, prev.clicks)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          icon={<UserPlusIcon />}
          label="New followers"
          {...(available.followers
            ? {
                value: signed(newFollowers),
                change: percentChange(newFollowers, prevNewFollowers),
                hint: `${formatNumber(totals.organicFollowers)} organic · ${formatNumber(totals.paidFollowers)} from ads`,
              }
            : { value: "—", hint: "LinkedIn didn't give this for these dates" })}
        />
        <StatCard
          icon={<FileTextIcon />}
          label="Posts in these dates"
          value={formatNumber(data.posts.filter((p) => inRange(p, range)).length)}
          hint="Among the latest 30"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Follower growth</CardTitle>
            <CardDescription>Followers at the end of each day, worked back from today&apos;s total</CardDescription>
          </CardHeader>
          <CardContent>
            {data.daily.some((d) => d.followers !== null) ? (
              <FollowerGrowthChart data={data.daily} />
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">No follower numbers for these dates</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>New followers</CardTitle>
            <CardDescription>Per day, organic and from ads</CardDescription>
          </CardHeader>
          <CardContent>
            {data.daily.some((d) => d.newFollowers) ? (
              <NewFollowersChart data={data.daily} />
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">No new followers in these dates</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Impressions and engagements</CardTitle>
          <CardDescription>Per day, all of the page&apos;s posts</CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityChart data={data.daily} />
        </CardContent>
      </Card>

      <AudienceCard audience={data.audience} />

      <TopPostsCard posts={data.posts.filter((p) => inRange(p, range))} />

      <LatestPostsCard posts={data.posts} />

      <CommentsCard comments={data.comments} />
    </div>
  );
}

const inRange = (p: Post, range: { from: string; to: string }) => p.publishedAt.slice(0, 10) >= range.from && p.publishedAt.slice(0, 10) <= range.to;

function AudienceCard({ audience }: { audience: LinkedInReport["audience"] }) {
  const tabs: { key: string; title: string; rows: Slice[] }[] = [
    { key: "country", title: "Countries", rows: audience.countries },
    { key: "function", title: "Job functions", rows: audience.functions },
    { key: "seniority", title: "Seniority", rows: audience.seniorities },
    { key: "size", title: "Company size", rows: audience.sizes },
  ];
  return (
    <Card>
      <Tabs defaultValue="country" className="gap-0">
        <CardHeader>
          <CardTitle>Who follows the page</CardTitle>
          <CardDescription>Top 10, all followers today</CardDescription>
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
            <BreakdownList items={t.rows.map((r) => ({ label: r.label, clicks: r.value }))} emptyLabel="LinkedIn didn't give this" />
          </TabsContent>
        ))}
      </Tabs>
    </Card>
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
      <span className="line-clamp-2 max-w-72 text-sm whitespace-normal" title={post.text}>
        {post.text || <span className="text-muted-foreground">No text</span>}
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
            <TableHead className="text-right">Impressions</TableHead>
            <TableHead className="text-right">Reached</TableHead>
            <TableHead className="text-right">Reactions</TableHead>
            <TableHead className="text-right">Comments</TableHead>
            <TableHead className="text-right">Reposts</TableHead>
            <TableHead className="text-right">Clicks</TableHead>
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
              <TableCell className="text-right tabular-nums" title={formatNumber(p.impressions)}>
                {formatCompact(p.impressions)}
              </TableCell>
              <TableCell className="text-right tabular-nums" title={formatNumber(p.uniqueImpressions)}>
                {formatCompact(p.uniqueImpressions)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(p.reactions)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(p.comments)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(p.reposts)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(p.clicks)}</TableCell>
              <TableCell className="pr-6 text-right tabular-nums" title="Engagements ÷ impressions">
                {formatRate(rate(p.engagements, p.impressions))}
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
  const sorted = [...posts].sort((a, b) => b.engagements - a.engagements);
  const avg = (pick: (p: Post) => number) => (posts.length ? Math.round(posts.reduce((s, p) => s + pick(p), 0) / posts.length) : 0);
  const impressions = posts.reduce((s, p) => s + p.impressions, 0);
  const engagements = posts.reduce((s, p) => s + p.engagements, 0);
  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>Posts in these dates</CardTitle>
        <CardDescription>
          {posts.length
            ? `${posts.length} post${posts.length === 1 ? "" : "s"} · avg ${formatNumber(avg((p) => p.impressions))} impressions, ${formatNumber(avg((p) => p.reactions))} reactions, ${formatNumber(avg((p) => p.comments))} comments · engagement ${formatRate(rate(engagements, impressions))}`
            : "Most engagements first, lifetime numbers"}
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
        <CardDescription>Lifetime numbers for each post · engagement = clicks, reactions, comments and reposts ÷ impressions</CardDescription>
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
        <CardDescription>Newest comments on the latest posts · LinkedIn doesn&apos;t share commenters&apos; names with page apps</CardDescription>
      </CardHeader>
      {comments === null ? (
        <p className="px-6 pb-8 text-sm text-muted-foreground">
          LinkedIn didn&apos;t allow reading comments. Check the app has the Community Management API, then connect again.
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
                  <span className="font-medium text-foreground">{c.byPage ? "Our page" : "A member"}</span>
                  {" · "}
                  {timeAgo(new Date(c.publishedAt))}
                  {c.likes > 0 && ` · ${formatNumber(c.likes)} like${c.likes === 1 ? "" : "s"}`}
                  {" · on "}
                  <a href={c.post.permalink} target="_blank" rel="noreferrer" className="hover:underline">
                    {c.post.text ? `“${c.post.text.slice(0, 40)}${c.post.text.length > 40 ? "…" : ""}”` : "a post"}
                  </a>
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
          <CardTitle>{reconnect ? `Reconnect ${name ?? "LinkedIn"}` : "Connect your LinkedIn company page"}</CardTitle>
          <CardDescription>
            Sign in with a LinkedIn member who is an admin of the company page. We only read the page, its statistics,
            posts and comments.
          </CardDescription>
          <CardAction>
            <Badge variant="outline">{reconnect ? "Needs attention" : "Not connected"}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm break-words text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {/* A plain link: the route redirects to LinkedIn, which a client-side navigation can't follow. */}
            <Button nativeButton={false} render={<a href={`${routes.linkedinPage}/connect`} />}>
              {reconnect ? "Connect again" : "Connect LinkedIn"}
            </Button>
            {reconnect && (
              <form action={disconnectLinkedin}>
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
    "Open linkedin.com/developers → Create app. Link it to the company page, then verify the app from the page (a page admin approves it).",
    "Products → request “Community Management API”. It has to be the only product on this app; LinkedIn reviews the request and asks for company details.",
    "Auth → copy the Client ID and Primary Client Secret, and add the redirect URL https://<your domain>/dridha/social/linkedin/callback.",
    "Optional: if the admin manages several pages, set LINKEDIN_ORGANIZATION_ID to the page's number (from its admin URL linkedin.com/company/<number>/admin).",
  ];
  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <Card>
        <CardHeader>
          <CardTitle>Set up LinkedIn</CardTitle>
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
