import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchXIcon, UsersIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { CopyButton } from "@/components/copy-button";
import { InfluencerActions } from "@/components/influencers/influencer-actions";
import { InfluencerAvatar } from "@/components/influencers/influencer-avatar";
import { InfluencerFormDialog } from "@/components/influencers/influencer-form-dialog";
import { InfluencerToolbar } from "@/components/influencers/influencer-toolbar";
import { ProfileButton } from "@/components/influencers/profile-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getInfluencerList, type InfluencerListRow } from "@/lib/analytics";
import { formatCompact, formatNumber, formatPeriod, PERIOD_BADGE, periodStatus, PLATFORM_LABELS } from "@/lib/format";
import type { SocialPlatform } from "@/lib/generated/prisma/enums";
import { listQuery, PAGE_SIZE, parseListParams, type ListParams } from "@/lib/list-params";
import { prisma } from "@/lib/prisma";
import { routes } from "@/lib/routes";
import { getBaseUrl, partnerUrl, trackingUrl } from "@/lib/tracking";

const DESCRIPTION = "Everyone promoting DailyMattr, with their download links and referral codes.";

export default function InfluencersPage(props: PageProps<"/dridha/influencers">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Influencers" description={DESCRIPTION} />
          <div className="space-y-4">
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-96 rounded-xl" />
          </div>
        </>
      }
    >
      <InfluencerList searchParams={props.searchParams} />
    </Suspense>
  );
}

async function InfluencerList({ searchParams }: { searchParams: PageProps<"/dridha/influencers">["searchParams"] }) {
  await connection();
  const params = parseListParams(await searchParams);
  const [{ rows, total, pageCount, counts }, baseUrl, linkedin] = await Promise.all([
    getInfluencerList(params),
    getBaseUrl(),
    getLinkedInPartner(),
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

  if (counts.all === 0) {
    return (
      <>
        <PageHeader title="Influencers" description={DESCRIPTION} />
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>No influencers yet</EmptyTitle>
            <EmptyDescription>
              Add someone and they&apos;ll get a download link and referral code to share.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{addButton}</EmptyContent>
        </Empty>
      </>
    );
  }

  const page = Math.min(params.page, pageCount);
  // Tamada Media is pinned to the top of the first page whenever it matches the filters.
  const partner = linkedin && page === 1 && partnerMatches(linkedin, params) ? linkedin : null;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <PageHeader title="Influencers" description={DESCRIPTION}>
        {addButton}
      </PageHeader>

      <div className="space-y-4">
        <InfluencerToolbar params={params} counts={counts} />

        <Card className="gap-0 py-0">
          {rows.length === 0 && !partner ? (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchXIcon />
                </EmptyMedia>
                <EmptyTitle>No influencers found</EmptyTitle>
                <EmptyDescription>Try a different name, handle or code, or clear the filters.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" nativeButton={false} render={<Link href={routes.influencers} />}>
                  Clear filters
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Influencer</TableHead>
                  <TableHead className="hidden md:table-cell">Platform</TableHead>
                  <TableHead>Share</TableHead>
                  <TableHead className="hidden lg:table-cell">Campaign</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Clicks (7d)</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="w-10 pr-4">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partner && <LinkedInPartnerRow partner={partner} baseUrl={baseUrl} />}
                {rows.map((inf) => (
                  <InfluencerRow key={inf.id} inf={inf} baseUrl={baseUrl} />
                ))}
              </TableBody>
            </Table>
          )}

          {total > 0 && (
            <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
              <span className="tabular-nums">
                {from}–{to} of {formatNumber(total)}
              </span>
              <Pagination page={page} pageCount={pageCount} params={params} />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

/** Tamada Media's LinkedIn link. It is a partner link (/go/), so its clicks are counted apart from influencers. */
async function getLinkedInPartner() {
  const link = await prisma.partnerLink.findFirst({
    where: { channel: "LinkedIn" },
    orderBy: { createdAt: "asc" },
  });
  if (!link) return null;
  const last7 = await prisma.partnerClick.count({
    where: { isBot: false, linkId: link.id, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
  });
  return { ...link, last7 };
}

type LinkedInPartner = NonNullable<Awaited<ReturnType<typeof getLinkedInPartner>>>;

function partnerMatches(partner: LinkedInPartner, params: ListParams) {
  const q = params.q.trim().toLowerCase();
  return (
    (params.platform === "all" || params.platform === "LINKEDIN") &&
    (params.status === "all" || (params.status === "active") === partner.isActive) &&
    (!q || partner.name.toLowerCase().includes(q) || partner.slug.toLowerCase().includes(q))
  );
}

function LinkedInPartnerRow({ partner, baseUrl }: { partner: LinkedInPartner; baseUrl: string }) {
  const url = partnerUrl(baseUrl, partner.slug);
  return (
    <TableRow>
      <TableCell className="pl-4">
        <Link href={routes.linkedin} className="group flex items-center gap-3">
          <InfluencerAvatar name={partner.name} seed={partner.id} />
          <span className="min-w-0">
            <span className="block max-w-48 truncate font-medium group-hover:underline">{partner.name}</span>
            <span className="block max-w-48 truncate text-xs text-muted-foreground">Partner · LinkedIn</span>
          </span>
        </Link>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <Badge variant="outline">{PLATFORM_LABELS.LINKEDIN}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">/go/{partner.slug}</code>
          <CopyButton value={url} label="Copy link" size="icon-xs" />
        </div>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <span className="text-xs text-muted-foreground">Ongoing</span>
      </TableCell>
      <TableCell className="hidden text-right font-medium tabular-nums sm:table-cell">
        {formatNumber(partner.last7)}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {partner.isActive ? (
          <Badge
            variant="secondary"
            className="bg-primary/10 text-primary dark:bg-primary/30 dark:text-primary-foreground"
          >
            <span className="size-1.5 rounded-full bg-current" />
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            <span className="size-1.5 rounded-full bg-current" />
            Paused
          </Badge>
        )}
      </TableCell>
      <TableCell className="pr-4">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="View stats"
          nativeButton={false}
          render={<Link href={routes.linkedin} />}
        >
          <ChevronRightIcon />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function InfluencerRow({ inf, baseUrl }: { inf: InfluencerListRow; baseUrl: string }) {
  const platform = inf.platform as SocialPlatform;
  const url = inf.linkCode ? trackingUrl(baseUrl, inf.linkCode) : null;

  return (
    <TableRow>
      <TableCell className="pl-4">
        <Link href={routes.influencer(inf.id)} className="group flex items-center gap-3">
          <InfluencerAvatar name={inf.name} seed={inf.id} />
          <span className="min-w-0">
            <span className="block max-w-48 truncate font-medium group-hover:underline">{inf.name}</span>
            <span className="block max-w-48 truncate text-xs text-muted-foreground">
              {inf.handle ? `@${inf.handle}` : PLATFORM_LABELS[platform]}
              {inf.followers != null && ` · ${formatCompact(inf.followers)} followers`}
            </span>
          </span>
        </Link>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <div className="flex items-center gap-1">
          <Badge variant="outline">{PLATFORM_LABELS[platform]}</Badge>
          <ProfileButton platform={platform} handle={inf.handle} />
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-1">
          {url ? (
            <div className="flex items-center gap-1">
              <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">/r/{inf.linkCode}</code>
              <CopyButton value={url} label="Copy link" size="icon-xs" />
              {inf.linkActive === false && inf.isActive && (
                <Badge variant="outline" className="text-muted-foreground">
                  Link off
                </Badge>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No link</span>
          )}
          <div className="flex items-center gap-1">
            <code className="rounded-md px-1.5 font-mono text-xs text-muted-foreground">{inf.referralCode}</code>
            <CopyButton value={inf.referralCode} label="Copy referral code" size="icon-xs" />
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <PeriodCell start={inf.periodStart} end={inf.periodEnd} />
      </TableCell>
      <TableCell className="hidden text-right font-medium tabular-nums sm:table-cell">
        {formatNumber(inf.last7)}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {inf.isActive ? (
          <Badge
            variant="secondary"
            className="bg-primary/10 text-primary dark:bg-primary/30 dark:text-primary-foreground"
          >
            <span className="size-1.5 rounded-full bg-current" />
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            <span className="size-1.5 rounded-full bg-current" />
            Paused
          </Badge>
        )}
      </TableCell>
      <TableCell className="pr-4">
        <InfluencerActions id={inf.id} name={inf.name} isActive={inf.isActive} />
      </TableCell>
    </TableRow>
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

function Pagination({ page, pageCount, params }: { page: number; pageCount: number; params: ListParams }) {
  if (pageCount <= 1) return null;
  const href = (p: number) => `${routes.influencers}${listQuery({ ...params, page: p })}`;
  return (
    <div className="flex items-center gap-2">
      <span className="hidden tabular-nums sm:inline">
        Page {page} of {pageCount}
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Previous page"
        disabled={page <= 1}
        nativeButton={false}
        render={page > 1 ? <Link href={href(page - 1)} scroll={false} /> : <span />}
      >
        <ChevronLeftIcon />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Next page"
        disabled={page >= pageCount}
        nativeButton={false}
        render={page < pageCount ? <Link href={href(page + 1)} scroll={false} /> : <span />}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
