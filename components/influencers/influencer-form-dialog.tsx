"use client";

import { useActionState, useState } from "react";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { createInfluencer, updateInfluencer, type FormState } from "@/app/actions";
import { PLATFORM_LABELS } from "@/lib/format";

const platformItems = Object.entries(PLATFORM_LABELS).map(([value, label]) => ({ value, label }));

export type InfluencerFormValues = {
  id: string;
  name: string;
  handle: string | null;
  email: string | null;
  platform: string;
  followers: number | null;
  notes: string | null;
};

export function InfluencerFormDialog({
  influencer,
  trigger,
}: {
  /** Pass to edit an existing influencer; omit to create. */
  influencer?: InfluencerFormValues;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const action = influencer ? updateInfluencer.bind(null, influencer.id) : createInfluencer;
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.ok) {
        setOpen(false);
        toast.add({ title: result.message, type: "success" });
      }
      return result;
    },
    {},
  );


  const err = (key: string) => state.errors?.[key]?.map((message) => ({ message }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{influencer ? "Edit influencer" : "Add influencer"}</DialogTitle>
          <DialogDescription>
            {influencer
              ? "Update their details. Their tracking link stays the same."
              : "A unique download link is generated automatically. Android and iOS clicks are tracked separately."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-6">
          <FieldGroup className="gap-4">
            <Field data-invalid={!!err("name") || undefined}>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" name="name" defaultValue={influencer?.name} placeholder="Priya Sharma" required aria-invalid={!!err("name")} />
              <FieldError errors={err("name")} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Platform</FieldLabel>
                <Select name="platform" items={platformItems} defaultValue={influencer?.platform ?? "INSTAGRAM"}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {platformItems.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field data-invalid={!!err("handle") || undefined}>
                <FieldLabel htmlFor="handle">Handle</FieldLabel>
                <Input id="handle" name="handle" defaultValue={influencer?.handle ?? ""} placeholder="@priya" />
                <FieldError errors={err("handle")} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!err("email") || undefined}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" name="email" type="email" defaultValue={influencer?.email ?? ""} placeholder="Optional" aria-invalid={!!err("email")} />
                <FieldError errors={err("email")} />
              </Field>
              <Field data-invalid={!!err("followers") || undefined}>
                <FieldLabel htmlFor="followers">Followers</FieldLabel>
                <Input id="followers" name="followers" type="number" min={0} inputMode="numeric" defaultValue={influencer?.followers ?? ""} placeholder="Optional" />
                <FieldError errors={err("followers")} />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="notes">Notes</FieldLabel>
              <Textarea id="notes" name="notes" defaultValue={influencer?.notes ?? ""} placeholder="Deal terms, contact info…" rows={3} />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              {influencer ? "Save changes" : "Create & generate link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
