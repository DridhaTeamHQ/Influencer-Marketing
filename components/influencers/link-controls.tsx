"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setLinkActive } from "@/app/actions";

export function LinkActiveSwitch({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={isActive}
      disabled={pending}
      aria-label={isActive ? "Stop tracking this link" : "Track this link"}
      onCheckedChange={(checked) => startTransition(() => setLinkActive(id, checked))}
    />
  );
}

