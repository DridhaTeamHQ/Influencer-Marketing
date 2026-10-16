/** Safe to import from client components (no database code). */
export const LIST_SORTS = {
  newest: "Newest first",
  name: "Name A–Z",
  clicks: "Most clicks (7 days)",
} as const;
export type ListSort = keyof typeof LIST_SORTS;
export type ListStatus = "all" | "active" | "paused";

export const PAGE_SIZE = 20;

export type ListParams = { q: string; status: ListStatus; sort: ListSort };

type RawParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export function parseListParams(sp: RawParams): ListParams & { page: number } {
  const status = one(sp.status);
  const sort = one(sp.sort);
  const page = Number.parseInt(one(sp.page), 10);
  return {
    q: one(sp.q).slice(0, 100),
    status: status === "active" || status === "paused" ? status : "all",
    sort: sort in LIST_SORTS ? (sort as ListSort) : "newest",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Builds "?q=…&status=…" with defaults left out, so URLs stay short and shareable. */
export function listQuery(params: ListParams & { page?: number }) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.status !== "all") sp.set("status", params.status);
  if (params.sort !== "newest") sp.set("sort", params.sort);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
