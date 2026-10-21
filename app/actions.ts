"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { generateCode } from "@/lib/tracking";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth";
import { REFERRAL_CODE_PATTERN, isReferralCodeTaken, suggestReferralCode } from "@/lib/referrals";
import { routes } from "@/lib/routes";

export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
  /** What the user submitted, so the form can keep it after an error. */
  values?: Record<string, string>;
};

function formValues(formData: FormData) {
  return Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<
    string,
    string
  >;
}

/** Every action below is dashboard-only: reject calls without a valid login. */
async function requireAdmin() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!isValidSessionToken(token)) throw new Error("Not signed in");
}

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optionalText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable());

const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{1,39}$/;

/** "Bharani Rayudu" / "@bharani.rayudu" -> "bharani-rayudu" */
function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 40);
}

/**
 * A link name is taken if another influencer has it now, or if it was ever used before
 * (deleted or renamed). Only the influencer who used it before may take an old name back.
 */
async function isSlugTaken(
  db: Prisma.TransactionClient,
  code: string,
  owner?: { linkId: string; influencerId: string },
) {
  const [link, retired] = await Promise.all([
    db.link.findFirst({
      where: {
        code: { equals: code, mode: "insensitive" },
        ...(owner ? { NOT: { id: owner.linkId } } : {}),
      },
      select: { id: true },
    }),
    db.retiredCode.findFirst({
      where: { code: { equals: code, mode: "insensitive" } },
      select: { influencerId: true },
    }),
  ]);
  if (link) return true;
  return !!retired && retired.influencerId !== owner?.influencerId;
}

/** Remembers a link name so it can never be handed to another influencer. */
async function retireCode(
  db: Prisma.TransactionClient,
  code: string,
  influencer: { id: string; name: string },
) {
  await db.retiredCode.upsert({
    where: { code },
    create: { code, influencerId: influencer.id, influencerName: influencer.name },
    update: { influencerId: influencer.id, influencerName: influencer.name, retiredAt: new Date() },
  });
}

/** Picks a free link name based on the handle or name, e.g. "bharani", "bharani-2", … */
async function suggestSlug(db: Prisma.TransactionClient, base: string) {
  const root = slugify(base);
  if (root.length >= 2) {
    for (let n = 1; n <= 50; n++) {
      const candidate = n === 1 ? root : `${root.slice(0, 36)}-${n}`;
      if (!(await isSlugTaken(db, candidate))) return candidate;
    }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode().toLowerCase();
    if (!(await isSlugTaken(db, code))) return code;
  }
  throw new Error("Could not generate a unique link name");
}

// ---------- Influencers ----------

/** "2026-10-16" (from <input type="date">) -> Date at UTC midnight, or null when empty. */
const optionalDay = z.preprocess(
  emptyToNull,
  z.iso
    .date("Pick a valid date")
    .transform((d) => new Date(`${d}T00:00:00Z`))
    .nullable(),
);

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
  slug: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() || null : null),
    z
      .string()
      .regex(SLUG_PATTERN, "Use 2-40 lowercase letters, numbers, - or _ (start with a letter or number)")
      .nullable(),
  ),
  periodStart: optionalDay,
  periodEnd: optionalDay,
  referralCode: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toUpperCase() || null : null),
    z
      .string()
      .regex(REFERRAL_CODE_PATTERN, "Use 2-24 letters, numbers, - or _")
      .nullable(),
  ),
}).refine((v) => !v.periodStart || !v.periodEnd || v.periodEnd >= v.periodStart, {
  message: "End date must be on or after the start date",
  path: ["periodEnd"],
});

const referralTakenError = (code: string, formData: FormData): FormState => ({
  errors: { referralCode: [`${code} is already another influencer's referral code`] },
  values: formValues(formData),
});

const slugTakenError = (slug: string, formData: FormData): FormState => ({
  errors: { slug: [`/r/${slug} is already used, or was used before, by another influencer`] },
  values: formValues(formData),
});

export async function createInfluencer(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = influencerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values: formValues(formData) };
  }
  const { slug, referralCode, ...data } = parsed.data;

  if (slug && (await isSlugTaken(prisma, slug))) return slugTakenError(slug, formData);
  if (referralCode && (await isReferralCodeTaken(prisma, referralCode))) {
    return referralTakenError(referralCode, formData);
  }

  const created = await prisma.$transaction(async (tx) => {
    const influencer = await tx.influencer.create({
      data: { ...data, referralCode: referralCode ?? (await suggestReferralCode(tx, data.handle ?? data.name)) },
    });
    const code = slug ?? (await suggestSlug(tx, data.handle ?? data.name));
    await tx.link.create({ data: { code, influencerId: influencer.id } });
    return { code, referralCode: influencer.referralCode };
  });

  refresh();
  return {
    ok: true,
    message: `${data.name} added. Link /r/${created.code} · referral code ${created.referralCode}`,
  };
}

export async function updateInfluencer(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const parsed = influencerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values: formValues(formData) };
  }
  const { slug, referralCode, ...data } = parsed.data;
  const link = await prisma.link.findUnique({ where: { influencerId: id }, select: { id: true, code: true } });

  if (
    slug &&
    link &&
    slug !== link.code &&
    (await isSlugTaken(prisma, slug, { linkId: link.id, influencerId: id }))
  ) {
    return slugTakenError(slug, formData);
  }
  if (referralCode && (await isReferralCodeTaken(prisma, referralCode, id))) {
    return referralTakenError(referralCode, formData);
  }

  await prisma.$transaction(async (tx) => {
    // An empty referral code field keeps the current code.
    await tx.influencer.update({ where: { id }, data: { ...data, ...(referralCode ? { referralCode } : {}) } });
    if (slug && link && slug !== link.code) {
      // The old name stops working and stays reserved for this influencer.
      await retireCode(tx, link.code, { id, name: data.name });
      await tx.retiredCode.deleteMany({ where: { code: { equals: slug, mode: "insensitive" }, influencerId: id } });
      await tx.link.update({ where: { id: link.id }, data: { code: slug } });
    } else if (!link) {
      await tx.link.create({ data: { influencerId: id, code: slug ?? (await suggestSlug(tx, data.handle ?? data.name)) } });
    }
  });

  refresh();
  return { ok: true, message: "Influencer updated" };
}

export async function setInfluencerActive(id: string, isActive: boolean) {
  await requireAdmin();
  await prisma.influencer.update({ where: { id }, data: { isActive } });
  refresh();
}

export async function deleteInfluencer(id: string) {
  await requireAdmin();
  await prisma.$transaction(async (tx) => {
    const influencer = await tx.influencer.findUnique({
      where: { id },
      select: { id: true, name: true, link: { select: { code: true } } },
    });
    if (!influencer) return;
    // Keep the link name reserved: it will show "expired" and can't be given to anyone else.
    if (influencer.link) await retireCode(tx, influencer.link.code, influencer);
    await tx.influencer.delete({ where: { id } });
  });
  redirect(routes.influencers);
}

// ---------- Links ----------

export async function setLinkActive(id: string, isActive: boolean) {
  await requireAdmin();
  await prisma.link.update({ where: { id }, data: { isActive } });
  refresh();
}

// ---------- Referral signups (copied from the referral portal) ----------

const signupCountSchema = z.object({
  date: z.iso.date("Pick a date"),
  count: z.coerce.number({ error: "Enter a number" }).int("Whole numbers only").min(0, "Can't be negative").max(1_000_000),
  note: optionalText(300),
});

/** Sets the number of signups for one influencer on one day (adds or replaces that day). */
export async function saveSignupCount(
  influencerId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const parsed = signupCountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values: formValues(formData) };
  }
  const { count, note } = parsed.data;
  const date = new Date(`${parsed.data.date}T00:00:00Z`);
  if (date.getTime() > Date.now()) {
    return { errors: { date: ["Date can't be in the future"] }, values: formValues(formData) };
  }

  await prisma.signupCount.upsert({
    where: { influencerId_date: { influencerId, date } },
    create: { influencerId, date, count, note },
    update: { count, note },
  });
  refresh();
  return { ok: true, message: `Saved ${count} signup${count === 1 ? "" : "s"} for ${parsed.data.date}` };
}

export async function deleteSignupCount(id: string) {
  await requireAdmin();
  await prisma.signupCount.delete({ where: { id } });
  refresh();
}

// ---------- Partner links (LinkedIn) ----------

export async function setPartnerLinkActive(id: string, isActive: boolean) {
  await requireAdmin();
  await prisma.partnerLink.update({ where: { id }, data: { isActive } });
  refresh();
}
