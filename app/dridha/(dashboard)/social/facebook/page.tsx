import { Suspense } from "react";
import { FacebookDashboard, FacebookDashboardSkeleton } from "@/components/facebook/facebook-dashboard";

// The refresh button on the viral-category tile has the AI read all our videos (a minute or two).
export const maxDuration = 300;

export default function FacebookPage(props: PageProps<"/dridha/social/facebook">) {
  return (
    <Suspense fallback={<FacebookDashboardSkeleton />}>
      <FacebookDashboard searchParams={props.searchParams} />
    </Suspense>
  );
}
