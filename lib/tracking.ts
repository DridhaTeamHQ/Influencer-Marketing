import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import type { DeviceType } from "@/lib/generated/prisma/enums";

/** Every tracking link redirects here; the page itself sends Android/iOS users to the right store. */
export const DOWNLOAD_URL = process.env.DOWNLOAD_URL ?? "https://www.dailymattr.com/download";

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
