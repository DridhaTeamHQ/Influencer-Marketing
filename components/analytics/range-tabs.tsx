import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { RANGES, type RangeKey } from "@/lib/analytics";

export function RangeTabs({ value, basePath }: { value: RangeKey; basePath: string }) {
  return (
    <ButtonGroup aria-label="Date range">
      {(Object.keys(RANGES) as RangeKey[]).map((key) => (
        <Button
          key={key}
          size="sm"
          variant={key === value ? "secondary" : "outline"}
          nativeButton={false}
          render={<Link href={`${basePath}?range=${key}`} scroll={false} />}
          aria-current={key === value ? "page" : undefined}
        >
          {RANGES[key]} days
        </Button>
      ))}
    </ButtonGroup>
  );
}
