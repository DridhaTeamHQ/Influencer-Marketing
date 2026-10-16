import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { routes } from "@/lib/routes";

/**
 * Single shared login for the dashboard.
 * Override the defaults with ADMIN_EMAIL / ADMIN_PASSWORD, and set AUTH_SECRET in production.
 */
const EMAIL = (process.env.ADMIN_EMAIL ?? "team@dailymattr.com").toLowerCase();
const PASSWORD = process.env.ADMIN_PASSWORD ?? "dailymattr@2026";

export const SESSION_COOKIE = "dm_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  // Without AUTH_SECRET, derive one from server-only values so sessions still can't be forged.
  return (
    process.env.AUTH_SECRET ??
    createHash("sha256")
      .update(`${process.env.DATABASE_URL ?? ""}:${EMAIL}:${PASSWORD}`)
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

export function checkCredentials(email: string, password: string) {
  const userOk = safeEqual(email.trim().toLowerCase(), EMAIL);
  const passOk = safeEqual(password, PASSWORD);
  return userOk && passOk;
}

/** "<expiresAt>.<signature>" */
export function createSessionToken() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  return `${expiresAt}.${sign(`${EMAIL}.${expiresAt}`)}`;
}

export function isValidSessionToken(token: string | undefined) {
  if (!token) return false;
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature || !/^\d+$/.test(expiresAt)) return false;
  if (Number(expiresAt) < Date.now() / 1000) return false;
  return safeEqual(signature, sign(`${EMAIL}.${expiresAt}`));
}

export function isDashboardPath(pathname: string) {
  return pathname === routes.dashboard || pathname.startsWith(`${routes.dashboard}/`);
}

/** Only allow redirecting back to a dashboard page after signing in. */
export function safeRedirectPath(from: string | null | undefined) {
  return from && isDashboardPath(from) && !from.startsWith(routes.login) ? from : routes.dashboard;
}
