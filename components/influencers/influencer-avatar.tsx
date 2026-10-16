import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Each influencer keeps the same color everywhere, picked from the theme's chart palette. */
const TONES = [
  "bg-chart-1/15 text-chart-1",
  "bg-chart-2/15 text-chart-2",
  "bg-chart-3/15 text-chart-3 dark:text-chart-3",
  "bg-chart-4/25 text-foreground",
  "bg-chart-5/20 text-foreground",
  "bg-primary/10 text-primary dark:bg-primary/30 dark:text-primary-foreground",
];

function toneFor(seed: string) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

export function InfluencerAvatar({
  name,
  seed,
  size = "default",
  className,
}: {
  name: string;
  /** Stable value (e.g. the influencer id) so renaming doesn't change the color. */
  seed?: string;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} className={className}>
      <AvatarFallback className={cn("font-medium", toneFor(seed ?? name))}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
