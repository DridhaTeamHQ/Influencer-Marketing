import { NextResponse, type NextRequest } from "next/server";
import { requestCanAccess } from "@/lib/auth";
import { routes } from "@/lib/routes";
import { OAUTH_STATE_COOKIE, completeSignIn } from "@/lib/social/facebook";
import { errorMessage } from "@/lib/stores/shared";

/** Facebook sends the browser back here after the consent page. */
export async function GET(request: NextRequest) {
  if (!(await requestCanAccess(request, "social"))) {
    return NextResponse.redirect(new URL(routes.login, request.url));
  }

  const params = request.nextUrl.searchParams;
  const state = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  let error: string | null = null;

  if (params.get("error")) {
    error =
      params.get("error_reason") === "user_denied"
        ? "You cancelled the Facebook sign-in."
        : `Facebook: ${params.get("error_description") ?? params.get("error")}`;
  } else if (!state || params.get("state") !== state) {
    error = "The sign-in expired or came from somewhere else. Try again.";
  } else {
    try {
      await completeSignIn(request.nextUrl.origin, params.get("code") ?? "");
    } catch (e) {
      error = errorMessage(e);
    }
  }

  const url = new URL(routes.facebook, request.url);
  if (error) url.searchParams.set("error", error);
  const response = NextResponse.redirect(url);
  response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: routes.facebook });
  return response;
}
