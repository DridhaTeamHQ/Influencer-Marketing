"use client";

import { useTransition } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { refreshTrends } from "@/lib/social/actions";
import type { PlatformKey } from "@/lib/social/overview";
import { cn } from "@/lib/utils";

/** Asks the AI to look at this platform's videos again; the page refreshes with the new tile. */
export function RefreshTrendsButton({ platform }: { platform: PlatformKey }) {
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const result = await refreshTrends(platform).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Try again." }));
      if (!result.ok) toast.add({ title: "Couldn't refresh trends", description: result.error });
    });
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon-sm" onClick={refresh} disabled={pending} aria-label="Refresh trends with AI" />}
      >
        <RefreshCwIcon className={cn(pending && "animate-spin")} />
      </TooltipTrigger>
      <TooltipContent>{pending ? "AI is checking our latest videos…" : "Refresh with AI"}</TooltipContent>
    </Tooltip>
  );
}
