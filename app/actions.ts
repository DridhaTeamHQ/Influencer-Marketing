"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { generateCode } from "@/lib/tracking";

export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optionalText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable());

/** Creates the influencer's link with a unique short code, retrying on the rare collision. */
async function createLinkWithCode(db: Prisma.TransactionClient, influencerId: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const taken = await db.link.findUnique({ where: { code }, select: { id: true } });
    if (!taken) return db.link.create({ data: { code, influencerId } });
  }
  throw new Error("Could not generate a unique link code");
}

// ---------- Influencers ----------

const influencerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  handle: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().replace(/^@/, "") : v),
    z.string().max(60).transform((v) => v || null),
  ),
  email: z.preprocess(emptyToNull, z.email("Enter a valid email").nullable()),
  platform: z.enum(["INSTAGRAM", "YOUTUBE", "TIKTOK", "X", "FACEBOOK", "OTHER"]),
  followers: z.preprocess(emptyToNull, z.coerce.number().int().nonnegative().nullable()),
  notes: optionalText(1000),
});

export async function createInfluencer(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = influencerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }
  const data = parsed.data;

  await prisma.$transaction(async (tx) => {
    const influencer = await tx.influencer.create({ data });
    await createLinkWithCode(tx, influencer.id);
  });

  refresh();
  return { ok: true, message: `${data.name} added. Their tracking link is ready.` };
}

export async function updateInfluencer(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = influencerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }
  await prisma.influencer.update({ where: { id }, data: parsed.data });
  refresh();
  return { ok: true, message: "Influencer updated" };
}

export async function setInfluencerActive(id: string, isActive: boolean) {
  await prisma.influencer.update({ where: { id }, data: { isActive } });
  refresh();
}

export async function deleteInfluencer(id: string) {
  await prisma.influencer.delete({ where: { id } });
  redirect("/influencers");
}

// ---------- Links ----------

export async function setLinkActive(id: string, isActive: boolean) {
  await prisma.link.update({ where: { id }, data: { isActive } });
  refresh();
}
