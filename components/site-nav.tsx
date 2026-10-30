"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkIcon, LogOutIcon } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
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
import { ROLE_LABELS, homeFor, sectionsFor, type Role } from "@/lib/roles";

type NavUser = { name: string; email: string; role: Role };
type NavItem = { href: string; label: string };

/** `user` is null while the login streams in: the bar shows without tabs. */
export function SiteNav({ user }: { user: NavUser | null }) {
  const items = user ? sectionsFor(user.role) : [];
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href={user ? homeFor(user.role) : routes.dashboard} className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LinkIcon className="size-3.5" />
          </span>
          <span className="hidden sm:inline">Influencer Links</span>
        </Link>

        {/* The pathname is only known at request time, so the active state streams in. */}
        <Suspense fallback={<NavLinks items={items} pathname={null} />}>
          <ActiveNavLinks items={items} />
        </Suspense>

        <div className="ml-auto flex items-center gap-1">
          {user && (
            <div className="mr-1 hidden min-w-0 text-right leading-tight md:block" title={user.email}>
              <div className="max-w-40 truncate text-sm font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</div>
            </div>
          )}
          <ThemeToggle />
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
              <LogOutIcon data-icon="inline-start" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}

function ActiveNavLinks({ items }: { items: NavItem[] }) {
  return <NavLinks items={items} pathname={usePathname()} />;
}

function NavLinks({ items, pathname }: { items: NavItem[]; pathname: string | null }) {
  return (
    // On narrow screens the tabs scroll sideways instead of pushing the header off-screen.
    <NavigationMenu className="min-w-0 overflow-x-auto [scrollbar-width:none] sm:ml-4">
      <NavigationMenuList className="w-max gap-0.5">
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
