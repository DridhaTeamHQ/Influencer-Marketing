import type { NextRequest } from "next/server";
import { errorResponse, requireApiKey } from "@/lib/api";
import { redeemInputSchema, validateCoupon } from "@/lib/coupons";

/** POST /api/coupons/validate — checks a code without using it up. */
export async function POST(request: NextRequest) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  try {
    const input = redeemInputSchema.omit({ orderId: true }).parse(await request.json());
    const result = await validateCoupon(input);
    return Response.json({ valid: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
