"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkIcon, LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/dridha/login/actions";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";

const items = [
  { href: routes.dashboard, label: "Dashboard" },
  { href: routes.influencers, label: "Influencers" },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href={routes.dashboard} className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LinkIcon className="size-3.5" />
          </span>
          <span className="hidden sm:inline">Influencer Links</span>
        </Link>

        {/* The pathname is only known at request time, so the active state streams in. */}
        <Suspense fallback={<NavLinks pathname={null} />}>
          <ActiveNavLinks />
        </Suspense>

        <form action={logout} className="ml-auto">
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
            <LogOutIcon data-icon="inline-start" />
            <span className="hidden sm:inline">Log out</span>
          </Button>
        </form>
      </div>
    </header>
  );
}

function ActiveNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}

function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <NavigationMenu className="sm:ml-4">
      <NavigationMenuList className="gap-0.5">
        {items.map((item) => {
          const active =
            pathname !== null && (item.href === routes.dashboard ? pathname === routes.dashboard : pathname.startsWith(item.href));
          return (
            <NavigationMenuItem key={item.href}>
              <NavigationMenuLink
                active={active}
                render={<Link href={item.href} />}
                className={cn(
                  navigationMenuTriggerStyle(),
                  "h-8 bg-transparent px-3 text-muted-foreground hover:text-foreground data-active:bg-muted data-active:text-foreground",
                )}
              >
                {item.label}
              </NavigationMenuLink>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
