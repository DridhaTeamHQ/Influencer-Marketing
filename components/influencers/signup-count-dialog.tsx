"use client";

import { useActionState, useState, useTransition } from "react";
import { Trash2Icon } from "lucide-react";
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
import { deleteSignupCount, saveSignupCount, type FormState } from "@/app/actions";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Add or edit the signup count for one day, as shown in the referral portal. */
export function SignupCountDialog({
  influencerId,
  referralCode,
  entry,
  trigger,
}: {
  influencerId: string;
  referralCode: string;
  /** Pass to edit an existing day. */
  entry?: { date: string; count: number; note: string | null };
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await saveSignupCount(influencerId, prev, formData);
    if (result.ok) {
      setOpen(false);
      toast.add({ title: result.message, type: "success" });
    }
    return result;
  }, {});

  const err = (key: string) => state.errors?.[key]?.map((message) => ({ message }));
  const v = (key: string, saved?: string | null) => state.values?.[key] ?? saved ?? "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit signups" : "Update signups"}</DialogTitle>
          <DialogDescription>
            Enter how many people signed up with <span className="font-mono font-medium">{referralCode}</span> on
            this day, from the referral portal. Saving a day again replaces its number.
          </DialogDescription>
        </DialogHeader>

        <form key={JSON.stringify(state.values ?? {})} action={formAction} className="space-y-6">
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!err("date") || undefined}>
                <FieldLabel htmlFor="date">Date</FieldLabel>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  max={todayLocal()}
                  defaultValue={v("date", entry?.date ?? todayLocal())}
                  readOnly={!!entry}
                  required
                  aria-invalid={!!err("date")}
                />
                <FieldError errors={err("date")} />
              </Field>
              <Field data-invalid={!!err("count") || undefined}>
                <FieldLabel htmlFor="count">Signups</FieldLabel>
                <Input
                  id="count"
                  name="count"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  defaultValue={v("count", entry?.count.toString())}
                  placeholder="0"
                  required
                  autoFocus
                  aria-invalid={!!err("count")}
                />
                <FieldError errors={err("count")} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="note">Note</FieldLabel>
              <Input id="note" name="note" defaultValue={v("note", entry?.note)} placeholder="Optional" />
              <FieldDescription>For example, which portal report you copied this from.</FieldDescription>
            </Field>
          </FieldGroup>

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

export function DeleteSignupCountButton({ id, label }: { id: string; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Delete ${label}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await deleteSignupCount(id);
          toast.add({ title: `Removed ${label}` });
        })
      }
    >
      {pending ? <Spinner /> : <Trash2Icon />}
    </Button>
  );
}
