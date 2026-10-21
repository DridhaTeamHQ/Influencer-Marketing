import type { DeviceType, SocialPlatform } from "@/lib/generated/prisma/enums";

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  X: "X",
  FACEBOOK: "Facebook",
  LINKEDIN: "LinkedIn",
  OTHER: "Other",
};

const PROFILE_URLS: Partial<Record<SocialPlatform, (handle: string) => string>> = {
  INSTAGRAM: (h) => `https://www.instagram.com/${h}/`,
  YOUTUBE: (h) => `https://www.youtube.com/@${h}`,
  TIKTOK: (h) => `https://www.tiktok.com/@${h}`,
  X: (h) => `https://x.com/${h}`,
  FACEBOOK: (h) => `https://www.facebook.com/${h}`,
  LINKEDIN: (h) => `https://www.linkedin.com/in/${h}/`,
};

/** Link to the influencer's profile on their platform, or null when there's no handle. */
export function profileUrl(platform: SocialPlatform, handle: string | null) {
  if (!handle) return null;
  const build = PROFILE_URLS[platform];
  return build ? build(encodeURIComponent(handle.replace(/^@/, ""))) : null;
}

export const OTHERS_LABEL = "Others (Windows / Mac)";

/** "Android", "iOS", or "Others (Windows)" / "Others (Mac)" for everything else. */
export function deviceLabel(device: DeviceType, os: string | null) {
  if (device === "ANDROID") return "Android";
  if (device === "IOS") return "iOS";
  const name = os === "macOS" ? "Mac" : os;
  return name ? `Others (${name})` : "Others";
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en");

export const formatNumber = (n: number) => full.format(n);
export const formatCompact = (n: number) => compact.format(n);

/** "1 unique visitor", "3 unique visitors". */
export const uniqueVisitors = (n: number) => `${full.format(n)} unique visitor${n === 1 ? "" : "s"}`;

export function formatDate(date: Date, timeZone?: string) {
  return date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone });
}

/** "Oct 16 – Nov 15, 2026" for a campaign period, or null when no dates are set. */
export function formatPeriod(start: Date | null, end: Date | null) {
  if (!start && !end) return null;
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString("en", { month: "short", day: "numeric", year: withYear ? "numeric" : undefined, timeZone: "UTC" });
  if (start && end) {
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    return `${fmt(start, !sameYear)} – ${fmt(end, true)}`;
  }
  return start ? `From ${fmt(start, true)}` : `Until ${fmt(end!, true)}`;
}

/** Badge colors for each campaign status. */
export const PERIOD_BADGE = {
  Upcoming: "bg-chart-3/10 text-chart-3",
  Running: "bg-primary/10 text-primary dark:bg-primary/30 dark:text-primary-foreground",
  Ended: "bg-muted text-muted-foreground",
} as const;

/** Where today falls in the campaign period. */
export function periodStatus(start: Date | null, end: Date | null) {
  if (!start && !end) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (start && todayUtc < start.getTime()) return "Upcoming" as const;
  if (end && todayUtc > end.getTime()) return "Ended" as const;
  return "Running" as const;
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
