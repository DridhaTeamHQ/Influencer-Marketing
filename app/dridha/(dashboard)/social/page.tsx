import { Suspense } from "react";
import { SocialOverview, SocialOverviewSkeleton } from "@/components/social/social-overview";

export default function SocialPage(props: PageProps<"/dridha/social">) {
  return (
    <Suspense fallback={<SocialOverviewSkeleton />}>
      <SocialOverview searchParams={props.searchParams} />
    </Suspense>
  );
}
