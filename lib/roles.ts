import { routes } from "@/lib/routes";

/** Same values as the UserRole enum in the schema. Kept here so client components can use it. */
export const ROLES = ["DEVELOPER", "ADMIN", "CREATOR"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  DEVELOPER: "Developer",
  ADMIN: "Admin",
  CREATOR: "Creator",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  DEVELOPER: "Every section, and can manage all logins.",
  ADMIN: "App Stores, and can manage all logins.",
  CREATOR: "Dashboard, Influencers and Social.",
};

export type Section = "dashboard" | "influencers" | "stores" | "social" | "users";

/** In nav order. The first section a role can open is where it lands after signing in. */
export const SECTIONS: { key: Section; href: string; label: string }[] = [
  { key: "dashboard", href: routes.dashboard, label: "Dashboard" },
  { key: "influencers", href: routes.influencers, label: "Influencers" },
  { key: "stores", href: routes.stores, label: "App Stores" },
  { key: "social", href: routes.social, label: "Social" },
  { key: "users", href: routes.users, label: "Users" },
];

const ACCESS: Record<Role, Section[]> = {
  DEVELOPER: ["dashboard", "influencers", "stores", "social", "users"],
  ADMIN: ["stores", "users"],
  CREATOR: ["dashboard", "influencers", "social"],
};

export function canAccess(role: Role, section: Section) {
  return ACCESS[role].includes(section);
}

export function sectionsFor(role: Role) {
  return SECTIONS.filter((s) => canAccess(role, s.key));
}

export function homeFor(role: Role) {
  return sectionsFor(role)[0].href;
}

/** Which section a dashboard path belongs to. The dashboard itself is only its exact path. */
export function sectionForPath(pathname: string): Section | null {
  if (pathname === routes.dashboard) return "dashboard";
  const match = SECTIONS.find((s) => s.key !== "dashboard" && (pathname === s.href || pathname.startsWith(`${s.href}/`)));
  return match?.key ?? null;
}

/** Roles a user may give out (and manage). Developers and admins can manage every role. */
export function assignableRoles(role: Role): Role[] {
  return role === "DEVELOPER" || role === "ADMIN" ? [...ROLES] : [];
}
