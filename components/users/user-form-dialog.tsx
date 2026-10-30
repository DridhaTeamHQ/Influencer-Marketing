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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import type { FormState } from "@/app/actions";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/roles";
import { createUser, updateUser } from "@/lib/users/actions";

export type UserFormValues = { id: string; name: string; email: string; role: Role };

export function UserFormDialog({
  user,
  roles,
  roleLocked = false,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  /** Pass to edit an existing login; omit to create. */
  user?: UserFormValues;
  /** Roles the signed-in user may give. */
  roles: Role[];
  /** Your own login: the role can't be changed. */
  roleLocked?: boolean;
  /** Omit when opening it from elsewhere (e.g. a menu) with `open` / `onOpenChange`. */
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const action = user ? updateUser.bind(null, user.id) : createUser;
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
  const roleItems = roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  const [role, setRole] = useState<Role>(user?.role ?? "CREATOR");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? "Edit login" : "Add login"}</DialogTitle>
          <DialogDescription>
            {user
              ? "Changes to their role apply straight away."
              : "Share the email and password with them. They can sign in right away."}
          </DialogDescription>
        </DialogHeader>

        <form key={JSON.stringify(state.values ?? {})} action={formAction} className="space-y-6">
          <FieldGroup className="gap-4">
            <Field data-invalid={!!err("name") || undefined}>
              <FieldLabel htmlFor="user-name">Name</FieldLabel>
              <Input id="user-name" name="name" defaultValue={v("name", user?.name)} placeholder="Priya Sharma" required aria-invalid={!!err("name")} />
              <FieldError errors={err("name")} />
            </Field>

            <Field data-invalid={!!err("email") || undefined}>
              <FieldLabel htmlFor="user-email">Email</FieldLabel>
              <Input
                id="user-email"
                name="email"
                type="email"
                defaultValue={v("email", user?.email)}
                placeholder="priya@dailymattr.com"
                autoComplete="off"
                required
                aria-invalid={!!err("email")}
              />
              <FieldError errors={err("email")} />
            </Field>

            <Field data-invalid={!!err("role") || undefined}>
              <FieldLabel>Role</FieldLabel>
              {roleLocked ? (
                <>
                  <input type="hidden" name="role" value={user?.role} />
                  <Input value={ROLE_LABELS[user!.role]} disabled />
                </>
              ) : (
                <Select
                  name="role"
                  items={roleItems}
                  defaultValue={v("role", user?.role ?? "CREATOR")}
                  onValueChange={(value) => setRole(value as Role)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleItems.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FieldDescription>
                {roleLocked ? "You can't change your own role." : ROLE_DESCRIPTIONS[role]}
              </FieldDescription>
              <FieldError errors={err("role")} />
            </Field>

            <Field data-invalid={!!err("password") || undefined}>
              <FieldLabel htmlFor="user-password">{user ? "New password" : "Password"}</FieldLabel>
              <Input
                id="user-password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder={user ? "Leave empty to keep it" : undefined}
                required={!user}
                minLength={8}
                aria-invalid={!!err("password")}
              />
              <FieldDescription>
                {user ? "Setting a new one signs them out everywhere." : "At least 8 characters."}
              </FieldDescription>
              <FieldError errors={err("password")} />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              {user ? "Save changes" : "Add login"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
