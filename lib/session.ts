import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { SESSION_COOKIE, getSessionUser } from "@/lib/auth";
import { canAccess, type Section } from "@/lib/roles";

/** The signed-in user for this request, or null. Looked up once per request. */
export const getCurrentUser = cache(async () => {
  // Checking the token's expiry reads the clock, so this must run at request time, never in a prerender.
  await connection();
  return getSessionUser((await cookies()).get(SESSION_COOKIE)?.value);
});

/**
 * For server actions and route handlers: the proxy already keeps people out of pages they
 * can't open, but actions can be called directly, so each one checks again.
 */
export async function requireSection(section: Section) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  if (!canAccess(user.role, section)) throw new Error("You don't have access to this");
  return user;
}
