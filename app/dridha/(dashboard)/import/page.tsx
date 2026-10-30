import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  ChevronRightIcon,
  FileSpreadsheetIcon,
  TicketIcon,
  Trash2Icon,
  UserMinusIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { AppReferrerForm, DeletionsTotalForm, PlayUninstallsForm, ReferralForm } from "@/components/stores/import-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { prisma } from "@/lib/prisma";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { APPLE_REFERRER_REPORTS, daysAgo, isoDay } from "@/lib/stores/shared";
import { PLAY_IMPORT_REPORT, deletionsLeftOut } from "@/lib/stores/stats";

const DESCRIPTION = "Numbers the store APIs don’t give. Pick what you want to add.";

/** Everything that can be imported or typed in, in list order. */
const SECTIONS = {
  deletions: { title: "App Store deletions", store: "App Store", icon: Trash2Icon },
  referrers: { title: "App Store referrer CSV", store: "App Store", icon: FileSpreadsheetIcon },
  uninstalls: { title: "Uninstalls CSV", store: "Play Store", icon: UserMinusIcon },
  referral: { title: "Referral codes CSV", store: "Both stores", icon: TicketIcon },
} as const;

type Section = keyof typeof SECTIONS;

const shortDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">{children}</ol>;
}

const B = ({ children }: { children: React.ReactNode }) => <span className="font-medium text-foreground">{children}</span>;

export default function ImportPage(props: PageProps<"/dridha/import">) {
  return (
    <>
      <PageHeader title="Import data" description={DESCRIPTION} />
      <Suspense
        fallback={
          <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        }
      >
        <ImportSections searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const latestDay = async (report: string) => {
  const row = await prisma.storeStat.findFirst({ where: { report }, orderBy: { date: "desc" }, select: { date: true } });
  return row ? isoDay(row.date) : null;
};

async function ImportSections({ searchParams }: Pick<PageProps<"/dridha/import">, "searchParams">) {
  await connection();
  const requested = (await searchParams).section;
  const section: Section = typeof requested === "string" && requested in SECTIONS ? (requested as Section) : "deletions";

  const [deletions, referrersTo, uninstallsTo, referral] = await Promise.all([
    deletionsLeftOut(),
    latestDay(APPLE_REFERRER_REPORTS.CSV),
    latestDay(PLAY_IMPORT_REPORT),
    prisma.referralDownload.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
  ]);
  const today = daysAgo(0);

  /** What's saved so far, shown under each row's title. */
  const status: Record<Section, string> = {
    deletions: deletions ? `${deletions.total} all time, up to ${shortDate(deletions.asOf)}` : "Nothing entered yet",
    referrers: referrersTo ? `Imported up to ${shortDate(referrersTo)}` : "Not imported yet",
    uninstalls: uninstallsTo ? `Imported up to ${shortDate(uninstallsTo)}` : "Not imported yet",
    referral: referral ? `Latest ${shortDate(isoDay(referral.date))}` : "Not uploaded yet",
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[20rem_1fr]">
      <Card className="gap-0 py-0">
        <ul className="divide-y">
          {(Object.keys(SECTIONS) as Section[]).map((key) => {
            const { title, store, icon: Icon } = SECTIONS[key];
            const active = key === section;
            return (
              <li key={key}>
                <Link
                  href={`${routes.storesImport}?section=${key}`}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60",
                    active && "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
                      active && "bg-primary text-primary-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{title}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {store} · {status[key]}
                    </span>
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      {section === "deletions" && (
        <Card>
          <CardHeader>
            <CardTitle>App Store deletions</CardTitle>
            <CardDescription>
              Apple’s report leaves out small numbers. Enter App Store Connect’s all-time total and only the difference is
              added, so deletions, net and active installs match.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Steps>
              <li>
                App Store Connect → your app → Analytics → Metrics → <B>Deletions</B>.
              </li>
              <li>Pick all dates and copy the total.</li>
            </Steps>
            <DeletionsTotalForm current={deletions} yesterday={daysAgo(1)} />
          </CardContent>
        </Card>
      )}

      {section === "referrers" && (
        <Card>
          <CardHeader>
            <CardTitle>App Store referrer CSV</CardTitle>
            <CardDescription>Every app that sent downloads, including the small ones Apple’s API leaves out.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Steps>
              <li>App Store Connect → your app → Analytics → Metrics.</li>
              <li>
                <B>Total Downloads</B> → <B>By App Referrer</B>, chart set to <B>Days</B>.
              </li>
              <li>Choose the dates, then ••• → Export as CSV.</li>
            </Steps>
            <AppReferrerForm />
          </CardContent>
        </Card>
      )}

      {section === "uninstalls" && (
        <Card>
          <CardHeader>
            <CardTitle>Play Store · Uninstalls CSV</CardTitle>
            <CardDescription>Until Google publishes install reports for this app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Steps>
              <li>Play Console → your app → Statistics.</li>
              <li>
                Metric <B>Users lost</B> (or All users lost), interval <B>Daily</B>.
              </li>
              <li>Choose the dates, then Export report → CSV.</li>
            </Steps>
            <PlayUninstallsForm />
          </CardContent>
        </Card>
      )}

      {section === "referral" && (
        <Card>
          <CardHeader>
            <CardTitle>Referral codes CSV</CardTitle>
            <CardDescription>
              From the referral portal. The “Usage Count” column is added up and only that total is saved; the file isn’t
              kept. Shown in the Overall view as referral vs without referral.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReferralForm today={today} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
