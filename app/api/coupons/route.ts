import type { NextRequest } from "next/server";
import { errorResponse, requireApiKey } from "@/lib/api";
import { couponInputSchema, createCoupon, listCoupons } from "@/lib/coupons";

/** GET /api/coupons?influencerId=&active=true */
export async function GET(request: NextRequest) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const params = request.nextUrl.searchParams;
  const active = params.get("active");
  const coupons = await listCoupons({
    influencerId: params.get("influencerId") ?? undefined,
    active: active === null ? undefined : active === "true",
  });
  return Response.json({ coupons });
}

/** POST /api/coupons — omit `code` to auto-generate one from the influencer's name. */
export async function POST(request: NextRequest) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  try {
    const input = couponInputSchema.parse(await request.json());
    const coupon = await createCoupon(input);
    return Response.json({ coupon }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
