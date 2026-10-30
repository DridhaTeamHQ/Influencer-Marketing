import { Suspense } from "react";
import type { Metadata } from "next";
import { PlusIcon, ShieldIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { InfluencerAvatar } from "@/components/influencers/influencer-avatar";
import { UserActions } from "@/components/users/user-actions";
import { UserFormDialog } from "@/components/users/user-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { timeAgo } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, assignableRoles, type Role } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Users · Influencer Links" };

const DESCRIPTION = "Who can sign in to the dashboard, and which sections each role opens.";

const ROLE_BADGE: Record<Role, string> = {
  DEVELOPER: "bg-chart-3/10 text-chart-3",
  ADMIN: "bg-primary/10 text-primary dark:bg-primary/30 dark:text-primary-foreground",
  CREATOR: "bg-muted text-foreground",
};

export default function UsersPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Users" description={DESCRIPTION} />
          <Skeleton className="h-72 rounded-xl" />
        </>
      }
    >
      <UserList />
    </Suspense>
  );
}

async function UserList() {
  const me = await getCurrentUser();
  // The proxy only lets roles with the Users section in here.
  if (!me) return null;
  const roles = assignableRoles(me.role);

  // Only the roles this user may manage (today developers and admins manage every role).
  const users = await prisma.user.findMany({
    where: { role: { in: roles } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
  });

  return (
    <>
      <PageHeader title="Users" description={DESCRIPTION}>
        <UserFormDialog
          roles={roles}
          trigger={
            <Button>
              <PlusIcon data-icon="inline-start" />
              Add login
            </Button>
          }
        />
      </PageHeader>

      <div className="space-y-4">
        <Card className="gap-0 py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell">Last sign in</TableHead>
                <TableHead className="w-10 pr-4">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {me.builtIn && (
                <TableRow>
                  <TableCell className="pl-4">
                    <UserCell name={me.name} email={me.email} seed={me.id} note="you · set in the environment" />
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={me.role} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <StatusBadge active />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">Now</TableCell>
                  <TableCell className="pr-4" />
                </TableRow>
              )}
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="pl-4">
                    <UserCell name={u.name} email={u.email} seed={u.id} note={u.id === me.id ? "you" : undefined} />
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={u.role} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <StatusBadge active={u.isActive} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {u.lastLoginAt ? timeAgo(u.lastLoginAt) : "Never"}
                  </TableCell>
                  <TableCell className="pr-4">
                    <UserActions
                      user={{ id: u.id, name: u.name, email: u.email, role: u.role }}
                      isActive={u.isActive}
                      isSelf={u.id === me.id}
                      roles={roles}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && !me.builtIn && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No logins yet. Add one to let someone in.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <Card className="gap-3 px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldIcon className="size-4 text-muted-foreground" />
            What each role can open
          </div>
          <ul className="grid gap-2 text-sm sm:grid-cols-3">
            {ROLES.filter((r) => roles.includes(r)).map((r) => (
              <li key={r} className="space-y-1">
                <RoleBadge role={r} />
                <p className="text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function UserCell({ name, email, seed, note }: { name: string; email: string; seed: string; note?: string }) {
  return (
    <div className="flex items-center gap-3">
      <InfluencerAvatar name={name} seed={seed} />
      <span className="min-w-0">
        <span className="block max-w-56 truncate font-medium">
          {name}
          {note && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({note})</span>}
        </span>
        <span className="block max-w-56 truncate text-xs text-muted-foreground">{email}</span>
      </span>
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <Badge variant="secondary" className={ROLE_BADGE[role]}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="secondary" className="bg-primary/10 text-primary dark:bg-primary/30 dark:text-primary-foreground">
      <span className="size-1.5 rounded-full bg-current" />
      Active
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      <span className="size-1.5 rounded-full bg-current" />
      Paused
    </Badge>
  );
}
