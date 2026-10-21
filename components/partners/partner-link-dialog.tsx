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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { updatePartnerLink, type FormState } from "@/app/actions";

export function PartnerLinkDialog({
  link,
  linkPrefix,
  trigger,
}: {
  link: { id: string; name: string; slug: string; destinationUrl: string };
  /** Shown before the link name, e.g. "yoursite.com/go/". */
  linkPrefix: string;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await updatePartnerLink(link.id, prev, formData);
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
  const v = (key: string, saved: string) => state.values?.[key] ?? saved;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit link</DialogTitle>
          <DialogDescription>Change the link name or where it sends visitors. Past clicks are kept.</DialogDescription>
        </DialogHeader>

        <form key={JSON.stringify(state.values ?? {})} action={formAction} className="space-y-6">
          <FieldGroup className="gap-4">
            <Field data-invalid={!!err("name") || undefined}>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" name="name" defaultValue={v("name", link.name)} required aria-invalid={!!err("name")} />
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
                  defaultValue={v("slug", link.slug)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="pl-0"
                  aria-invalid={!!err("slug")}
                />
              </InputGroup>
              <FieldDescription>Changing this breaks the old link, so share the new one.</FieldDescription>
              <FieldError errors={err("slug")} />
            </Field>

            <Field data-invalid={!!err("destinationUrl") || undefined}>
              <FieldLabel htmlFor="destinationUrl">Opens</FieldLabel>
              <Input
                id="destinationUrl"
                name="destinationUrl"
                type="url"
                defaultValue={v("destinationUrl", link.destinationUrl)}
                required
                aria-invalid={!!err("destinationUrl")}
              />
              <FieldDescription>Where visitors go after the click is counted.</FieldDescription>
              <FieldError errors={err("destinationUrl")} />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
