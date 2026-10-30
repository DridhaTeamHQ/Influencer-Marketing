import { Suspense } from "react";
import { InstagramDashboard, InstagramDashboardSkeleton } from "@/components/instagram/instagram-dashboard";

// The refresh button on the viral-category tile has the AI read all our videos (a minute or two).
export const maxDuration = 300;

export default function InstagramPage(props: PageProps<"/dridha/social/instagram">) {
  return (
    <Suspense fallback={<InstagramDashboardSkeleton />}>
      <InstagramDashboard searchParams={props.searchParams} />
    </Suspense>
  );
}
