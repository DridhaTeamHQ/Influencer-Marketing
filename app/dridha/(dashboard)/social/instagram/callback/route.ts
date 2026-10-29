import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth";
import { routes } from "@/lib/routes";
import { OAUTH_STATE_COOKIE, completeSignIn } from "@/lib/social/instagram";
import { errorMessage } from "@/lib/stores/shared";

/** Instagram sends the browser back here after the consent page. */
export async function GET(request: NextRequest) {
  if (!isValidSessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.redirect(new URL(routes.login, request.url));
  }

  const params = request.nextUrl.searchParams;
  const state = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  let error: string | null = null;

  if (params.get("error")) {
    error =
      params.get("error_reason") === "user_denied"
        ? "You cancelled the Instagram sign-in."
        : `Instagram: ${params.get("error_description") ?? params.get("error")}`;
  } else if (!state || params.get("state") !== state) {
    error = "The sign-in expired or came from somewhere else. Try again.";
  } else {
    try {
      await completeSignIn(request.nextUrl.origin, params.get("code") ?? "");
    } catch (e) {
      error = errorMessage(e);
    }
  }

  const url = new URL(routes.instagram, request.url);
  if (error) url.searchParams.set("error", error);
  const response = NextResponse.redirect(url);
  response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: routes.instagram });
  return response;
}
