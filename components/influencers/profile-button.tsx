import { ExternalLinkIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SocialPlatform } from "@/lib/generated/prisma/enums";
import { PLATFORM_LABELS, profileUrl } from "@/lib/format";

function InstagramGlyph(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

/** Opens the influencer's profile (Instagram, YouTube, …) in a new tab. */
export function ProfileButton({
  platform,
  handle,
  showLabel = false,
}: {
  platform: SocialPlatform;
  handle: string | null;
  showLabel?: boolean;
}) {
  const url = profileUrl(platform, handle);
  if (!url) return null;

  const label = `Open @${handle} on ${PLATFORM_LABELS[platform]}`;
  const icon = platform === "INSTAGRAM" ? <InstagramGlyph /> : <ExternalLinkIcon />;
  const link = <a href={url} target="_blank" rel="noopener noreferrer" aria-label={label} />;

  if (showLabel) {
    return (
      <Button variant="outline" nativeButton={false} render={link}>
        {icon}
        {PLATFORM_LABELS[platform]}
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={<a href={url} target="_blank" rel="noopener noreferrer" aria-label={label} />}
        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
      >
        {icon}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
