"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
import { deleteInfluencer, setInfluencerActive } from "@/app/actions";

export function InfluencerActions({
  id,
  name,
  isActive,
  showView = true,
}: {
  id: string;
  name: string;
  isActive: boolean;
  showView?: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      await setInfluencerActive(id, !isActive);
      toast.add({
        title: isActive ? `${name} paused` : `${name} reactivated`,
        description: isActive ? "Their links still redirect, but clicks aren't counted." : undefined,
      });
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`} />}
        >
          {pending ? <Spinner /> : <MoreHorizontalIcon />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {showView && (
            <DropdownMenuItem render={<Link href={`/influencers/${id}`} />}>View analytics</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={toggleActive}>{isActive ? "Pause tracking" : "Resume tracking"}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              Their tracking links will stop working and all click history will be removed. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => startTransition(() => deleteInfluencer(id))}
            >
              {pending && <Spinner />}
              Delete influencer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
