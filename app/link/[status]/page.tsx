import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarXIcon, CircleSlashIcon, DownloadIcon, LinkIcon, SearchXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PUBLIC_SITE_URL } from "@/lib/routes";
import { DOWNLOAD_URL } from "@/lib/tracking";

/** Shown instead of the redirect when a tracking link can't be used. */
const STATUSES = {
  expired: {
    icon: CalendarXIcon,
    title: "This link has expired",
    description: "This link is no longer active. Ask the person who shared it for a new one.",
    tone: "bg-chart-1/15 text-chart-1",
  },
  unavailable: {
    icon: CircleSlashIcon,
    title: "This link isn't available",
    description: "This link has been paused. Ask the person who shared it for a new one.",
    tone: "bg-muted text-muted-foreground",
  },
  "not-found": {
    icon: SearchXIcon,
    title: "Link not found",
    description: "We couldn't find this link. Check that it was copied correctly.",
    tone: "bg-destructive/10 text-destructive",
  },
} as const;

type Status = keyof typeof STATUSES;

export function generateStaticParams() {
  return Object.keys(STATUSES).map((status) => ({ status }));
}

export async function generateMetadata(props: PageProps<"/link/[status]">): Promise<Metadata> {
  const { status } = await props.params;
  const info = STATUSES[status as Status];
  return { title: info ? `${info.title} · DailyMattr` : "DailyMattr", robots: { index: false } };
}

export default async function LinkStatusPage(props: PageProps<"/link/[status]">) {
  const { status } = await props.params;
  const info = STATUSES[status as Status];
  if (!info) notFound();
  const Icon = info.icon;

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2 font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LinkIcon className="size-4" />
          </span>
          DailyMattr
        </div>
        <Card className="text-center">
          <CardHeader className="justify-items-center">
            <span className={`mb-2 flex size-12 items-center justify-center rounded-full ${info.tone}`}>
              <Icon className="size-6" />
            </span>
            <CardTitle className="text-xl">{info.title}</CardTitle>
            <CardDescription>{info.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button nativeButton={false} render={<a href={DOWNLOAD_URL} />}>
              <DownloadIcon data-icon="inline-start" />
              Get the DailyMattr app
            </Button>
            <Button variant="ghost" nativeButton={false} render={<a href={PUBLIC_SITE_URL} />}>
              Go to dailymattr.com
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
