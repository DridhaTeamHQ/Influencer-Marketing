import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  change,
  hint,
}: {
  label: string;
  value: string;
  /** Percent change vs previous period; null means "new" (previous was 0). */
  change?: number | null;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {change !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              change === null || change > 0 ? "text-primary" : change < 0 ? "text-destructive" : "",
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
                {Math.abs(change)}%
              </>
            )}
          </span>
        )}
        {hint && <span>{hint}</span>}
      </CardContent>
    </Card>
  );
}
