import { Suspense } from "react";
import { connection } from "next/server";
import {
  ClockIcon,
  EyeIcon,
  HeartIcon,
  MessageCircleIcon,
  PlayIcon,
  Share2Icon,
  TimerIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { StatCard } from "@/components/analytics/stat-card";
import { PageHeader } from "@/components/page-header";
import { StoreRangeFilter } from "@/components/stores/store-range-filter";
import { AudienceChart, SubscribersChart, ViewsChart } from "@/components/youtube/youtube-charts";
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
import { disconnectYoutube } from "@/lib/social/actions";
import {
  getChannel,
  getConnection,
  getRecentVideos,
  getYoutubeReport,
  youtubeMissingEnv,
  type Channel,
  type Slice,
  type TopVideo,
  type Video,
} from "@/lib/social/youtube";
import { parseStoreRange, rangeDays } from "@/lib/stores/range";
import { errorMessage } from "@/lib/stores/shared";

const TITLE = "YouTube";
const DESCRIPTION = "Our channel's views, watch time, subscribers and audience from YouTube Analytics.";

const shortDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** 125 → "2:05", 3725 → "1:02:05". */
function duration(seconds: number) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
}

export function YoutubeDashboardSkeleton() {
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
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </>
  );
}

export async function YoutubeDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const signInError = typeof params.error === "string" ? params.error : null;

  const missing = youtubeMissingEnv();
  if (missing.length) return <SetupNeeded missing={missing} />;

  const saved = await getConnection();
  if (!saved) return <ConnectCard error={signInError} />;

  const range = parseStoreRange(params);
  let channel: Channel | null;
  let data: Awaited<ReturnType<typeof getYoutubeReport>>;
  let recent: Video[];
  try {
    channel = await getChannel();
    [data, recent] = await Promise.all([
      getYoutubeReport(range, rangeDays(range)),
      getRecentVideos(channel?.uploadsPlaylist ?? null),
    ]);
  } catch (e) {
    return <ConnectCard error={errorMessage(e)} reconnect name={saved.name} />;
  }
  if (!channel) return <ConnectCard error="The connected Google account no longer has a YouTube channel." reconnect name={saved.name} />;

  const { totals, prev } = data;
  const watchHours = totals.minutesWatched / 60;
  const netSubs = totals.subscribersGained - totals.subscribersLost;
  const prevNetSubs = prev.subscribersGained - prev.subscribersLost;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {channel.thumbnailUrl && (
              // YouTube's own thumbnail host; not worth routing through next/image. yt3.ggpht.com
              // refuses some requests that carry a Referer, so send none.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={channel.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full" />
            )}
            {channel.title}
          </span>
        }
        description={
          <>
            {channel.handle && (
              <a href={`https://www.youtube.com/${channel.handle}`} target="_blank" rel="noreferrer" className="hover:underline">
                {channel.handle}
              </a>
            )}
            {channel.handle && " · "}Connected {timeAgo(saved.connectedAt)}
          </>
        }
      >
        <Button
          variant="outline"
          nativeButton={false}
          render={<a href={`https://studio.youtube.com/channel/${channel.id}/analytics`} target="_blank" rel="noreferrer" />}
        >
          YouTube Studio
        </Button>
        <form action={disconnectYoutube}>
          <Button type="submit" variant="ghost" className="text-muted-foreground">
            Disconnect
          </Button>
        </form>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<UsersIcon />}
          accent="ios"
          label="Subscribers"
          value={channel.subscribers === null ? "Hidden" : formatNumber(channel.subscribers)}
          hint="Right now"
        />
        <StatCard icon={<EyeIcon />} accent="android" label="Lifetime views" value={formatNumber(channel.views)} hint="All videos, all time" />
        <StatCard icon={<PlayIcon />} accent="others" label="Videos" value={formatNumber(channel.videos)} hint="Public uploads" />
        <Suspense fallback={<AiTrendingSkeleton />}>
          <AiTrending platform="youtube" />
        </Suspense>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {shortDate(range.from)} – {shortDate(range.to)}
          <span className="ml-2 text-sm font-normal text-muted-foreground">{range.days} days</span>
        </h2>
        <StoreRangeFilter range={range} basePath={routes.youtube} />
      </div>

      <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        YouTube Analytics numbers arrive 2–3 days late, so the last few days may still show 0.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<EyeIcon />}
          accent="ios"
          label="Views"
          value={formatNumber(totals.views)}
          change={percentChange(totals.views, prev.views)}
          hint={`${formatNumber(prev.views)} the period before`}
        />
        <StatCard
          icon={<ClockIcon />}
          accent="android"
          label="Watch time (hours)"
          value={formatNumber(Math.round(watchHours))}
          change={percentChange(totals.minutesWatched, prev.minutesWatched)}
          hint={`${formatNumber(Math.round(prev.minutesWatched / 60))} hours the period before`}
        />
        <StatCard
          icon={<TimerIcon />}
          accent="others"
          label="Average view duration"
          value={duration(totals.averageViewDuration)}
          change={percentChange(totals.averageViewDuration, prev.averageViewDuration)}
          hint={`People watch ${Math.round(totals.averageViewPercentage)}% of a video on average`}
        />
        <StatCard
          icon={<UserPlusIcon />}
          accent="signups"
          label="Subscribers (net)"
          value={`${netSubs > 0 ? "+" : ""}${formatNumber(netSubs)}`}
          change={prevNetSubs > 0 ? percentChange(netSubs, prevNetSubs) : undefined}
          hint={`${formatNumber(totals.subscribersGained)} gained · ${formatNumber(totals.subscribersLost)} lost`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={<HeartIcon />}
          label="Likes"
          value={formatNumber(totals.likes)}
          change={percentChange(totals.likes, prev.likes)}
        />
        <StatCard
          icon={<MessageCircleIcon />}
          label="Comments"
          value={formatNumber(totals.comments)}
          change={percentChange(totals.comments, prev.comments)}
        />
        <StatCard
          icon={<Share2Icon />}
          label="Shares"
          value={formatNumber(totals.shares)}
          change={percentChange(totals.shares, prev.shares)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Views and watch time</CardTitle>
          <CardDescription>Per day · watch hours on the right axis</CardDescription>
        </CardHeader>
        <CardContent>
          <ViewsChart data={data.daily} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Subscribers</CardTitle>
            <CardDescription>Gained and lost per day</CardDescription>
          </CardHeader>
          <CardContent>
            <SubscribersChart data={data.daily} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Audience</CardTitle>
            <CardDescription>Share of views by age and gender (signed-in viewers)</CardDescription>
          </CardHeader>
          <CardContent>
            {data.audience.length ? (
              <AudienceChart data={data.audience} />
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">
                YouTube only shows this once enough people have watched
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <SourcesCard traffic={data.traffic} countries={data.countries} devices={data.devices} />

      <TopVideosCard videos={data.topVideos} />

      <RecentVideosCard videos={recent} />
    </div>
  );
}

function SourcesCard({ traffic, countries, devices }: { traffic: Slice[]; countries: Slice[]; devices: Slice[] }) {
  const tabs = [
    { key: "traffic", title: "Traffic source", rows: traffic },
    { key: "country", title: "Countries", rows: countries },
    { key: "device", title: "Devices", rows: devices },
  ];
  return (
    <Card>
      <Tabs defaultValue="traffic" className="gap-0">
        <CardHeader>
          <CardTitle>Where views came from</CardTitle>
          <CardDescription>Views for the selected dates</CardDescription>
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
            <BreakdownList items={t.rows.map((r) => ({ label: r.label, clicks: r.views }))} emptyLabel="No views for these dates" />
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}

function VideoCell({ video }: { video: Video }) {
  return (
    <a
      href={`https://www.youtube.com/watch?v=${video.id}`}
      target="_blank"
      rel="noreferrer"
      className="flex min-w-0 items-center gap-3 hover:underline"
    >
      {video.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.thumbnailUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="aspect-video w-20 shrink-0 rounded-md object-cover"
        />
      )}
      <span className="line-clamp-2 max-w-80 text-sm whitespace-normal" title={video.title}>
        {video.title}
      </span>
    </a>
  );
}

function TopVideosCard({ videos }: { videos: TopVideo[] }) {
  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>Top videos</CardTitle>
        <CardDescription>Most viewed in the selected dates</CardDescription>
      </CardHeader>
      {videos.length === 0 ? (
        <p className="px-6 pb-8 text-center text-sm text-muted-foreground">No views for these dates</p>
      ) : (
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Video</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Watch hours</TableHead>
                <TableHead className="text-right">Avg. watched</TableHead>
                <TableHead className="pr-6 text-right">Length</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {videos.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="pl-6">
                    <VideoCell video={v} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(v.periodViews)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(v.periodWatchHours)}</TableCell>
                  <TableCell className="text-right tabular-nums">{duration(v.averageViewDuration)}</TableCell>
                  <TableCell className="pr-6 text-right tabular-nums text-muted-foreground">{duration(v.duration)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function RecentVideosCard({ videos }: { videos: Video[] }) {
  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>Latest uploads</CardTitle>
        <CardDescription>Lifetime numbers for each video</CardDescription>
        <CardAction>
          <Badge variant="secondary">{videos.length}</Badge>
        </CardAction>
      </CardHeader>
      {videos.length === 0 ? (
        <p className="px-6 pb-8 text-center text-sm text-muted-foreground">No uploads yet</p>
      ) : (
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Video</TableHead>
                <TableHead>Published</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Likes</TableHead>
                <TableHead className="pr-6 text-right">Comments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {videos.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="pl-6">
                    <VideoCell video={v} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{timeAgo(new Date(v.publishedAt))}</TableCell>
                  <TableCell className="text-right tabular-nums" title={formatNumber(v.views)}>
                    {formatCompact(v.views)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(v.likes)}</TableCell>
                  <TableCell className="pr-6 text-right tabular-nums">{formatNumber(v.comments)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
          <CardTitle>{reconnect ? `Reconnect ${name ?? "YouTube"}` : "Connect your YouTube channel"}</CardTitle>
          <CardDescription>
            Sign in with the Google account that owns the channel. We only ask for read-only access, and it&apos;s free.
          </CardDescription>
          <CardAction>
            <Badge variant="outline">{reconnect ? "Needs attention" : "Not connected"}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm break-words text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {/* A plain link: the route redirects to Google, which a client-side navigation can't follow. */}
            <Button nativeButton={false} render={<a href={`${routes.youtube}/connect`} />}>
              {reconnect ? "Connect again" : "Connect YouTube"}
            </Button>
            {reconnect && (
              <form action={disconnectYoutube}>
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
    "Open console.cloud.google.com and create a project (free, no card needed).",
    "APIs & Services → Library: enable “YouTube Data API v3” and “YouTube Analytics API”.",
    "OAuth consent screen: choose External, fill in the app name and your email, and add your Google account as a test user.",
    "Credentials → Create credentials → OAuth client ID → Web application.",
    "Under Authorized redirect URIs add http://localhost:3000/dridha/social/youtube/callback and https://<your domain>/dridha/social/youtube/callback.",
    "Copy the Client ID and Client secret.",
  ];
  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <Card>
        <CardHeader>
          <CardTitle>Set up YouTube</CardTitle>
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
