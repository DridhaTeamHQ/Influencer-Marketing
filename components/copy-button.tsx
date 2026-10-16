"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export function CopyButton({
  value,
  label = "Copy link",
  size = "icon-sm",
  variant = "ghost",
}: {
  value: string;
  label?: string;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.add({ title: "Copied", description: value, type: "success" });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.add({ title: "Couldn't copy", description: "Copy it manually.", type: "error" });
    }
  }

  const icon = copied ? <CheckIcon /> : <CopyIcon />;
  const iconOnly = typeof size === "string" && size.startsWith("icon");

  return (
    <Button type="button" size={size} variant={variant} onClick={copy} aria-label={label}>
      {icon}
      {!iconOnly && label}
    </Button>
  );
}
