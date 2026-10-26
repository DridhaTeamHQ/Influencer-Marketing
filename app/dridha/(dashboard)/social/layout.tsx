import { SocialTabs } from "@/components/social/social-tabs";
import { routes } from "@/lib/routes";

const tabs = [
  { href: routes.instagram, label: "Instagram" },
  { href: routes.facebook, label: "Facebook" },
  { href: routes.youtube, label: "YouTube" },
];

export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <p className="text-sm font-medium text-muted-foreground">Social accounts</p>
        <SocialTabs tabs={tabs} />
      </div>
      {children}
    </>
  );
}
