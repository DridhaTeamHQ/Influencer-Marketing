import { Suspense } from "react";
import { YoutubeDashboard, YoutubeDashboardSkeleton } from "@/components/youtube/youtube-dashboard";

// The refresh button on the viral-category tile has the AI read all our videos (a minute or two).
export const maxDuration = 300;

export default function YoutubePage(props: PageProps<"/dridha/social/youtube">) {
  return (
    <Suspense fallback={<YoutubeDashboardSkeleton />}>
      <YoutubeDashboard searchParams={props.searchParams} />
    </Suspense>
  );
}
