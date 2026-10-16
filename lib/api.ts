import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { CouponError, type CouponErrorCode } from "@/lib/coupons";

/**
 * Requires `Authorization: Bearer <API_SECRET_KEY>` on API routes.
 * Returns an error response when the key is missing or wrong, otherwise null.
 */
export function requireApiKey(request: Request): Response | null {
  const secret = process.env.API_SECRET_KEY;
  if (!secret) {
    return Response.json({ error: "API_SECRET_KEY is not configured on the server" }, { status: 500 });
  }
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

const STATUS: Record<CouponErrorCode, number> = {
  NOT_FOUND: 404,
  CODE_TAKEN: 409,
  ALREADY_REDEEMED: 409,
  INACTIVE: 422,
  NOT_STARTED: 422,
  EXPIRED: 422,
  USAGE_LIMIT_REACHED: 422,
  USER_LIMIT_REACHED: 422,
  MIN_ORDER_NOT_MET: 422,
};

export function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return Response.json({ error: "Invalid input", issues: z.flattenError(error).fieldErrors }, { status: 400 });
  }
  if (error instanceof CouponError) {
    return Response.json({ error: error.message, code: error.code }, { status: STATUS[error.code] });
  }
  if (error instanceof SyntaxError) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  console.error(error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
