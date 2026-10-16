import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Accent colors match the chart series: Android, iOS, others, signups. */
const ACCENTS = {
  primary: "bg-primary/10 text-primary dark:bg-primary/30 dark:text-primary-foreground",
  android: "bg-chart-2/15 text-chart-2",
  ios: "bg-chart-1/15 text-chart-1",
  others: "bg-chart-3/15 text-chart-3",
  signups: "bg-chart-4/25 text-foreground",
} as const;

export function StatCard({
  label,
  value,
  change,
  hint,
  icon,
  accent = "primary",
}: {
  label: string;
  value: string;
  /** Percent change vs previous period; null means "new" (previous was 0). */
  change?: number | null;
  hint?: string;
  icon?: React.ReactNode;
  accent?: keyof typeof ACCENTS;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
        {icon && (
          <CardAction>
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-lg [&_svg]:size-4",
                ACCENTS[accent],
              )}
            >
              {icon}
            </span>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {change !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium",
              change === null || change > 0
                ? "bg-primary/10 text-primary dark:bg-primary/30 dark:text-primary-foreground"
                : change < 0
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-foreground",
            )}
          >
            {change === null ? (
              "New"
            ) : (
              <>
                {change > 0 ? (
                  <ArrowUpRightIcon className="size-3" />
                ) : change < 0 ? (
                  <ArrowDownRightIcon className="size-3" />
                ) : null}
                {Math.abs(change) > 999 ? ">999" : Math.abs(change)}%
              </>
            )}
          </span>
        )}
        {hint && <span className="truncate">{hint}</span>}
      </CardContent>
    </Card>
  );
}
