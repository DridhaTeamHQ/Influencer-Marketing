"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth";
import { routes } from "@/lib/routes";
import { disconnect as disconnectFacebookPage } from "@/lib/social/facebook";
import { disconnect as disconnectInstagramAccount } from "@/lib/social/instagram";
import { disconnect as disconnectLinkedinPage } from "@/lib/social/linkedin";
import { disconnect } from "@/lib/social/youtube";

/** "Disconnect" on the YouTube page: forgets the channel and removes our access at Google. */
export async function disconnectYoutube() {
  if (!isValidSessionToken((await cookies()).get(SESSION_COOKIE)?.value)) throw new Error("Not signed in");
  await disconnect();
  revalidatePath(routes.youtube);
}

/** "Disconnect" on the Instagram page: forgets the account. */
export async function disconnectInstagram() {
  if (!isValidSessionToken((await cookies()).get(SESSION_COOKIE)?.value)) throw new Error("Not signed in");
  await disconnectInstagramAccount();
  revalidatePath(routes.instagram);
}

/** "Disconnect" on the Facebook page: forgets the Page. */
export async function disconnectFacebook() {
  if (!isValidSessionToken((await cookies()).get(SESSION_COOKIE)?.value)) throw new Error("Not signed in");
  await disconnectFacebookPage();
  revalidatePath(routes.facebook);
}

/** "Disconnect" on the LinkedIn page: forgets the company page and revokes our access at LinkedIn. */
export async function disconnectLinkedin() {
  if (!isValidSessionToken((await cookies()).get(SESSION_COOKIE)?.value)) throw new Error("Not signed in");
  await disconnectLinkedinPage();
  revalidatePath(routes.linkedinPage);
}
