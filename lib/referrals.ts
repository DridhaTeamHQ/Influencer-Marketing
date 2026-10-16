import type { Prisma } from "@/lib/generated/prisma/client";
import { generateCode } from "@/lib/tracking";

export const REFERRAL_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,23}$/;

export function normalizeReferralCode(value: string) {
  return value.trim().toUpperCase();
}

/** "@bharani.rayudu" / "Bharani Rayudu" -> "BHARANIRAYUDU" */
function referralBase(value: string) {
  return value
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
}

type Db = Prisma.TransactionClient;

export async function isReferralCodeTaken(db: Db, code: string, exceptInfluencerId?: string) {
  const found = await db.influencer.findFirst({
    where: {
      referralCode: normalizeReferralCode(code),
      ...(exceptInfluencerId ? { NOT: { id: exceptInfluencerId } } : {}),
    },
    select: { id: true },
  });
  return !!found;
}

/** Picks a free code from the handle or name: BHARANI, BHARANI2, … */
export async function suggestReferralCode(db: Db, from: string) {
  const base = referralBase(from);
  if (base.length >= 2) {
    for (let n = 1; n <= 50; n++) {
      const code = n === 1 ? base : `${base}${n}`;
      if (!(await isReferralCodeTaken(db, code))) return code;
    }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode(6).toUpperCase();
    if (!(await isReferralCodeTaken(db, code))) return code;
  }
  throw new Error("Could not generate a unique referral code");
}
