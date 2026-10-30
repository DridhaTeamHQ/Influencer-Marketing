"use client";

import { useActionState, useRef, useTransition } from "react";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import {
  deleteStoreRanking,
  importAppReferrers,
  importPlayUninstalls,
  importReferralCodes,
  importStoreChart,
  saveAppleDeletions,
  type ImportState,
} from "@/lib/stores/actions";
import type { DeletionsTotal } from "@/lib/stores/stats";

type Action = (prev: ImportState, formData: FormData) => Promise<ImportState>;

/** Runs a save or import, shows a toast when it works and clears the form for the next one. */
function useImport(action: Action, title: string, reset = true) {
  const form = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ImportState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.ok) {
      toast.add({ title, description: result.message, type: "success" });
      if (reset) form.current?.reset();
    }
    return result;
  }, {});
  const error = state.ok === false && state.message ? [{ message: state.message }] : undefined;
  return { form, formAction, pending, error };
}

function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Spinner />}
      {children}
    </Button>
  );
}

function CsvField({ id, error, description }: { id: string; error?: { message: string }[]; description?: string }) {
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>CSV file</FieldLabel>
      <Input id={id} name="file" type="file" accept=".csv,text/csv" required aria-invalid={!!error} />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={error} />
    </Field>
  );
}

const STORE_ITEMS = [
  { value: "GOOGLE_PLAY", label: "Play Store" },
  { value: "APP_STORE", label: "App Store" },
];

function StoreField() {
  return (
    <Field>
      <FieldLabel>Store</FieldLabel>
      <Select name="store" items={STORE_ITEMS} defaultValue="GOOGLE_PLAY">
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STORE_ITEMS.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/** A store's top-chart list for today; our app's place in it becomes today's ranking. */
export function ChartForm() {
  const { form, formAction, pending, error } = useImport(importStoreChart, "Chart list saved");
  return (
    <form ref={form} action={formAction} className="space-y-4">
      <FieldGroup className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <StoreField />
        <CsvField
          id="chart-file"
          error={error}
          description="Saved with today’s date. Uploading the same store again today replaces today’s list."
        />
      </FieldGroup>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>Upload list</SubmitButton>
      </div>
    </form>
  );
}

export function DeleteRankingButton({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Delete ${label}`}
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete ${label}?`)) return;
        start(async () => {
          await deleteStoreRanking(id);
          toast.add({ title: "Ranking deleted", type: "success" });
        });
      }}
    >
      {pending ? <Spinner /> : <Trash2Icon />}
    </Button>
  );
}

/** App Store Connect's all-time deletions; only what Apple's report leaves out is added. */
export function DeletionsTotalForm({ current, yesterday }: { current: DeletionsTotal | null; yesterday: string }) {
  const { form, formAction, pending, error } = useImport(saveAppleDeletions, "Deletions saved", false);
  return (
    <form ref={form} action={formAction} className="space-y-4">
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!error || undefined}>
          <FieldLabel htmlFor="deletions-total">Total deletions (all time)</FieldLabel>
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
      </FieldGroup>
      <FieldDescription>
        {current
          ? `Apple’s report has ${current.reported} up to ${current.asOf}, so ${current.leftOut} are added on that day. Leave the total empty and save to remove it.`
          : "The last day App Store Connect’s total includes, usually yesterday."}
      </FieldDescription>
      <FieldError errors={error} />
      <div className="flex justify-end">
        <SubmitButton pending={pending}>Save deletions</SubmitButton>
      </div>
    </form>
  );
}

export function AppReferrerForm() {
  const { form, formAction, pending, error } = useImport(importAppReferrers, "App referrers imported");
  return (
    <form ref={form} action={formAction} className="space-y-4">
      <CsvField
        id="referrer-file"
        error={error}
        description="For the days in the file these replace Apple’s API numbers. Uploading the same days again replaces them."
      />
      <div className="flex justify-end">
        <SubmitButton pending={pending}>Import</SubmitButton>
      </div>
    </form>
  );
}

export function PlayUninstallsForm() {
  const { form, formAction, pending, error } = useImport(importPlayUninstalls, "Uninstalls imported");
  return (
    <form ref={form} action={formAction} className="space-y-4">
      <CsvField
        id="uninstalls-file"
        error={error}
        description="Days in the file replace earlier imports for the same days. Country or source columns are added up."
      />
      <div className="flex justify-end">
        <SubmitButton pending={pending}>Import</SubmitButton>
      </div>
    </form>
  );
}

export function ReferralForm({ today }: { today: string }) {
  const { form, formAction, pending, error } = useImport(importReferralCodes, "Referral usage saved");
  return (
    <form ref={form} action={formAction} className="space-y-4">
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="referral-date">Usage as of</FieldLabel>
          <Input id="referral-date" name="date" type="date" max={today} defaultValue={today} required />
          <FieldDescription>The day you downloaded the CSV. Uploading the same day again replaces it.</FieldDescription>
        </Field>
        <CsvField id="referral-file" error={error} />
      </FieldGroup>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>Upload</SubmitButton>
      </div>
    </form>
  );
}
