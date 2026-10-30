import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, canOpenPath, getSessionUser, isDashboardPath } from "@/lib/auth";
import { homeFor } from "@/lib/roles";
import { PUBLIC_SITE_URL, routes } from "@/lib/routes";

/**
 * - /r/...      tracking links: public (excluded by the matcher)
 * - /go/...     partner links (LinkedIn etc.): public
 * - /link/...   "expired" / "not available" pages for those links: public
 * - /dridha/... dashboard: needs a login, and each section only opens for the roles in lib/roles.ts
 * - anything else: sent to the main DailyMattr website
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isDashboardPath(pathname)) {
    return NextResponse.redirect(PUBLIC_SITE_URL);
  }

  const user = await getSessionUser(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === routes.login) {
    return user ? NextResponse.redirect(new URL(homeFor(user.role), request.url)) : NextResponse.next();
  }

  if (!user) {
    const url = new URL(routes.login, request.url);
    if (pathname !== routes.dashboard) url.searchParams.set("from", pathname + search);
    const response = NextResponse.redirect(url);
    // A token for a paused or deleted user is useless; drop it.
    if (request.cookies.has(SESSION_COOKIE)) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  // Sections this role can't open send it to its own first section (e.g. admins land on App Stores).
  if (!canOpenPath(user.role, pathname)) {
    return NextResponse.redirect(new URL(homeFor(user.role), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip tracking links and their status pages, API routes (they use API keys) and Next.js assets.
    "/((?!r/|go/|link/|api/|_next/|__nextjs|favicon.ico|icon.svg).*)",
  ],
};
