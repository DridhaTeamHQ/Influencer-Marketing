"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/app/actions";
import { isBuiltInEmail, type SessionUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { ROLES, ROLE_LABELS, assignableRoles, type Role } from "@/lib/roles";
import { requireSection } from "@/lib/session";

const MIN_PASSWORD = 8;

const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email").max(200)),
  role: z.enum(ROLES, "Pick a role"),
  // Empty on edit keeps the current password.
  password: z.string().max(200).refine((v) => v === "" || v.length >= MIN_PASSWORD, {
    message: `Use at least ${MIN_PASSWORD} characters`,
  }),
});

function formValues(formData: FormData) {
  // Never send the password back to the form.
  return Object.fromEntries(
    [...formData.entries()].filter(([k, v]) => typeof v === "string" && k !== "password"),
  ) as Record<string, string>;
}

const fail = (formData: FormData, errors: FormState["errors"]): FormState => ({ errors, values: formValues(formData) });

/** The user being managed, if the signed-in user is allowed to manage them. */
async function manageable(actor: SessionUser, id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || !assignableRoles(actor.role).includes(user.role)) throw new Error("You can't manage this user");
  return user;
}

async function checkEmail(email: string, exceptId?: string) {
  if (isBuiltInEmail(email)) return "This email is the built-in developer login";
  const taken = await prisma.user.findFirst({ where: { email, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
  return taken ? "Another login already uses this email" : null;
}

function roleError(actor: SessionUser, role: Role) {
  return assignableRoles(actor.role).includes(role) ? null : `You can't give the ${ROLE_LABELS[role]} role`;
}

export async function createUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireSection("users");
  const parsed = userSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(formData, z.flattenError(parsed.error).fieldErrors);
  const { name, email, role, password } = parsed.data;

  if (!password) return fail(formData, { password: ["Set a password for them to sign in with"] });
  const badRole = roleError(actor, role);
  if (badRole) return fail(formData, { role: [badRole] });
  const badEmail = await checkEmail(email);
  if (badEmail) return fail(formData, { email: [badEmail] });

  await prisma.user.create({ data: { name, email, role, passwordHash: await hashPassword(password) } });
  refresh();
  return { ok: true, message: `${name} can now sign in as ${ROLE_LABELS[role].toLowerCase()}` };
}

export async function updateUser(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireSection("users");
  const user = await manageable(actor, id);
  const parsed = userSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(formData, z.flattenError(parsed.error).fieldErrors);
  const { name, email, role, password } = parsed.data;

  // Changing your own role could lock you out of this page.
  if (id === actor.id && role !== user.role) return fail(formData, { role: ["You can't change your own role"] });
  const badRole = roleError(actor, role);
  if (badRole) return fail(formData, { role: [badRole] });
  const badEmail = await checkEmail(email, id);
  if (badEmail) return fail(formData, { email: [badEmail] });

  await prisma.user.update({
    where: { id },
    data: {
      name,
      email,
      role,
      // A new password signs them out of every open session.
      ...(password ? { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 } } : {}),
    },
  });
  refresh();
  return { ok: true, message: password ? `${name} updated. Their other sessions were signed out.` : `${name} updated` };
}

export async function setUserActive(id: string, isActive: boolean) {
  const actor = await requireSection("users");
  if (id === actor.id) throw new Error("You can't pause your own login");
  await manageable(actor, id);
  await prisma.user.update({ where: { id }, data: { isActive } });
  refresh();
}

export async function deleteUser(id: string) {
  const actor = await requireSection("users");
  if (id === actor.id) throw new Error("You can't delete your own login");
  await manageable(actor, id);
  await prisma.user.delete({ where: { id } });
  refresh();
}
