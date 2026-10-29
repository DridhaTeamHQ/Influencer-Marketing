"use client";

import { useActionState, useState } from "react";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { saveAppleDeletions, type ImportState } from "@/lib/stores/actions";
import type { DeletionGap } from "@/lib/stores/stats";

const shortDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Pencil on the Deletions card: type in App Store Connect's deletions for days Apple's report doesn't cover yet. */
export function AppleDeletionsDialog({ gap }: { gap: DeletionGap }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ImportState, FormData>(async (prev, formData) => {
    const result = await saveAppleDeletions(prev, formData);
    if (result.ok) {
      setOpen(false);
      toast.add({ title: "Deletions saved", description: result.message, type: "success" });
    }
    return result;
  }, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<button type="button" />}
        aria-label="Enter App Store deletions Apple hasn’t reported yet"
        className="inline-flex cursor-pointer text-muted-foreground/70 hover:text-foreground"
      >
        <PencilIcon className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enter App Store deletions</DialogTitle>
          <DialogDescription>
            {gap.appleUntil
              ? `Apple’s report stops at ${shortDate(gap.appleUntil)}.`
              : "Apple hasn’t sent its report yet."}{" "}
            Copy each day from App Store Connect → Analytics → Metrics → Deletions. These count in deletions, net and
            active installs, and Apple’s own numbers replace them automatically when its report arrives.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-6">
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {gap.days.map((d) => (
              <label key={d.date} className="flex items-center justify-between gap-4 text-sm">
                <span className="text-muted-foreground">{shortDate(d.date)}</span>
                <Input
                  name={`d-${d.date}`}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  defaultValue={d.value ?? ""}
                  placeholder="—"
                  className="h-8 w-24 text-right tabular-nums"
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Leave a day empty if you don’t know it; it counts as 0.</p>
          <FieldError errors={state.ok === false && state.message ? [{ message: state.message }] : undefined} />

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
