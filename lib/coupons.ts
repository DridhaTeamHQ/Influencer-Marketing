import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { Coupon } from "@/lib/generated/prisma/client";
import { generateCode } from "@/lib/tracking";

// ---------- Schemas ----------

const money = z.coerce.number().nonnegative().multipleOf(0.01);
const optionalDate = z.coerce.date().nullish();

const couponFields = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,32}$/, "Use 3-32 letters, numbers, - or _")
    .optional(),
  description: z.string().trim().max(500).nullish(),
  discountType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
  discountValue: money.positive(),
  minOrderAmount: money.nullish(),
  maxRedemptions: z.coerce.number().int().positive().nullish(),
  perUserLimit: z.coerce.number().int().positive().nullish(),
  startsAt: optionalDate,
  expiresAt: optionalDate,
  isActive: z.boolean().optional(),
  influencerId: z.string().nullish(),
});

export const couponInputSchema = couponFields
  .refine((c) => c.discountType === "FIXED" || c.discountValue <= 100, {
    message: "Percentage discount cannot exceed 100",
    path: ["discountValue"],
  })
  .refine((c) => !c.startsAt || !c.expiresAt || c.startsAt < c.expiresAt, {
    message: "expiresAt must be after startsAt",
    path: ["expiresAt"],
  });

export const couponUpdateSchema = couponFields.partial();

export const redeemInputSchema = z.object({
  code: z.string().trim().toUpperCase().min(1),
  userId: z.string().trim().min(1),
  orderId: z.string().trim().min(1).optional(),
  orderAmount: money.optional(),
});

export type CouponInput = z.infer<typeof couponInputSchema>;
export type RedeemInput = z.infer<typeof redeemInputSchema>;

// ---------- Errors ----------

export type CouponErrorCode =
  | "NOT_FOUND"
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "USAGE_LIMIT_REACHED"
  | "USER_LIMIT_REACHED"
  | "MIN_ORDER_NOT_MET"
  | "ALREADY_REDEEMED"
  | "CODE_TAKEN";

export class CouponError extends Error {
  constructor(
    public code: CouponErrorCode,
    message: string,
  ) {
    super(message);
  }
}

// ---------- CRUD ----------

/** Builds a readable code like "PRIYA-X7K2" from an influencer name. */
export function suggestCouponCode(name?: string | null) {
  const prefix = (name ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  const suffix = generateCode(4).toUpperCase();
  return prefix ? `${prefix}-${suffix}` : `PROMO-${suffix}`;
}

export async function createCoupon(input: CouponInput) {
  let code = input.code;
  if (!code) {
    const influencer = input.influencerId
      ? await prisma.influencer.findUnique({ where: { id: input.influencerId }, select: { name: true } })
      : null;
    code = suggestCouponCode(influencer?.name);
  }

  try {
    return await prisma.coupon.create({ data: { ...input, code } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new CouponError("CODE_TAKEN", `Coupon code "${code}" already exists`);
    }
    throw e;
  }
}

export function listCoupons(filter: { influencerId?: string; active?: boolean } = {}) {
  return prisma.coupon.findMany({
    where: {
      influencerId: filter.influencerId,
      isActive: filter.active,
    },
    include: { influencer: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export function getCoupon(id: string) {
  return prisma.coupon.findUnique({
    where: { id },
    include: {
      influencer: { select: { id: true, name: true } },
      redemptions: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
}

export async function updateCoupon(id: string, input: z.infer<typeof couponUpdateSchema>) {
  try {
    return await prisma.coupon.update({ where: { id }, data: input });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") throw new CouponError("CODE_TAKEN", "Coupon code already exists");
      if (e.code === "P2025") throw new CouponError("NOT_FOUND", "Coupon not found");
    }
    throw e;
  }
}

export async function deleteCoupon(id: string) {
  const { count } = await prisma.coupon.deleteMany({ where: { id } });
  if (count === 0) throw new CouponError("NOT_FOUND", "Coupon not found");
}

// ---------- Validation & redemption ----------

function computeDiscount(coupon: Coupon, orderAmount?: number) {
  const value = coupon.discountValue.toNumber();
  if (orderAmount === undefined) return null;
  const raw = coupon.discountType === "PERCENTAGE" ? (orderAmount * value) / 100 : value;
  return Math.round(Math.min(raw, orderAmount) * 100) / 100;
}

async function checkCoupon(
  db: Prisma.TransactionClient,
  input: Omit<RedeemInput, "orderId">,
) {
  const coupon = await db.coupon.findUnique({ where: { code: input.code } });
  const now = new Date();

  if (!coupon) throw new CouponError("NOT_FOUND", "Coupon not found");
  if (!coupon.isActive) throw new CouponError("INACTIVE", "Coupon is not active");
  if (coupon.startsAt && coupon.startsAt > now) throw new CouponError("NOT_STARTED", "Coupon is not active yet");
  if (coupon.expiresAt && coupon.expiresAt <= now) throw new CouponError("EXPIRED", "Coupon has expired");
  if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions)
    throw new CouponError("USAGE_LIMIT_REACHED", "Coupon usage limit reached");
  if (coupon.minOrderAmount && input.orderAmount !== undefined && input.orderAmount < coupon.minOrderAmount.toNumber())
    throw new CouponError("MIN_ORDER_NOT_MET", `Minimum order amount is ${coupon.minOrderAmount}`);

  if (coupon.perUserLimit !== null) {
    const used = await db.couponRedemption.count({ where: { couponId: coupon.id, userId: input.userId } });
    if (used >= coupon.perUserLimit) throw new CouponError("USER_LIMIT_REACHED", "You have already used this coupon");
  }

  return coupon;
}

function describe(coupon: Coupon, orderAmount?: number) {
  return {
    couponId: coupon.id,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue.toNumber(),
    discountAmount: computeDiscount(coupon, orderAmount),
    influencerId: coupon.influencerId,
  };
}

/** Checks whether a coupon can be used, without consuming it. */
export async function validateCoupon(input: Omit<RedeemInput, "orderId">) {
  const coupon = await checkCoupon(prisma, input);
  return describe(coupon, input.orderAmount);
}

/** Consumes one use of a coupon. Safe against concurrent redemptions. */
export async function redeemCoupon(input: RedeemInput) {
  return prisma.$transaction(async (tx) => {
    const coupon = await checkCoupon(tx, input);

    // Conditional increment: fails if another request used the last redemption in the meantime.
    const { count } = await tx.coupon.updateMany({
      where: {
        id: coupon.id,
        ...(coupon.maxRedemptions !== null ? { redemptionCount: { lt: coupon.maxRedemptions } } : {}),
      },
      data: { redemptionCount: { increment: 1 } },
    });
    if (count === 0) throw new CouponError("USAGE_LIMIT_REACHED", "Coupon usage limit reached");

    const discount = computeDiscount(coupon, input.orderAmount) ?? 0;
    try {
      const redemption = await tx.couponRedemption.create({
        data: {
          couponId: coupon.id,
          userId: input.userId,
          orderId: input.orderId,
          orderAmount: input.orderAmount,
          discountApplied: discount,
        },
      });
      return { ...describe(coupon, input.orderAmount), redemptionId: redemption.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new CouponError("ALREADY_REDEEMED", "Coupon already applied to this order");
      }
      throw e;
    }
  });
}
