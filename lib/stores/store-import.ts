import { isoDay } from "@/lib/stores/shared";

/**
 * Reads a Play Console Statistics export ("Users lost", daily) into uninstalls per day.
 * Exports come in a few shapes, so this accepts:
 * - UTF-8 or UTF-16 files, with or without a few title lines before the table,
 * - dates like 2026-10-05, 10/5/26, 10/5/2026 or "Oct 5, 2026",
 * - one number column, or one column per country/source (added up), optionally with a total column.
 */

export type ParsedImport = { days: { date: string; count: number }[]; columns: string[] };

export function decodeCsv(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

export function splitRow(line: string, delimiter: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === delimiter && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

/** YYYY-MM-DD from the date formats Play Console exports use, or null. */
export function parseDay(value: string) {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (us) {
    const year = us[3]!.length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
    return isoDay(new Date(Date.UTC(year, Number(us[1]) - 1, Number(us[2]))));
  }
  const parsed = Date.parse(`${v} UTC`);
  if (!Number.isNaN(parsed)) return isoDay(new Date(parsed));
  return null;
}

const toNumber = (cell: string) => {
  const cleaned = cell.replace(/[,\s]/g, "");
  if (cleaned === "" || cleaned === "-") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const TOTAL_COLUMN = /^(all|total)\b|users lost|uninstall|lost/i;

/** The file's lines as cells, comma- or tab-separated. */
function readRows(text: string) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const delimiter = lines.some((l) => l.includes("\t")) && !lines.some((l) => l.includes(",")) ? "\t" : ",";
  return lines.map((l) => {
    const cells = splitRow(l, delimiter);
    // An unquoted "Oct 5, 2026" splits at its comma: put the date back together.
    if (/^[A-Za-z]{3,9}\.? \d{1,2}$/.test(cells[0] ?? "") && /^\d{4}$/.test(cells[1] ?? "")) {
      cells.splice(0, 2, `${cells[0]}, ${cells[1]}`);
    }
    return cells;
  });
}

export function parseDailyCountCsv(text: string): ParsedImport {
  const rows = readRows(text);

  // The table starts at the first row whose first cell says "Date".
  // Title lines like "Start Date,7/22/26" aren't the header.
  const headerIndex = rows.findIndex((r) => /^(date|day)/i.test(r[0] ?? ""));
  if (headerIndex < 0) throw new Error("Couldn’t find a “Date” column. Export the report as CSV with a daily interval.");
  const header = rows[headerIndex]!;
  const body = rows.slice(headerIndex + 1).filter((r) => parseDay(r[0] ?? "") !== null);
  if (body.length === 0) throw new Error("No dated rows found in the file.");

  // Number columns: every column after Date where all rows hold a number.
  const numeric = header
    .map((name, i) => ({ name, i }))
    .slice(1)
    .filter(({ i }) => body.every((r) => toNumber(r[i] ?? "") !== null));
  if (numeric.length === 0) throw new Error("No number columns found next to the dates.");

  // Prefer a total column; otherwise add up the per-country / per-source columns.
  const total = numeric.length > 1 ? numeric.find(({ name }) => TOTAL_COLUMN.test(name)) : undefined;
  const used = total ? [total] : numeric;

  const byDay = new Map<string, number>();
  for (const r of body) {
    const date = parseDay(r[0]!)!;
    const count = used.reduce((sum, { i }) => sum + (toNumber(r[i] ?? "") ?? 0), 0);
    byDay.set(date, (byDay.get(date) ?? 0) + Math.round(count));
  }
  return {
    days: [...byDay].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
    columns: used.map(({ name }) => name || "(unnamed)"),
  };
}

export type ParsedReferrers = { rows: { date: string; referrer: string; count: number }[]; referrers: string[] };

const REFERRER_COLUMN = /referr?er|source/i;

/** App Store Connect names its export columns "WhatsApp Messenger Total Downloads": keep the app name. */
export const cleanReferrerName = (name: string) => name.replace(/\s*[-–:]?\s*(total\s+)?downloads?\s*$/i, "").trim() || name;

/**
 * Reads App Store Connect's Analytics export of Total Downloads "By App Referrer" (daily). Accepts
 * a Date column with one column per app (how App Store Connect exports it), or one row per day and
 * app with Date, App Referrer and a number column. Every day × app is returned, zeros included,
 * so the file says which days it covers.
 */
export function parseAppReferrerCsv(text: string): ParsedReferrers {
  const rows = readRows(text);
  const headerIndex = rows.findIndex((r) => r.some((c) => /^(date|day)/i.test(c)));
  if (headerIndex < 0) {
    throw new Error("Couldn’t find a “Date” column. In App Store Connect pick Days, then export the chart as CSV.");
  }
  const header = rows[headerIndex]!;
  const dateCol = header.findIndex((c) => /^(date|day)/i.test(c));
  const body = rows.slice(headerIndex + 1).filter((r) => parseDay(r[dateCol] ?? "") !== null);
  if (body.length === 0) throw new Error("No dated rows found in the file.");

  const out: ParsedReferrers["rows"] = [];
  const referrerCol = header.findIndex((c, i) => i !== dateCol && REFERRER_COLUMN.test(c));
  const numberCol = (r: string[]) => (i: number) => i !== dateCol && i !== referrerCol && toNumber(r[i] ?? "") !== null;

  if (referrerCol >= 0) {
    // One row per day and app: the count is the first number column after the names.
    const countCol = header.findIndex((_, i) => body.every((r) => numberCol(r)(i)));
    if (countCol < 0) throw new Error("No downloads column found next to the app names.");
    for (const r of body) {
      const referrer = cleanReferrerName(r[referrerCol]?.trim() ?? "");
      if (referrer) out.push({ date: parseDay(r[dateCol]!)!, referrer, count: Math.round(toNumber(r[countCol] ?? "") ?? 0) });
    }
  } else {
    // One column per app; a total column, if any, is left out.
    const apps = header
      .map((name, i) => ({ name: cleanReferrerName(name.trim()), i }))
      .filter(({ name, i }) => i !== dateCol && name && !/^(all|total)\b/i.test(name) && body.every((r) => numberCol(r)(i)));
    if (apps.length === 0) throw new Error("No app columns found next to the dates. Export the chart “By App Referrer”.");
    for (const r of body) {
      for (const { name, i } of apps) out.push({ date: parseDay(r[dateCol]!)!, referrer: name, count: Math.round(toNumber(r[i] ?? "") ?? 0) });
    }
  }

  // The same day and app twice (e.g. repeated rows) are added up.
  const merged = new Map<string, ParsedReferrers["rows"][number]>();
  for (const row of out) {
    const key = `${row.date}\u0000${row.referrer}`;
    const existing = merged.get(key);
    if (existing) existing.count += row.count;
    else merged.set(key, { ...row });
  }
  const result = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!result.some((r) => r.count > 0)) throw new Error("Every number in the file is 0.");
  return { rows: result, referrers: [...new Set(result.map((r) => r.referrer))] };
}

export type ParsedReferralCodes = { total: number; codes: number; used: number };

/** Adds up the "Usage Count" column of the referral portal's referral-codes export. */
export function parseReferralCodesCsv(text: string): ParsedReferralCodes {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const rows = lines.map((l) => splitRow(l, ","));
  const headerIndex = rows.findIndex((r) => r.some((c) => /^usage ?count$/i.test(c)));
  if (headerIndex < 0) throw new Error("Couldn’t find a “Usage Count” column. Upload the referral codes CSV from the referral portal.");
  const usageColumn = rows[headerIndex]!.findIndex((c) => /^usage ?count$/i.test(c));

  let total = 0;
  let codes = 0;
  let used = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const count = toNumber(row[usageColumn] ?? "");
    if (count === null || count < 0) throw new Error(`“${row[usageColumn]}” in the Usage Count column isn’t a number.`);
    codes++;
    total += count;
    if (count > 0) used++;
  }
  if (codes === 0) throw new Error("The file has no referral codes.");
  return { total, codes, used };
}
