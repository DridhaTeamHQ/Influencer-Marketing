import { Suspense } from "react";
import { YoutubeDashboard, YoutubeDashboardSkeleton } from "@/components/youtube/youtube-dashboard";

export default function YoutubePage(props: PageProps<"/dridha/social/youtube">) {
  return (
    <Suspense fallback={<YoutubeDashboardSkeleton />}>
      <YoutubeDashboard searchParams={props.searchParams} />
    </Suspense>
  );
}
