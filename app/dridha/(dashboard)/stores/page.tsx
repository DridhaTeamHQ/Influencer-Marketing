import { Suspense } from "react";
import { StoreDashboard, StoreDashboardSkeleton } from "@/components/stores/store-dashboard";

// The first sync copies every Play report and up to 120 days of Apple's daily Sales reports.
export const maxDuration = 300;

export default function StoresPage(props: PageProps<"/dridha/stores">) {
  return (
    <Suspense fallback={<StoreDashboardSkeleton />}>
      <StoreDashboard searchParams={props.searchParams} />
    </Suspense>
  );
}
