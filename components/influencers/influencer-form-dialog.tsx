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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { createInfluencer, updateInfluencer, type FormState } from "@/app/actions";
import { PLATFORM_LABELS } from "@/lib/format";

/** Date (stored at UTC midnight) -> "2026-10-16" for <input type="date">. */
const toDateInput = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const platformItems = Object.entries(PLATFORM_LABELS).map(([value, label]) => ({ value, label }));

export type InfluencerFormValues = {
  id: string;
  name: string;
  handle: string | null;
  email: string | null;
  platform: string;
  followers: number | null;
  notes: string | null;
  referralCode?: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  playStoreUrl?: string | null;
  appStoreUrl?: string | null;
  link?: { code: string } | null;
};

export function InfluencerFormDialog({
  influencer,
  trigger,
  linkPrefix,
}: {
  /** Shown before the link name, e.g. "yoursite.com/r/". */
  linkPrefix: string;
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
  // After a failed submit, show what was typed instead of the saved values.
  const v = (key: string, saved?: string | null) => state.values?.[key] ?? saved ?? "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{influencer ? "Edit influencer" : "Add influencer"}</DialogTitle>
          <DialogDescription>
            {influencer
              ? "Update their details. Their tracking link stays the same."
              : "A unique download link is generated automatically. Android and iOS clicks are tracked separately."}
          </DialogDescription>
        </DialogHeader>

        <form key={JSON.stringify(state.values ?? {})} action={formAction} className="space-y-6">
          <FieldGroup className="gap-4">
            <Field data-invalid={!!err("name") || undefined}>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" name="name" defaultValue={v("name", influencer?.name)} placeholder="Priya Sharma" required aria-invalid={!!err("name")} />
              <FieldError errors={err("name")} />
            </Field>

            <Field data-invalid={!!err("slug") || undefined}>
              <FieldLabel htmlFor="slug">Link name</FieldLabel>
              <InputGroup>
                <InputGroupAddon className="pr-0">
                  <InputGroupText className="max-w-52 truncate">{linkPrefix}</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="slug"
                  name="slug"
                  defaultValue={v("slug", influencer?.link?.code)}
                  placeholder={influencer ? undefined : "priya"}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="pl-0"
                  aria-invalid={!!err("slug")}
                />
              </InputGroup>
              <FieldDescription>
                {influencer
                  ? "Changing this breaks the old link, so share the new one."
                  : "Leave empty to use their handle or name."}
              </FieldDescription>
              <FieldError errors={err("slug")} />
            </Field>

            <Field data-invalid={!!err("referralCode") || undefined}>
              <FieldLabel htmlFor="referralCode">Referral code</FieldLabel>
              <Input
                id="referralCode"
                name="referralCode"
                defaultValue={v("referralCode", influencer?.referralCode)}
                placeholder={influencer ? undefined : "PRIYA"}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="font-mono uppercase"
                aria-invalid={!!err("referralCode")}
              />
              <FieldDescription>
                {influencer
                  ? "The code users enter at signup. Update it here if you change it in the referral portal."
                  : "The code users enter at signup. Leave empty to create one from their handle or name."}
              </FieldDescription>
              <FieldError errors={err("referralCode")} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!err("playStoreUrl") || undefined}>
                <FieldLabel htmlFor="playStoreUrl">Android link</FieldLabel>
                <Input
                  id="playStoreUrl"
                  name="playStoreUrl"
                  type="url"
                  defaultValue={v("playStoreUrl", influencer?.playStoreUrl)}
                  placeholder="Default Play Store link"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={!!err("playStoreUrl")}
                />
                <FieldError errors={err("playStoreUrl")} />
              </Field>
              <Field data-invalid={!!err("appStoreUrl") || undefined}>
                <FieldLabel htmlFor="appStoreUrl">iPhone link</FieldLabel>
                <Input
                  id="appStoreUrl"
                  name="appStoreUrl"
                  type="url"
                  defaultValue={v("appStoreUrl", influencer?.appStoreUrl)}
                  placeholder="Default App Store link"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={!!err("appStoreUrl")}
                />
                <FieldError errors={err("appStoreUrl")} />
              </Field>
              <FieldDescription className="sm:col-span-2 -mt-2">
                Optional. Leave empty to use our default store links, tagged with this influencer.
              </FieldDescription>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!err("periodStart") || undefined}>
                <FieldLabel htmlFor="periodStart">Start date</FieldLabel>
                <Input
                  id="periodStart"
                  name="periodStart"
                  type="date"
                  defaultValue={v("periodStart", toDateInput(influencer?.periodStart))}
                  aria-invalid={!!err("periodStart")}
                />
                <FieldError errors={err("periodStart")} />
              </Field>
              <Field data-invalid={!!err("periodEnd") || undefined}>
                <FieldLabel htmlFor="periodEnd">End date</FieldLabel>
                <Input
                  id="periodEnd"
                  name="periodEnd"
                  type="date"
                  defaultValue={v("periodEnd", toDateInput(influencer?.periodEnd))}
                  aria-invalid={!!err("periodEnd")}
                />
                <FieldError errors={err("periodEnd")} />
              </Field>
              <FieldDescription className="sm:col-span-2 -mt-2">
                For reference only. The link stays active until you pause it.
              </FieldDescription>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Platform</FieldLabel>
                <Select name="platform" items={platformItems} defaultValue={v("platform", influencer?.platform ?? "INSTAGRAM")}>
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
                <Input id="handle" name="handle" defaultValue={v("handle", influencer?.handle)} placeholder="@priya" />
                <FieldError errors={err("handle")} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!err("email") || undefined}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" name="email" type="email" defaultValue={v("email", influencer?.email)} placeholder="Optional" aria-invalid={!!err("email")} />
                <FieldError errors={err("email")} />
              </Field>
              <Field data-invalid={!!err("followers") || undefined}>
                <FieldLabel htmlFor="followers">Followers</FieldLabel>
                <Input id="followers" name="followers" type="number" min={0} inputMode="numeric" defaultValue={v("followers", influencer?.followers?.toString())} placeholder="Optional" />
                <FieldError errors={err("followers")} />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="notes">Notes</FieldLabel>
              <Textarea id="notes" name="notes" defaultValue={v("notes", influencer?.notes)} placeholder="Deal terms, contact info…" rows={3} />
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
