import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { PlusIcon, UsersIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { CopyButton } from "@/components/copy-button";
import { InfluencerActions } from "@/components/influencers/influencer-actions";
import { InfluencerFormDialog } from "@/components/influencers/influencer-form-dialog";
import { ProfileButton } from "@/components/influencers/profile-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getClickTotalsByInfluencer } from "@/lib/analytics";
import {
  formatCompact,
  formatNumber,
  formatPeriod,
  initials,
  PERIOD_BADGE,
  periodStatus,
  PLATFORM_LABELS,
} from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getBaseUrl, trackingUrl } from "@/lib/tracking";
import { routes } from "@/lib/routes";

export default function InfluencersPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader
            title="Influencers"
            description="Everyone promoting DailyMattr, with their download links and referral codes."
          />
          <Skeleton className="h-96 rounded-xl" />
        </>
      }
    >
      <InfluencerList />
    </Suspense>
  );
}

async function InfluencerList() {
  await connection();
  const [influencers, totals, baseUrl] = await Promise.all([
    prisma.influencer.findMany({
      orderBy: { createdAt: "desc" },
      include: { link: true },
    }),
    getClickTotalsByInfluencer(),
    getBaseUrl(),
  ]);

  const addButton = (
    <InfluencerFormDialog
      linkPrefix={`${baseUrl.replace(/^https?:\/\//, "")}/r/`}
      trigger={
        <Button>
          <PlusIcon data-icon="inline-start" />
          Add influencer
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Influencers"
        description="Everyone promoting DailyMattr, with their download links and referral codes."
      >
        {influencers.length > 0 && addButton}
      </PageHeader>

      {influencers.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>No influencers yet</EmptyTitle>
            <EmptyDescription>
              Add someone and they&apos;ll get a unique download link you can
              share with them.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{addButton}</EmptyContent>
        </Empty>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Influencer</TableHead>
                <TableHead className="hidden md:table-cell">Platform</TableHead>
                <TableHead>Tracking link</TableHead>
                <TableHead className="hidden md:table-cell">Referral code</TableHead>
                <TableHead className="hidden sm:table-cell">Campaign period</TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  Last 7 days
                </TableHead>
                <TableHead className="hidden lg:table-cell">Status</TableHead>
                <TableHead className="w-10 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {influencers.map((inf) => {
                const link = inf.link;
                const url = link ? trackingUrl(baseUrl, link.code) : null;
                const total = totals.get(inf.id);
                return (
                  <TableRow key={inf.id}>
                    <TableCell className="pl-4">
                      <Link
                        href={routes.influencer(inf.id)}
                        className="flex items-center gap-3"
                      >
                        <Avatar>
                          <AvatarFallback>{initials(inf.name)}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0">
                          <span className="block max-w-48 truncate font-medium hover:underline">
                            {inf.name}
                          </span>
                          <span className="block max-w-48 truncate text-xs text-muted-foreground">
                            {inf.handle
                              ? `@${inf.handle}`
                              : PLATFORM_LABELS[inf.platform]}
                            {inf.followers != null &&
                              ` · ${formatCompact(inf.followers)} followers`}
                          </span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-1">
                        <Badge variant="outline">
                          {PLATFORM_LABELS[inf.platform]}
                        </Badge>
                        <ProfileButton platform={inf.platform} handle={inf.handle} />
                      </div>
                    </TableCell>
                    <TableCell>
                      {link && url ? (
                        <div className="flex items-center gap-1">
                          <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
                            /r/{link.code}
                          </code>
                          <CopyButton value={url} />
                          {(!link.isActive || !inf.isActive) && (
                            <Badge variant="outline">Paused</Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No link
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-1">
                        <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {inf.referralCode}
                        </code>
                        <CopyButton value={inf.referralCode} label="Copy code" />
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <PeriodCell start={inf.periodStart} end={inf.periodEnd} />
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground lg:table-cell">
                      {formatNumber(total?.last7 ?? 0)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {inf.isActive ? (
                        <Badge variant="secondary" className="bg-primary/10 text-primary dark:bg-primary/30 dark:text-primary-foreground">
                          <span className="size-1.5 rounded-full bg-primary" />
                          Active
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground"
                        >
                          Paused
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-4">
                      <InfluencerActions
                        id={inf.id}
                        name={inf.name}
                        isActive={inf.isActive}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}

function PeriodCell({ start, end }: { start: Date | null; end: Date | null }) {
  const label = formatPeriod(start, end);
  const status = periodStatus(start, end);
  if (!label || !status) {
    return <span className="text-xs text-muted-foreground">Not set</span>;
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-sm whitespace-nowrap">{label}</span>
      <Badge variant="secondary" className={PERIOD_BADGE[status]}>
        {status}
      </Badge>
    </div>
  );
}

