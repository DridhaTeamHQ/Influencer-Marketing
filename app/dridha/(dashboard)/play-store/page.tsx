import { Suspense } from "react";
import { ImportUninstallsDialog } from "@/components/stores/import-uninstalls-dialog";
import { StoreDashboard, StoreDashboardSkeleton, type StoreConfig } from "@/components/stores/store-dashboard";
import { routes } from "@/lib/routes";

// The first sync copies every Play report into the database.
export const maxDuration = 300;

const config: StoreConfig = {
  store: "GOOGLE_PLAY",
  title: "Play Store",
  description: "Downloads, uninstalls and UTM sources from Google Play Console.",
  basePath: routes.playStore,
  accent: "android",
  color: "var(--chart-2)",
  uniqueLabel: "Store visitors",
  uniqueHint: "People who opened the store listing",
  uninstallLabel: "Uninstalls",
  setup: [
    "Create a service account in Google Cloud and connect it to Vercel (Workload Identity Federation), or create a key for it.",
    "In Play Console → Users and permissions, invite its email with “View app information and download bulk reports”.",
    "In Play Console → Download reports → Statistics, click “Copy Cloud Storage URI” and paste it as the bucket.",
  ],
  actions: <ImportUninstallsDialog />,
};

export default function PlayStorePage(props: PageProps<"/dridha/play-store">) {
  return (
    <Suspense fallback={<StoreDashboardSkeleton config={config} />}>
      <StoreDashboard config={config} searchParams={props.searchParams} />
    </Suspense>
  );
}
