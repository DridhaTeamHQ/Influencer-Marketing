"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

/** `exact`: only active on this very path (for a parent like the overview). */
type Tab = { href: string; label: string; exact?: boolean };

/** Overview / Instagram / Facebook / YouTube switcher on the Social pages. */
export function SocialTabs({ tabs }: { tabs: Tab[] }) {
  return (
    // The pathname is only known at request time, so the active state streams in.
    <Suspense fallback={<Tabs tabs={tabs} pathname={null} />}>
      <ActiveTabs tabs={tabs} />
    </Suspense>
  );
}

function ActiveTabs({ tabs }: { tabs: Tab[] }) {
  return <Tabs tabs={tabs} pathname={usePathname()} />;
}

function Tabs({ tabs, pathname }: { tabs: Tab[]; pathname: string | null }) {
  return (
    <ButtonGroup aria-label="Platform">
      {tabs.map((tab) => {
        const active = (tab.exact ? pathname === tab.href : pathname?.startsWith(tab.href)) ?? false;
        return (
          <Button
            key={tab.href}
            size="sm"
            variant={active ? "secondary" : "outline"}
            nativeButton={false}
            render={<Link href={tab.href} />}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Button>
        );
      })}
    </ButtonGroup>
  );
}
