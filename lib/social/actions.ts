"use server";

import { revalidatePath } from "next/cache";
import { routes } from "@/lib/routes";
import { requireSection } from "@/lib/session";
import { disconnect as disconnectFacebookPage } from "@/lib/social/facebook";
import { disconnect as disconnectInstagramAccount } from "@/lib/social/instagram";
import { refreshPlatformTrends } from "@/lib/social/ai-reports";
import { PLATFORMS, type PlatformKey } from "@/lib/social/overview";
import { disconnect } from "@/lib/social/youtube";
import { errorMessage } from "@/lib/stores/shared";

/** "Disconnect" on the YouTube page: forgets the channel and removes our access at Google. */
export async function disconnectYoutube() {
  await requireSection("social");
  await disconnect();
  revalidatePath(routes.youtube);
}

/** "Disconnect" on the Instagram page: forgets the account. */
export async function disconnectInstagram() {
  await requireSection("social");
  await disconnectInstagramAccount();
  revalidatePath(routes.instagram);
}

/** "Disconnect" on the Facebook page: forgets the Page. */
export async function disconnectFacebook() {
  await requireSection("social");
  await disconnectFacebookPage();
  revalidatePath(routes.facebook);
}

/** The refresh button on a platform's "Trending" tile: has the AI look at that platform's videos again now. */
export async function refreshTrends(platform: PlatformKey) {
  await requireSection("social");
  if (!(platform in PLATFORMS)) throw new Error("Unknown platform");
  try {
    await refreshPlatformTrends(platform);
    revalidatePath(routes[platform]);
    return { ok: true as const };
  } catch (e) {
    // Thrown errors lose their message in production, so hand it back as data.
    return { ok: false as const, error: errorMessage(e) };
  }
}
