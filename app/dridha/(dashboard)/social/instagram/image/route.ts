import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth";

/** Instagram's image hosts. Nothing else is fetched, so this can't be used to reach other sites. */
const HOSTS = ["cdninstagram.com", "fbcdn.net"];

/**
 * Passes Instagram post and profile pictures through, since Instagram's image hosts can refuse
 * to show them on other sites.
 */
export async function GET(request: NextRequest) {
  if (!isValidSessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return new NextResponse(null, { status: 401 });

  let url: URL;
  try {
    url = new URL(request.nextUrl.searchParams.get("url") ?? "");
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (url.protocol !== "https:" || !HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))) {
    return new NextResponse(null, { status: 400 });
  }

  // No redirects, so the allowed hosts can't hand us off somewhere else.
  const res = await fetch(url, { redirect: "error", cache: "no-store" }).catch(() => null);
  const type = res?.headers.get("content-type") ?? "";
  if (!res?.ok || !type.startsWith("image/")) return new NextResponse(null, { status: 502 });

  return new NextResponse(res.body, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" } });
}
