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
import { importPlayUninstalls, type ImportState } from "@/lib/stores/actions";

/** Uploads a Play Console "Users lost" CSV export as daily uninstalls. */
export function ImportUninstallsDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ImportState, FormData>(async (prev, formData) => {
    const result = await importPlayUninstalls(prev, formData);
    if (result.ok) {
      setOpen(false);
      toast.add({ title: "Uninstalls imported", description: result.message, type: "success" });
    }
    return result;
  }, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <UploadIcon data-icon="inline-start" />
        Import CSV
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import uninstalls</DialogTitle>
          <DialogDescription>
            Until Google publishes install reports for this app, you can bring in uninstalls from a Play Console export.
          </DialogDescription>
        </DialogHeader>

        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Play Console → your app → Statistics.</li>
          <li>
            Pick the metric <span className="font-medium text-foreground">Users lost</span> (or All users lost) and set the
            interval to <span className="font-medium text-foreground">Daily</span>.
          </li>
          <li>Choose the dates you want, then Export report → CSV.</li>
        </ol>

        <form action={formAction} className="space-y-6">
          <Field data-invalid={state.ok === false || undefined}>
            <FieldLabel htmlFor="file">CSV file</FieldLabel>
            <Input id="file" name="file" type="file" accept=".csv,text/csv" required aria-invalid={state.ok === false} />
            <FieldDescription>
              Days in the file replace earlier imports for the same days. Country or source columns are added up.
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
