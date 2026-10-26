"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth";
import { routes } from "@/lib/routes";
import { disconnect } from "@/lib/social/youtube";

/** "Disconnect" on the YouTube page: forgets the channel and removes our access at Google. */
export async function disconnectYoutube() {
  if (!isValidSessionToken((await cookies()).get(SESSION_COOKIE)?.value)) throw new Error("Not signed in");
  await disconnect();
  revalidatePath(routes.youtube);
}
