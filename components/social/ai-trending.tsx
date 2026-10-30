import { RefreshTrendsButton } from "@/components/social/refresh-trends-button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getPlatformTrends } from "@/lib/social/ai-reports";
import type { PlatformKey } from "@/lib/social/overview";

export function AiTrendingSkeleton() {
  return <Skeleton className="h-28 rounded-xl" />;
}

/** A tile beside Followers/Posts, styled like StatCard: the category of our videos that goes viral most, and the runner-up. */
export async function AiTrending({ platform }: { platform: PlatformKey }) {
  const trends = await getPlatformTrends(platform);
  const [top, next] = trends.picks;

  return (
    <Card>
      <CardHeader>
        <CardDescription>Viral category</CardDescription>
        <CardTitle className="text-2xl font-semibold">{top?.name ?? "No clear trend"}</CardTitle>
        <CardAction className="-mt-1 -mr-1">
          <RefreshTrendsButton platform={platform} />
        </CardAction>
      </CardHeader>
      <CardContent className="truncate text-xs text-muted-foreground">
        {top ? (next ? `${top.note} · next: ${next.name}` : top.note) : trends.empty}
      </CardContent>
    </Card>
  );
}
