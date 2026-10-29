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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { importReferralCodes, type ImportState } from "@/lib/stores/actions";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Uploads the referral portal's referral-codes CSV; only its total usage is saved. */
export function ReferralUploadDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ImportState, FormData>(async (prev, formData) => {
    const result = await importReferralCodes(prev, formData);
    if (result.ok) {
      setOpen(false);
      toast.add({ title: "Referral usage saved", description: result.message, type: "success" });
    }
    return result;
  }, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <UploadIcon data-icon="inline-start" />
        Upload referral CSV
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload referral codes</DialogTitle>
          <DialogDescription>
            Export the referral codes CSV from the referral portal. The “Usage Count” column is added up and only that
            total is saved for the date below. The file itself isn’t kept.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-6">
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="referral-date">Usage as of</FieldLabel>
              <Input id="referral-date" name="date" type="date" max={todayLocal()} defaultValue={todayLocal()} required />
              <FieldDescription>The day you downloaded the CSV. Uploading the same day again replaces it.</FieldDescription>
            </Field>
            <Field data-invalid={state.ok === false || undefined}>
              <FieldLabel htmlFor="referral-file">CSV file</FieldLabel>
              <Input
                id="referral-file"
                name="file"
                type="file"
                accept=".csv,text/csv"
                required
                aria-invalid={state.ok === false}
              />
              <FieldError errors={state.ok === false && state.message ? [{ message: state.message }] : undefined} />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
