/** Instagram Reel links. Safe to import on the client (no secrets, no fetching). */

const HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
const SHORTCODE_RE = /^[A-Za-z0-9_-]{5,64}$/;
const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;

export const canonicalReelUrl = (shortcode: string) => `https://www.instagram.com/reel/${shortcode}/`;

export type ParsedReel = { ok: true; shortcode: string; url: string } | { ok: false; message: string };

/** Accepts /reel/{code}/, /reels/{code}/ and /{username}/reel/{code}/ on instagram.com (query string ignored). */
export function parseReelUrl(input: string): ParsedReel {
  const raw = input.trim();
  if (!raw || raw.length > 2048) return { ok: false, message: "Enter an Instagram Reel link" };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, message: `${raw} is not a valid link` };
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port || !HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, message: `${raw} is not an instagram.com link` };
  }
  const parts = url.pathname.split("/").filter(Boolean);
  let shortcode: string | undefined;
  if (parts.length === 2 && (parts[0] === "reel" || parts[0] === "reels")) shortcode = parts[1];
  else if (parts.length === 3 && parts[1] === "reel" && USERNAME_RE.test(parts[0])) shortcode = parts[2];
  if (parts[0] === "share") {
    return { ok: false, message: "Share links (instagram.com/share/…) don't work. Open it and copy the /reel/ link." };
  }
  if (!shortcode || !SHORTCODE_RE.test(shortcode)) {
    return { ok: false, message: `${raw} is not a Reel link, e.g. https://www.instagram.com/reel/ABC123/` };
  }
  return { ok: true, shortcode, url: canonicalReelUrl(shortcode) };
}

/** Splits a textarea of links (one per line, or separated by spaces/commas) into unique Reels. */
export function parseReelList(text: string) {
  const reels = new Map<string, string>();
  const errors: string[] = [];
  for (const line of text.split(/[\s,]+/).filter(Boolean)) {
    const parsed = parseReelUrl(line);
    if (parsed.ok) reels.set(parsed.shortcode, parsed.url);
    else errors.push(parsed.message);
  }
  return { reels: [...reels].map(([shortcode, url]) => ({ shortcode, url })), errors };
}

/** Each Reel can be fetched this many times a day (India time), to stay inside the free Apify credit. */
export const REEL_FETCHES_PER_DAY = 2;

/** Today's date in India, at UTC midnight (how a @db.Date column stores it). */
export function reelFetchDay(now = new Date()) {
  const day = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Date(`${day}T00:00:00Z`);
}

/** Fetches this Reel has left today. */
export function reelFetchesLeft(reel: { fetchCount: number; fetchDay: Date | null }, now = new Date()) {
  const used = reel.fetchDay?.getTime() === reelFetchDay(now).getTime() ? reel.fetchCount : 0;
  return Math.max(0, REEL_FETCHES_PER_DAY - used);
}
