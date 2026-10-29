import { InfoIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Accuracy } from "@/lib/stores/stats";

const LABELS: Record<Accuracy, { label: string; explain: string }> = {
  exact: {
    label: "Exact",
    explain: "Same number as Play Console / App Store Connect.",
  },
  partial: {
    label: "Partial",
    explain:
      "The store’s own number, but some is missing: Apple leaves out small numbers for privacy, and recent days may not be reported yet. Shows less than the console.",
  },
  estimate: {
    label: "Estimate",
    explain: "Worked out here from other numbers; the store doesn’t report it, so the console won’t show the same value.",
  },
};

/** An "i" icon that says on hover whether a number matches the store's console, and why. */
export function AccuracyInfo({ accuracy, reason }: { accuracy: Accuracy; reason?: string }) {
  const { label, explain } = LABELS[accuracy];
  return (
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" />}
        aria-label={`${label}: ${reason ?? explain}`}
        className="inline-flex cursor-default text-muted-foreground/70 hover:text-foreground"
      >
        <InfoIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-72 space-y-1">
        <p className="font-medium">{label}</p>
        <p>{reason ?? explain}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** An "i" icon next to a heading that shows notes about where the numbers come from. */
export function NotesInfo({ notes, label = "About these numbers" }: { notes: string[]; label?: string }) {
  if (!notes.length) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" />}
        aria-label={label}
        className="inline-flex cursor-default align-middle text-muted-foreground/70 hover:text-foreground"
      >
        <InfoIcon className="size-4" />
      </TooltipTrigger>
      <TooltipContent className="max-w-96 space-y-2 text-left">
        {notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
