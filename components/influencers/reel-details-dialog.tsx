"use client";

import { useState } from "react";
import { ExternalLinkIcon, FilmIcon } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { FetchReelButton } from "@/components/influencers/reel-controls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, timeAgo } from "@/lib/format";

export type ReelDetails = {
  id: string;
  shortcode: string;
  url: string;
  username: string | null;
  caption: string | null;
  /** Cover image through Instaflow's CDN proxy, or null. */
  thumbnailSrc: string | null;
  publishedAt: Date | null;
  durationSeconds: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  engagementRate: number | null;
  fetchedAt: Date | null;
  fetchError: string | null;
  createdAt: Date;
  /** Newest first. */
  snapshots: { id: string; views: number | null; likes: number | null; comments: number | null; fetchedAt: Date }[];
};

const dateTime = (d: Date) =>
  d.toLocaleString("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const count = (n: number | null) => (n == null ? "—" : formatNumber(n));
/** (part / views) * 100, or null when it can't be worked out. */
const rate = (part: number | null, views: number | null) =>
  part == null || views == null || views <= 0 ? null : (part / views) * 100;
const percent = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}%`);
const signed = (n: number) => `${n > 0 ? "+" : ""}${formatNumber(n)}`;

/** Everything stored about one Reel: cover, caption, numbers, rates and every past fetch. */
export function ReelDetailsDialog({ reel, trigger }: { reel: ReelDetails; trigger: React.ReactElement }) {
  const [imageFailed, setImageFailed] = useState(false);
  const first = reel.snapshots.at(-1);
  const sinceFirst =
    first && reel.snapshots.length > 1 && reel.views != null && first.views != null ? reel.views - first.views : null;

  const stats = [
    { label: "Views", value: count(reel.views) },
    { label: "Likes", value: count(reel.likes) },
    { label: "Comments", value: count(reel.comments) },
    { label: "Engagement", value: percent(reel.engagementRate), hint: "(likes + comments) / views" },
    { label: "Like rate", value: percent(rate(reel.likes, reel.views)), hint: "likes / views" },
    { label: "Comment rate", value: percent(rate(reel.comments, reel.views)), hint: "comments / views" },
  ];

  const details = [
    { label: "Posted", value: reel.publishedAt ? dateTime(reel.publishedAt) : "—" },
    { label: "Duration", value: reel.durationSeconds ? `${Math.round(reel.durationSeconds)} s` : "—" },
    {
      label: "Last fetched",
      value: reel.fetchedAt ? `${dateTime(reel.fetchedAt)} (${timeAgo(reel.fetchedAt)})` : "Never",
    },
    {
      label: "Views since first fetch",
      value: sinceFirst == null ? "—" : `${signed(sinceFirst)} since ${dateTime(first!.fetchedAt)}`,
    },
    { label: "Added", value: dateTime(reel.createdAt) },
  ];

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilmIcon className="size-4 text-primary" />
            {reel.username ? `@${reel.username}` : "Reel"} · <span className="font-mono">{reel.shortcode}</span>
          </DialogTitle>
          <DialogDescription>
            Public numbers from Instaflow{reel.fetchedAt ? `, as of ${dateTime(reel.fetchedAt)}` : ". Not fetched yet"}.
            Shares, saves and reach are only visible to the creator.
          </DialogDescription>
        </DialogHeader>

        {reel.fetchError && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Last fetch failed: {reel.fetchError}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
          {reel.thumbnailSrc && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed Instagram CDN image via Instaflow's proxy
            <img
              src={reel.thumbnailSrc}
              alt={`Cover of reel ${reel.shortcode}`}
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
              className="aspect-[9/16] w-36 rounded-lg border object-cover"
            />
          ) : (
            <div className="flex aspect-[9/16] w-36 items-center justify-center rounded-lg border bg-muted/40 text-xs text-muted-foreground">
              No cover
            </div>
          )}
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2 pl-3">
              <a
                href={reel.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 flex-1 items-center gap-1 font-mono text-xs underline-offset-4 hover:underline"
              >
                <span className="truncate">{reel.url}</span>
                <ExternalLinkIcon className="size-3 shrink-0" />
              </a>
              <CopyButton value={reel.url} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Caption</p>
              <p className="max-h-40 overflow-y-auto text-sm whitespace-pre-wrap">
                {reel.caption ?? <span className="text-muted-foreground">No caption</span>}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-lg font-semibold tabular-nums">{s.value}</p>
              {s.hint && <p className="text-[11px] text-muted-foreground">{s.hint}</p>}
            </div>
          ))}
        </div>

        <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
          {details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd>{d.value}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">Fetch history</p>
            <FetchReelButton id={reel.id} />
          </div>
          {reel.snapshots.length === 0 ? (
            <p className="rounded-lg border py-4 text-center text-sm text-muted-foreground">
              No fetches yet. Click Fetch to get the numbers.
            </p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-3">Fetched</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">Likes</TableHead>
                    <TableHead className="pr-3 text-right">Comments</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reel.snapshots.map((s, i) => {
                    const prev = reel.snapshots[i + 1];
                    const change = (key: "views" | "likes" | "comments") => {
                      const a = s[key];
                      const b = prev?.[key];
                      return a != null && b != null && a !== b ? signed(a - b) : null;
                    };
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="pl-3 text-muted-foreground">{dateTime(s.fetchedAt)}</TableCell>
                        {(["views", "likes", "comments"] as const).map((key) => (
                          <TableCell key={key} className="text-right tabular-nums last:pr-3">
                            {count(s[key])}
                            {change(key) && (
                              <span className="ml-1 text-xs text-muted-foreground">{change(key)}</span>
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
