import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import type { DeviceType } from "@/lib/generated/prisma/enums";

/** Download page that picks the right store. Used on the "link not available" pages. */
export const DOWNLOAD_URL = process.env.DOWNLOAD_URL ?? "https://www.dailymattr.com/download";

export const PLAY_STORE_URL =
  process.env.PLAY_STORE_URL ?? "https://play.google.com/store/apps/details?id=com.dailymattr";
/** App Store Connect campaign link; `ct` (the campaign name) is added per influencer. */
const APP_STORE_CAMPAIGN_URL = "https://apps.apple.com/app/apple-store/id6791996138";
const APP_STORE_PROVIDER_TOKEN = process.env.APP_STORE_PROVIDER_TOKEN ?? "1110627";

/**
 * Store links tagged for one influencer:
 * - Play Store: referrer=utm_source%3Dinstagram%26utm_campaign%3Dakash_ojha (the install referrer Play passes to the app)
 * - App Store: pt=1110627 & ct=Akash%20Ojha & mt=8 (App Store Connect campaign, named after the influencer).
 * An influencer's own link, when set, replaces the default for that store.
 */
export function influencerStoreUrls(
  influencer: { name: string; platform: string; playStoreUrl?: string | null; appStoreUrl?: string | null },
  code: string,
) {
  const android = new URL(PLAY_STORE_URL);
  android.searchParams.set(
    "referrer",
    new URLSearchParams({ utm_source: influencer.platform.toLowerCase(), utm_campaign: code.toLowerCase() }).toString(),
  );

  // Apple allows campaign names up to 40 characters.
  const campaign = encodeURIComponent(influencer.name.trim().slice(0, 40));
  const ios = `${APP_STORE_CAMPAIGN_URL}?pt=${APP_STORE_PROVIDER_TOKEN}&ct=${campaign}&mt=8`;

  return {
    android: influencer.playStoreUrl || android.toString(),
    ios: influencer.appStoreUrl || ios,
    customAndroid: !!influencer.playStoreUrl,
    customIos: !!influencer.appStoreUrl,
  };
}

/** iPhone, iPad and Mac visitors go to the App Store; everyone else to the Play Store. */
export function prefersAppStore(agent: ParsedAgent) {
  return agent.device === "IOS" || agent.os === "macOS";
}

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Short, URL-safe code without look-alike characters (0/O, 1/l/I). */
export function generateCode(length = 7) {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
  return code;
}

const BOT_PATTERN =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|embedly|curl|wget|python-requests|httpclient|headless|lighthouse/i;

export type ParsedAgent = {
  device: DeviceType;
  os: string | null;
  browser: string | null;
  isBot: boolean;
};

export function parseUserAgent(ua: string): ParsedAgent {
  const isBot = !ua || BOT_PATTERN.test(ua);

  let device: DeviceType = "OTHER";
  let os: string | null = null;
  if (/iPhone|iPad|iPod/i.test(ua)) {
    device = "IOS";
    os = "iOS";
  } else if (/Android/i.test(ua)) {
    device = "ANDROID";
    os = "Android";
  } else if (/Windows NT/i.test(ua)) {
    device = "DESKTOP";
    os = "Windows";
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    device = "DESKTOP";
    os = "macOS";
  } else if (/Linux|CrOS/i.test(ua)) {
    device = "DESKTOP";
    os = /CrOS/i.test(ua) ? "ChromeOS" : "Linux";
  }

  let browser: string | null = null;
  if (/Instagram/i.test(ua)) browser = "Instagram";
  else if (/LinkedInApp/i.test(ua)) browser = "LinkedIn";
  else if (/FBAN|FBAV/i.test(ua)) browser = "Facebook";
  else if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) browser = "TikTok";
  else if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";
  else if (/Firefox|FxiOS/i.test(ua)) browser = "Firefox";
  else if (/Chrome|CriOS/i.test(ua)) browser = "Chrome";
  else if (/Safari/i.test(ua)) browser = "Safari";

  return { device, os, browser, isBot };
}

export function hashVisitor(ip: string, ua: string) {
  const salt = process.env.VISITOR_SALT ?? "influencer-marketing";
  return createHash("sha256").update(`${salt}:${ip}:${ua}`).digest("hex").slice(0, 32);
}

/** Public base URL for tracking links. Set NEXT_PUBLIC_APP_URL in production. */
export async function getBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function partnerUrl(baseUrl: string, slug: string) {
  return `${baseUrl}/go/${slug}`;
}

export function trackingUrl(baseUrl: string, code: string) {
  return `${baseUrl}/r/${code}`;
}
