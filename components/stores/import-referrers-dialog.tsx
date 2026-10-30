"use client";

import { useActionState, useState } from "react";
import { UploadIcon } from "lucide-react";
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
import { importAppReferrers, type ImportState } from "@/lib/stores/actions";

/** Uploads App Store Connect's "By App Referrer" CSV, for the small numbers Apple's API leaves out. */
export function ImportReferrersDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ImportState, FormData>(async (prev, formData) => {
    const result = await importAppReferrers(prev, formData);
    if (result.ok) {
      setOpen(false);
      toast.add({ title: "App referrers imported", description: result.message, type: "success" });
    }
    return result;
  }, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <UploadIcon data-icon="inline-start" />
        Import CSV
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import app referrers</DialogTitle>
          <DialogDescription>
            Apple’s API leaves out apps with only a few downloads. App Store Connect’s own export has all of them.
          </DialogDescription>
        </DialogHeader>

        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>App Store Connect → your app → Analytics → Metrics.</li>
          <li>
            Pick <span className="font-medium text-foreground">Total Downloads</span>, then{" "}
            <span className="font-medium text-foreground">By App Referrer</span>, and set the chart to{" "}
            <span className="font-medium text-foreground">Days</span>.
          </li>
          <li>Choose the dates, then ••• → Export as CSV.</li>
        </ol>

        <form action={formAction} className="space-y-6">
          <Field data-invalid={state.ok === false || undefined}>
            <FieldLabel htmlFor="referrer-file">CSV file</FieldLabel>
            <Input
              id="referrer-file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
              aria-invalid={state.ok === false}
            />
            <FieldDescription>
              For the days in the file these numbers replace Apple’s API numbers. Uploading the same days again replaces them.
            </FieldDescription>
            <FieldError errors={state.ok === false && state.message ? [{ message: state.message }] : undefined} />
          </Field>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
