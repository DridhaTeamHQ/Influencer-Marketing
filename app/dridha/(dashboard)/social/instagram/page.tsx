import { Suspense } from "react";
import { InstagramDashboard, InstagramDashboardSkeleton } from "@/components/instagram/instagram-dashboard";

export default function InstagramPage(props: PageProps<"/dridha/social/instagram">) {
  return (
    <Suspense fallback={<InstagramDashboardSkeleton />}>
      <InstagramDashboard searchParams={props.searchParams} />
    </Suspense>
  );
}
