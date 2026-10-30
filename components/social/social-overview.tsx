import Link from "next/link";
import { connection } from "next/server";
import { EyeIcon, ImageIcon, PercentIcon, SparklesIcon, TrophyIcon, UsersIcon } from "lucide-react";
import { StatCard } from "@/components/analytics/stat-card";
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
import {
  PLATFORMS,
  engagementRate,
  getSocialOverview,
  isConnected,
  type ConnectedSummary,
  type ContentItem,
  type PlatformSummary,
} from "@/lib/social/overview";
import { parseStoreRange } from "@/lib/stores/range";
import { cn } from "@/lib/utils";

const TITLE = "Social overview";
const DESCRIPTION = "Instagram, Facebook and YouTube side by side: where we grow, where people engage, and what to post next.";

const shortDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const formatRate = (r: number | null) => (r === null ? "—" : `${r}%`);
const signed = (n: number) => `${n > 0 ? "+" : ""}${formatNumber(n)}`;

/** Engagement rate for picking a winner: a handful of views gives a meaningless rate, so those don't compete. */
const MIN_VIEWS_TO_RANK = 100;
const rankedRate = (s: ConnectedSummary) => (s.current.views >= MIN_VIEWS_TO_RANK ? engagementRate(s.current) : null);

export function SocialOverviewSkeleton() {
  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <div className="space-y-4">
        <Skeleton className="h-9 rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </>
  );
}

export async function SocialOverview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const params = await searchParams;
  const range = parseStoreRange(params);
  const overview = await getSocialOverview(range);
  const connected = overview.filter(isConnected);

  const sum = (pick: (s: ConnectedSummary) => number | null) => connected.reduce((total, s) => total + (pick(s) ?? 0), 0);
  const totals = {
    followers: sum((s) => s.followers),
    views: sum((s) => s.current.views),
    prevViews: sum((s) => s.prev.views),
    interactions: sum((s) => s.current.interactions),
    prevInteractions: sum((s) => s.prev.interactions),
    netFollowers: sum((s) => s.current.netFollowers),
  };
  const allRate = engagementRate(totals);
  const prevAllRate = engagementRate({ views: totals.prevViews, interactions: totals.prevInteractions });

  /** The connected platform with the highest value, when there's a real winner. */
  const leader = (pick: (s: ConnectedSummary) => number | null) => {
    const ranked = connected.filter((s) => (pick(s) ?? 0) > 0).sort((a, b) => pick(b)! - pick(a)!);
    return ranked[0]?.platform ?? null;
  };
  const leaders = {
    views: leader((s) => s.current.views),
    engagement: leader(rankedRate),
    growth: leader((s) => s.current.netFollowers),
    followers: leader((s) => s.followers),
  };

  const content = connected
    .flatMap((s) => s.content)
    .filter((c) => c.publishedAt.slice(0, 10) >= range.from && c.publishedAt.slice(0, 10) <= range.to);

  return (
    <div className="space-y-6">
      <PageHeader title={TITLE} description={DESCRIPTION} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {shortDate(range.from)} – {shortDate(range.to)}
          <span className="ml-2 text-sm font-normal text-muted-foreground">{range.days} days</span>
        </h2>
        <StoreRangeFilter range={range} basePath={routes.social} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<UsersIcon />} accent="ios" label="Total audience" value={formatNumber(totals.followers)} hint="Followers and subscribers, right now" />
        <StatCard
          icon={<EyeIcon />}
          accent="android"
          label="Views"
          value={formatNumber(totals.views)}
          change={percentChange(totals.views, totals.prevViews)}
          hint="All platforms, these dates"
        />
        <StatCard
          icon={<SparklesIcon />}
          accent="others"
          label="Interactions"
          value={formatNumber(totals.interactions)}
          change={percentChange(totals.interactions, totals.prevInteractions)}
          hint="Likes, comments, shares and saves"
        />
        <StatCard
          icon={<PercentIcon />}
          accent="signups"
          label="Engagement rate"
          value={formatRate(allRate)}
          change={allRate !== null && prevAllRate ? percentChange(allRate, prevAllRate) : undefined}
          hint={`Interactions ÷ views · ${signed(totals.netFollowers)} followers`}
        />
      </div>


      <div className="grid gap-4 lg:grid-cols-3">
        {overview.map((s) => (
          <PlatformCard key={s.platform} summary={s} leaders={leaders} totalViews={totals.views} />
        ))}
      </div>

      {connected.length > 0 && <HeadToHead connected={connected} />}

      {connected.length > 0 && <TopContent content={content} />}
    </div>
  );
}

type Leaders = Record<"views" | "engagement" | "growth" | "followers", string | null>;

function PlatformCard({ summary: s, leaders, totalViews }: { summary: PlatformSummary; leaders: Leaders; totalViews: number }) {
  const { label, href } = PLATFORMS[s.platform];
  if (!isConnected(s)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{label}</CardTitle>
          <CardDescription>{s.status === "error" ? "Couldn't load the numbers" : "Not connected yet"}</CardDescription>
          <CardAction>
            <Badge variant="outline">{s.status === "error" ? "Needs attention" : "Not connected"}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          {s.status === "error" && <p className="rounded-lg bg-destructive/10 p-3 text-sm break-words text-destructive">{s.error}</p>}
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={href} />}>
            Open {label}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const rate = engagementRate(s.current);
  const share = totalViews ? Math.round((s.current.views / totalViews) * 100) : 0;
  const badges = [
    leaders.views === s.platform && "Most views",
    leaders.engagement === s.platform && "Best engagement",
    leaders.growth === s.platform && "Fastest growing",
    leaders.followers === s.platform && "Biggest audience",
  ].filter(Boolean) as string[];
  const rows: [string, string, number | null | undefined][] = [
    ["Followers", s.followers === null ? "Hidden" : formatNumber(s.followers), undefined],
    ["Views", formatNumber(s.current.views), percentChange(s.current.views, s.prev.views)],
    ["Interactions", formatNumber(s.current.interactions), percentChange(s.current.interactions, s.prev.interactions)],
    ["Comments", s.current.comments === null ? "—" : formatNumber(s.current.comments), s.current.comments === null ? undefined : percentChange(s.current.comments, s.prev.comments ?? 0)],
    ["Engagement rate", formatRate(rate), undefined],
    ["New followers", s.current.netFollowers === null ? "—" : signed(s.current.netFollowers), undefined],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link href={href} className="hover:underline">
            {label}
          </Link>
        </CardTitle>
        <CardDescription className="truncate">
          <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">
            {s.account}
          </a>
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={href} />}>
            Details
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <Badge key={b} variant="secondary">
                <TrophyIcon /> {b}
              </Badge>
            ))}
          </div>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {rows.map(([name, value, change]) => (
            <div key={name}>
              <dt className="text-xs text-muted-foreground">{name}</dt>
              <dd className="flex items-baseline gap-1.5 font-medium tabular-nums">
                {value}
                {change !== undefined && <Change value={change} />}
              </dd>
            </div>
          ))}
        </dl>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Share of all views</span>
            <span className="tabular-nums">{share}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** "+12%", "−5%" or "new", colored. */
function Change({ value }: { value: number | null }) {
  if (value === 0) return null;
  return (
    <span className={cn("text-xs font-normal", value === null || value > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
      {value === null ? "new" : `${value > 0 ? "+" : "−"}${Math.abs(value)}%`}
    </span>
  );
}

/** Every platform in one table, the best value in each row marked. */
function HeadToHead({ connected }: { connected: ConnectedSummary[] }) {
  const metrics: {
    label: string;
    hint?: string;
    value: (s: ConnectedSummary) => number | null;
    /** What the leader is picked by, when not the shown value. */
    rank?: (s: ConnectedSummary) => number | null;
    format?: (n: number) => string;
  }[] = [
    { label: "Followers", value: (s) => s.followers },
    { label: "Views", value: (s) => s.current.views },
    { label: "Accounts reached", hint: "Not given by YouTube", value: (s) => s.current.reach },
    { label: "Likes / reactions", hint: "Facebook only gives a total", value: (s) => s.current.likes },
    { label: "Comments", value: (s) => s.current.comments },
    { label: "Shares", value: (s) => s.current.shares },
    { label: "Interactions", value: (s) => s.current.interactions },
    {
      label: "Engagement rate",
      hint: `Interactions ÷ views · ranked from ${MIN_VIEWS_TO_RANK} views`,
      value: (s) => engagementRate(s.current),
      rank: rankedRate,
      format: (n) => `${n}%`,
    },
    { label: "New followers", value: (s) => s.current.netFollowers, format: signed },
    { label: "Posts in these dates", value: (s) => s.content.length, format: formatNumber },
  ];
  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>Head to head</CardTitle>
        <CardDescription>The leader in each row is marked · Facebook counts clicks in its interactions</CardDescription>
      </CardHeader>
      <div className="overflow-x-auto border-t">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-6">Metric</TableHead>
              {connected.map((s) => (
                <TableHead key={s.platform} className="text-right last:pr-6">
                  {PLATFORMS[s.platform].label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.map((m) => {
              const values = connected.map(m.value);
              const ranks = connected.map(m.rank ?? m.value);
              const best = connected.length > 1 ? Math.max(...ranks.map((v) => v ?? -Infinity)) : null;
              return (
                <TableRow key={m.label}>
                  <TableCell className="pl-6">
                    {m.label}
                    {m.hint && <span className="block text-xs text-muted-foreground">{m.hint}</span>}
                  </TableCell>
                  {values.map((v, i) => {
                    const leads = best !== null && best > 0 && ranks[i] === best;
                    return (
                      <TableCell key={connected[i]!.platform} className={cn("text-right tabular-nums last:pr-6", leads && "font-semibold text-primary")}>
                        {v === null ? "—" : (m.format ?? formatNumber)(v)}
                        {leads && <TrophyIcon className="ml-1 inline size-3.5" />}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

/** Posts and videos from every platform published in these dates. */
function TopContent({ content }: { content: ContentItem[] }) {
  const perView = (c: ContentItem) => (c.views ? c.interactions / c.views : 0);
  const tabs = [
    { key: "views", title: "Most viewed", items: [...content].sort((a, b) => b.views - a.views) },
    { key: "engagement", title: "Most engaging", items: [...content].filter((c) => c.views >= 10).sort((a, b) => perView(b) - perView(a)) },
    { key: "comments", title: "Most comments", items: [...content].sort((a, b) => b.comments - a.comments) },
  ];
  return (
    <Card className="pb-0">
      <Tabs defaultValue="views" className="gap-0">
        <CardHeader>
          <CardTitle>Top content, all platforms</CardTitle>
          <CardDescription>Published in these dates · lifetime numbers</CardDescription>
          <CardAction>
            <Badge variant="secondary">{content.length}</Badge>
          </CardAction>
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
          <TabsContent key={t.key} value={t.key}>
            {t.items.length ? (
              <ContentTable items={t.items.slice(0, 10)} />
            ) : (
              <p className="px-6 pb-8 text-center text-sm text-muted-foreground">No posts in these dates</p>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}

function ContentTable({ items }: { items: ContentItem[] }) {
  return (
    <div className="overflow-x-auto border-t">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-6">Post</TableHead>
            <TableHead>Platform</TableHead>
            <TableHead>Published</TableHead>
            <TableHead className="text-right">Views</TableHead>
            <TableHead className="text-right">Likes</TableHead>
            <TableHead className="text-right">Comments</TableHead>
            <TableHead className="text-right">Shares</TableHead>
            <TableHead className="pr-6 text-right">Engagement</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((c) => (
            <TableRow key={`${c.platform}-${c.id}`}>
              <TableCell className="pl-6">
                <a href={c.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-3 hover:underline">
                  {c.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.thumbnailUrl} alt="" className="size-12 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <ImageIcon className="size-4" />
                    </span>
                  )}
                  <span className="line-clamp-2 max-w-72 text-sm whitespace-normal" title={c.title}>
                    {c.title || <span className="text-muted-foreground">No text</span>}
                  </span>
                </a>
              </TableCell>
              <TableCell>
                <div className="flex flex-col items-start gap-1">
                  <Badge variant="outline">{PLATFORMS[c.platform].label}</Badge>
                  <span className="text-xs text-muted-foreground">{c.kind}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{timeAgo(new Date(c.publishedAt))}</TableCell>
              <TableCell className="text-right tabular-nums" title={formatNumber(c.views)}>
                {formatCompact(c.views)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(c.likes)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(c.comments)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(c.shares)}</TableCell>
              <TableCell className="pr-6 text-right tabular-nums" title="Interactions ÷ views">
                {formatRate(engagementRate(c))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
