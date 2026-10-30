import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { burnPasswordCheck, verifyPassword } from "@/lib/password";
import { canAccess, homeFor, sectionForPath, type Role, type Section } from "@/lib/roles";
import { routes } from "@/lib/routes";

/**
 * Dashboard logins are User rows with a role (see lib/roles.ts), plus an optional built-in developer
 * login from DEVELOPER_EMAIL / DEVELOPER_PASSWORD that can't be locked out from the Users page.
 * Without both set there is no built-in login. Set AUTH_SECRET in production.
 */
const DEV_EMAIL = (process.env.DEVELOPER_EMAIL ?? "").trim().toLowerCase();
const DEV_PASSWORD = process.env.DEVELOPER_PASSWORD ?? "";
const BUILT_IN_ENABLED = DEV_EMAIL !== "" && DEV_PASSWORD !== "";
const DEV_ID = "developer";

export const SESSION_COOKIE = "dm_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** The developer login from the environment: it can't be edited or removed from the Users page. */
  builtIn: boolean;
};

const builtInDeveloper: SessionUser = { id: DEV_ID, name: "Developer", email: DEV_EMAIL, role: "DEVELOPER", builtIn: true };

function secret() {
  // Without AUTH_SECRET, derive one from server-only values so sessions still can't be forged.
  return (
    process.env.AUTH_SECRET ??
    createHash("sha256")
      .update(`${process.env.DATABASE_URL ?? ""}:${DEV_EMAIL}:${DEV_PASSWORD}`)
      .digest("hex")
  );
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  // Hash first so the comparison takes the same time whatever the lengths are.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Changing DEVELOPER_PASSWORD signs the built-in developer out everywhere. */
function builtInVersion() {
  return createHash("sha256").update(`${DEV_EMAIL}:${DEV_PASSWORD}`).digest("base64url").slice(0, 12);
}

export function isBuiltInEmail(email: string) {
  return BUILT_IN_ENABLED && email.trim().toLowerCase() === DEV_EMAIL;
}

/** The signed-in user for these credentials, or null. Paused users can't sign in. */
export async function authenticate(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (BUILT_IN_ENABLED && safeEqual(normalized, DEV_EMAIL) && safeEqual(password, DEV_PASSWORD)) {
    return { user: builtInDeveloper, version: builtInVersion() };
  }

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) {
    await burnPasswordCheck(password);
    return null;
  }
  if (!(await verifyPassword(password, user.passwordHash)) || !user.isActive) return null;

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { user: toSessionUser(user), version: String(user.sessionVersion) };
}

function toSessionUser(user: { id: string; name: string; email: string; role: Role }): SessionUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role, builtIn: false };
}

/** "<userId>.<sessionVersion>.<expiresAt>.<signature>" */
export function createSessionToken(userId: string, version: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `${userId}.${version}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Checks the token and loads who it belongs to. The role is read fresh from the database every
 * time, so role changes apply at once and paused or deleted users are locked out straight away.
 */
export async function getSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const [userId, version, expiresAt, signature] = token.split(".");
  if (!userId || !version || !expiresAt || !signature || !/^\d+$/.test(expiresAt)) return null;
  if (Number(expiresAt) < Date.now() / 1000) return null;
  if (!safeEqual(signature, sign(`${userId}.${version}.${expiresAt}`))) return null;

  if (userId === DEV_ID) return BUILT_IN_ENABLED && version === builtInVersion() ? builtInDeveloper : null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, isActive: true, sessionVersion: true },
  });
  if (!user?.isActive || String(user.sessionVersion) !== version) return null;
  return toSessionUser(user);
}

/** For route handlers: whether the request's login may use this section. */
export async function requestCanAccess(
  request: { cookies: { get(name: string): { value: string } | undefined } },
  section: Section,
) {
  const user = await getSessionUser(request.cookies.get(SESSION_COOKIE)?.value);
  return !!user && canAccess(user.role, section);
}

export function isDashboardPath(pathname: string) {
  return pathname === routes.dashboard || pathname.startsWith(`${routes.dashboard}/`);
}

/** Whether this role may open a dashboard path. Paths outside every section (none today) are allowed. */
export function canOpenPath(role: Role, pathname: string) {
  const section = sectionForPath(pathname);
  return !section || canAccess(role, section);
}

/** Only allow redirecting back to a dashboard page this role can open after signing in. */
export function safeRedirectPath(from: string | null | undefined, role: Role) {
  const pathname = from?.split(/[?#]/)[0];
  return from && pathname && isDashboardPath(pathname) && !pathname.startsWith(routes.login) && canOpenPath(role, pathname)
    ? from
    : homeFor(role);
}
