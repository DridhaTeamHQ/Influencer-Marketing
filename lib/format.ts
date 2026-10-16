import type { DeviceType, SocialPlatform } from "@/lib/generated/prisma/enums";

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  X: "X",
  FACEBOOK: "Facebook",
  OTHER: "Other",
};

export const DEVICE_LABELS: Record<DeviceType, string> = {
  ANDROID: "Android",
  IOS: "iOS",
  DESKTOP: "Desktop",
  OTHER: "Other",
};

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en");

export const formatNumber = (n: number) => full.format(n);
export const formatCompact = (n: number) => compact.format(n);

export function formatDate(date: Date) {
  return date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

export function timeAgo(date: Date) {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (seconds >= size) return rtf.format(-Math.floor(seconds / size), unit);
  }
  return "just now";
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
