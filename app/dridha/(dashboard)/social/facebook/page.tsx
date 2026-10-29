import { Suspense } from "react";
import { FacebookDashboard, FacebookDashboardSkeleton } from "@/components/facebook/facebook-dashboard";

export default function FacebookPage(props: PageProps<"/dridha/social/facebook">) {
  return (
    <Suspense fallback={<FacebookDashboardSkeleton />}>
      <FacebookDashboard searchParams={props.searchParams} />
    </Suspense>
  );
}
