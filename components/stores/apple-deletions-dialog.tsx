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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { saveAppleDeletions, type ImportState } from "@/lib/stores/actions";
import type { DeletionsTotal } from "@/lib/stores/stats";

/**
 * Pencil on the Deletions card: type in App Store Connect's all-time deletions. Apple's report
 * leaves out small numbers, so only the difference is added on top of it.
 */
export function AppleDeletionsDialog({ current, yesterday }: { current: DeletionsTotal | null; yesterday: string }) {
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
        aria-label="Enter App Store Connect’s all-time deletions"
        className="inline-flex cursor-pointer text-muted-foreground/70 hover:text-foreground"
      >
        <PencilIcon className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>All-time App Store deletions</DialogTitle>
          <DialogDescription>
            In App Store Connect → Analytics → Metrics → Deletions, choose all dates and copy the total. Apple’s report
            here leaves out small numbers, so only the difference is added; deletions, net and active installs then match.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="deletions-total">Total deletions</FieldLabel>
              <Input
                id="deletions-total"
                name="total"
                type="number"
                min={0}
                inputMode="numeric"
                defaultValue={current?.total ?? ""}
                placeholder="e.g. 55"
                className="tabular-nums"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="deletions-date">Up to</FieldLabel>
              <Input id="deletions-date" name="date" type="date" max={yesterday} defaultValue={current?.asOf ?? yesterday} />
            </Field>
          </div>
          <FieldDescription>
            {current
              ? `Apple’s report has ${current.reported} up to ${current.asOf}, so ${current.leftOut} are added. Leave the total empty to remove it.`
              : "The last day App Store Connect’s total includes, usually yesterday."}
          </FieldDescription>
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
