import type { NextRequest } from "next/server";
import { errorResponse, requireApiKey } from "@/lib/api";
import { redeemCoupon, redeemInputSchema } from "@/lib/coupons";

/** POST /api/coupons/redeem — consumes one use of a coupon for a user/order. */
export async function POST(request: NextRequest) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  try {
    const input = redeemInputSchema.parse(await request.json());
    const result = await redeemCoupon(input);
    return Response.json({ redeemed: true, ...result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
