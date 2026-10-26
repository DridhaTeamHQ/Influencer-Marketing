import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth";
import { routes } from "@/lib/routes";
import { OAUTH_STATE_COOKIE, authorizeUrl, youtubeMissingEnv } from "@/lib/social/youtube";

/** "Connect YouTube": sends the browser to Google's consent page. */
export function GET(request: NextRequest) {
  if (!isValidSessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.redirect(new URL(routes.login, request.url));
  }
  if (youtubeMissingEnv().length) return NextResponse.redirect(new URL(routes.youtube, request.url));

  // Random state, checked on the way back so nobody else can attach their channel.
  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(authorizeUrl(request.nextUrl.origin, state));
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: routes.youtube,
    maxAge: 600,
  });
  return response;
}
