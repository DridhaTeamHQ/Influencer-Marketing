import type { NextRequest } from "next/server";
import { errorResponse, requireApiKey } from "@/lib/api";
import { couponUpdateSchema, deleteCoupon, getCoupon, updateCoupon } from "@/lib/coupons";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/coupons/[id]">) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  const coupon = await getCoupon(id);
  if (!coupon) return Response.json({ error: "Coupon not found" }, { status: 404 });
  return Response.json({ coupon });
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/coupons/[id]">) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  try {
    const { id } = await ctx.params;
    const input = couponUpdateSchema.parse(await request.json());
    const coupon = await updateCoupon(id, input);
    return Response.json({ coupon });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/coupons/[id]">) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  try {
    const { id } = await ctx.params;
    await deleteCoupon(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
