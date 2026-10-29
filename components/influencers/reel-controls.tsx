"use client";

import { useActionState, useState, useTransition } from "react";
import { RefreshCwIcon, Trash2Icon } from "lucide-react";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { addReels, deleteReel, fetchAllReels, fetchReel, type FormState } from "@/app/actions";
import { REEL_FETCHES_PER_DAY } from "@/lib/reels";
import { cn } from "@/lib/utils";

/** Paste one or more Reel links for an influencer. Their numbers are fetched later with Fetch. */
export function AddReelsDialog({ influencerId, trigger }: { influencerId: string; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await addReels(influencerId, prev, formData);
    if (result.ok) {
      setOpen(false);
      toast.add({ title: result.message, type: "success" });
    }
    return result;
  }, {});
  const err = state.errors?.reels?.map((message) => ({ message }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add reels</DialogTitle>
          <DialogDescription>
            Paste Instagram Reel links. Click Fetch afterwards to get their views, likes and comments.
          </DialogDescription>
        </DialogHeader>
        <form key={JSON.stringify(state.values ?? {})} action={formAction} className="space-y-6">
          <Field data-invalid={!!err || undefined}>
            <FieldLabel htmlFor="add-reels">Reel links</FieldLabel>
            <Textarea
              id="add-reels"
              name="reels"
              defaultValue={state.values?.reels ?? ""}
              placeholder="https://www.instagram.com/reel/ABC123/"
              rows={4}
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={!!err}
            />
            <FieldDescription>One link per line. Links already added are skipped.</FieldDescription>
            <FieldError errors={err} />
          </Field>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function useFetchAction(run: () => Promise<{ ok: boolean; message: string }>) {
  const [pending, startTransition] = useTransition();
  const start = () =>
    startTransition(async () => {
      const result = await run();
      toast.add({ title: result.message, type: result.ok ? "success" : "error" });
    });
  return [pending, start] as const;
}

const limitTitle = (left: number) =>
  left > 0
    ? `${left} of ${REEL_FETCHES_PER_DAY} fetches left today`
    : `Fetched ${REEL_FETCHES_PER_DAY} times today. Available again tomorrow.`;

/** Fetches the latest numbers for one Reel from Instaflow. Limited to a few fetches a day. */
export function FetchReelButton({ id, fetchesLeft }: { id: string; fetchesLeft: number }) {
  const [pending, start] = useFetchAction(() => fetchReel(id));
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || fetchesLeft === 0}
      onClick={start}
      title={limitTitle(fetchesLeft)}
    >
      <RefreshCwIcon data-icon="inline-start" className={cn(pending && "animate-spin")} />
      {pending ? "Fetching…" : "Fetch"}
      {!pending && <span className="text-muted-foreground tabular-nums">{fetchesLeft}/{REEL_FETCHES_PER_DAY}</span>}
    </Button>
  );
}

/** Fetches every Reel that still has fetches left today. `reelsLeft` is how many of them do. */
export function FetchAllReelsButton({ influencerId, reelsLeft }: { influencerId: string; reelsLeft: number }) {
  const [pending, start] = useFetchAction(() => fetchAllReels(influencerId));
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || reelsLeft === 0}
      onClick={start}
      title={
        reelsLeft > 0
          ? `Fetches ${reelsLeft} reel${reelsLeft === 1 ? "" : "s"}; uses one of each reel's ${REEL_FETCHES_PER_DAY} daily fetches`
          : "Every reel was fetched the maximum times today"
      }
    >
      <RefreshCwIcon data-icon="inline-start" className={cn(pending && "animate-spin")} />
      {pending ? "Fetching…" : "Fetch all"}
    </Button>
  );
}

export function DeleteReelButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Remove reel"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await deleteReel(id);
          toast.add({ title: "Reel removed" });
        })
      }
    >
      {pending ? <Spinner /> : <Trash2Icon />}
    </Button>
  );
}
