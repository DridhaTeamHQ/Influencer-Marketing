"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setPartnerLinkActive } from "@/app/actions";

export function PartnerLinkSwitch({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={isActive}
      disabled={pending}
      aria-label={isActive ? "Stop tracking this link" : "Track this link"}
      onCheckedChange={(checked) => startTransition(() => setPartnerLinkActive(id, checked))}
    />
  );
}
