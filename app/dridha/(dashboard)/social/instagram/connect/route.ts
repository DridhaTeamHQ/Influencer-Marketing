import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requestCanAccess } from "@/lib/auth";
import { routes } from "@/lib/routes";
import { OAUTH_STATE_COOKIE, authorizeUrl, instagramMissingEnv } from "@/lib/social/instagram";

/** "Connect Instagram": sends the browser to Instagram's consent page. */
export async function GET(request: NextRequest) {
  if (!(await requestCanAccess(request, "social"))) {
    return NextResponse.redirect(new URL(routes.login, request.url));
  }
  if (instagramMissingEnv().length) return NextResponse.redirect(new URL(routes.instagram, request.url));

  // Random state, checked on the way back so nobody else can attach their account.
  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(authorizeUrl(request.nextUrl.origin, state));
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: routes.instagram,
    maxAge: 600,
  });
  return response;
}
