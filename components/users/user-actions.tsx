"use client";

import { useState, useTransition } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { UserFormDialog, type UserFormValues } from "@/components/users/user-form-dialog";
import type { Role } from "@/lib/roles";
import { deleteUser, setUserActive } from "@/lib/users/actions";

export function UserActions({
  user,
  isActive,
  isSelf,
  roles,
}: {
  user: UserFormValues;
  isActive: boolean;
  /** Your own login can be edited, but not paused, deleted or given another role. */
  isSelf: boolean;
  roles: Role[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<void>, title: string) {
    startTransition(async () => {
      try {
        await task();
        toast.add({ title });
      } catch {
        toast.add({ title: "That didn't work. Refresh and try again.", type: "error" });
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.name}`} />}>
          {pending ? <Spinner /> : <MoreHorizontalIcon />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
          {!isSelf && (
            <>
              <DropdownMenuItem
                onClick={() =>
                  run(
                    () => setUserActive(user.id, !isActive),
                    isActive ? `${user.name} can no longer sign in` : `${user.name} can sign in again`,
                  )
                }
              >
                {isActive ? "Pause login" : "Allow sign in"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <UserFormDialog user={user} roles={roles} roleLocked={isSelf} open={editOpen} onOpenChange={setEditOpen} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {user.name}?</DialogTitle>
            <DialogDescription>
              They&apos;re signed out straight away and can&apos;t sign in again. Pause the login instead if they may come back.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setConfirmOpen(false);
                run(() => deleteUser(user.id), `${user.name} deleted`);
              }}
            >
              {pending && <Spinner />}
              Delete login
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
