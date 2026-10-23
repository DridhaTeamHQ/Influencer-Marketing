import { Suspense } from "react";
import { StoreDashboard, StoreDashboardSkeleton, type StoreConfig } from "@/components/stores/store-dashboard";
import { routes } from "@/lib/routes";

// The first sync copies up to 120 days of Apple's daily Sales reports.
export const maxDuration = 300;

const config: StoreConfig = {
  store: "APP_STORE",
  title: "App Store",
  description: "Downloads, deletions and campaigns from App Store Connect.",
  basePath: routes.appStore,
  accent: "ios",
  color: "var(--chart-1)",
  uniqueLabel: "Unique devices",
  uniqueHint: "Devices that installed the app",
  totalDownloadsCard: true,
  uninstallLabel: "Deletions",
  setup: [
    "In App Store Connect → Users and Access → Integrations, generate a Team Key with Admin access.",
    "Download the .p8 file and copy the Issuer ID and Key ID shown on that page.",
    "Copy your vendor number from Payments and Financial Reports.",
  ],
};

export default function AppStorePage(props: PageProps<"/dridha/app-store">) {
  return (
    <Suspense fallback={<StoreDashboardSkeleton config={config} />}>
      <StoreDashboard config={config} searchParams={props.searchParams} />
    </Suspense>
  );
}
