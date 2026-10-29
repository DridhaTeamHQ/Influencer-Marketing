"use client";

import { useTransition } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppStore } from "@/lib/generated/prisma/enums";
import { syncStoreNow } from "@/lib/stores/actions";
import { cn } from "@/lib/utils";

export function SyncButton({ stores, path }: { stores: AppStore[]; path: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="outline" disabled={pending} onClick={() => startTransition(() => syncStoreNow(stores, path))}>
      <RefreshCwIcon data-icon="inline-start" className={cn(pending && "animate-spin")} />
      {pending ? "Syncing…" : "Sync now"}
    </Button>
  );
}
