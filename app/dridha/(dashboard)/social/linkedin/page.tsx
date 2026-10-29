import { Suspense } from "react";
import { LinkedInDashboard, LinkedInDashboardSkeleton } from "@/components/linkedin/linkedin-dashboard";

export default function LinkedInPagePage(props: PageProps<"/dridha/social/linkedin">) {
  return (
    <Suspense fallback={<LinkedInDashboardSkeleton />}>
      <LinkedInDashboard searchParams={props.searchParams} />
    </Suspense>
  );
}
