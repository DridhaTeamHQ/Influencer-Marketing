import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { STORE_RANGES, type StoreRange, type StoreRangeKey } from "@/lib/stores/range";

/** Quick ranges (week, month, 3 and 6 months) plus a custom from–to, all as links / a GET form. */
export function StoreRangeFilter({ range, basePath }: { range: StoreRange; basePath: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ButtonGroup aria-label="Date range">
        {(Object.keys(STORE_RANGES) as StoreRangeKey[]).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={key === range.key ? "secondary" : "outline"}
            nativeButton={false}
            render={<Link href={`${basePath}?range=${key}`} scroll={false} />}
            aria-current={key === range.key ? "page" : undefined}
          >
            {STORE_RANGES[key].label}
          </Button>
        ))}
      </ButtonGroup>
      <form action={basePath} className="flex flex-wrap items-center gap-1.5">
        <Input
          type="date"
          name="from"
          defaultValue={range.from}
          aria-label="From"
          className="h-8 w-auto"
          required
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" name="to" defaultValue={range.to} aria-label="To" className="h-8 w-auto" required />
        <Button type="submit" size="sm" variant={range.key === "custom" ? "secondary" : "outline"}>
          Apply
        </Button>
      </form>
    </div>
  );
}
