import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isDashboardPath, isValidSessionToken } from "@/lib/auth";
import { PUBLIC_SITE_URL, routes } from "@/lib/routes";

/**
 * - /r/...      tracking links: public (excluded by the matcher)
 * - /go/...     partner links (LinkedIn etc.): public
 * - /link/...   "expired" / "not available" pages for those links: public
 * - /dridha/... dashboard: needs the login
 * - anything else: sent to the main DailyMattr website
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isDashboardPath(pathname)) {
    return NextResponse.redirect(PUBLIC_SITE_URL);
  }

  const loggedIn = isValidSessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === routes.login) {
    return loggedIn ? NextResponse.redirect(new URL(routes.dashboard, request.url)) : NextResponse.next();
  }

  if (!loggedIn) {
    const url = new URL(routes.login, request.url);
    if (pathname !== routes.dashboard) url.searchParams.set("from", pathname + search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip tracking links and their status pages, API routes (they use API keys) and Next.js assets.
    "/((?!r/|go/|link/|api/|_next/|__nextjs|favicon.ico).*)",
  ],
};
