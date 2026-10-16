"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SearchIcon, XIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LIST_SORTS, listQuery, type ListParams, type ListSort, type ListStatus } from "@/lib/list-params";

const sortItems = Object.entries(LIST_SORTS).map(([value, label]) => ({ value, label }));

export function InfluencerToolbar({
  params,
  counts,
}: {
  params: ListParams;
  counts: { all: number; active: number; paused: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.q);

  function go(next: Partial<ListParams>) {
    // Any change of search, filter or sort starts again from page 1.
    startTransition(() => {
      router.replace(`${pathname}${listQuery({ ...params, ...next })}`, { scroll: false });
    });
  }

  // Search as you type, after a short pause (only when the text really changed).
  useEffect(() => {
    if (query.trim() === params.q) return;
    const t = setTimeout(() => go({ q: query.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Tabs value={params.status} onValueChange={(v) => go({ status: v as ListStatus })}>
        <TabsList>
          <TabsTrigger value="all">
            All <span className="text-muted-foreground tabular-nums">{counts.all}</span>
          </TabsTrigger>
          <TabsTrigger value="active">
            Active <span className="text-muted-foreground tabular-nums">{counts.active}</span>
          </TabsTrigger>
          <TabsTrigger value="paused">
            Paused <span className="text-muted-foreground tabular-nums">{counts.paused}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex min-w-0 flex-1 gap-2 sm:justify-end">
        <InputGroup className="min-w-0 flex-1 sm:max-w-xs">
          <InputGroupAddon>{pending ? <Spinner /> : <SearchIcon />}</InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Search name, handle, code"
            aria-label="Search influencers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setQuery("")}>
                <XIcon />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>

        <Select items={sortItems} value={params.sort} onValueChange={(v) => go({ sort: v as ListSort })}>
          <SelectTrigger className="w-36 shrink-0 sm:w-44" aria-label="Sort influencers">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortItems.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
