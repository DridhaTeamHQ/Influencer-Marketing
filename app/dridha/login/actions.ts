"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_MAX_AGE, authenticate, createSessionToken, safeRedirectPath } from "@/lib/auth";
import { routes } from "@/lib/routes";

export type LoginState = { error?: string; email?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const session = await authenticate(email, password);
  if (!session) {
    // Small delay to slow down password guessing.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { error: "Incorrect email or password", email };
  }

  (await cookies()).set(SESSION_COOKIE, createSessionToken(session.user.id, session.version), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect(safeRedirectPath(String(formData.get("from") ?? ""), session.user.role));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect(routes.login);
}
