"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  checkCredentials,
  createSessionToken,
  safeRedirectPath,
} from "@/lib/auth";
import { routes } from "@/lib/routes";

export type LoginState = { error?: string; email?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!checkCredentials(email, password)) {
    // Small delay to slow down password guessing.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { error: "Incorrect email or password", email };
  }

  (await cookies()).set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect(safeRedirectPath(String(formData.get("from") ?? "")));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect(routes.login);
}
