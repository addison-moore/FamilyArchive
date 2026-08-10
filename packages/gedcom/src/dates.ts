import type { GedcomDateParts } from "./types";

const MONTHS: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};
const MONTH_NAMES = Object.keys(MONTHS);

/**
 * Parse a GEDCOM DATE value into date parts:
 * exact/partial dates parse directly; ABT/EST/CAL mark approximate;
 * BEF/AFT/BET keep the first year found and mark approximate.
 * Returns null when no year can be extracted (raw value is still preserved).
 */
export function parseGedcomDate(raw: string): GedcomDateParts | null {
  let text = raw.trim().toUpperCase();
  let approx = false;

  const qualifier = /^(ABT|EST|CAL|ABOUT)\.?\s+/;
  if (qualifier.test(text)) {
    approx = true;
    text = text.replace(qualifier, "");
  }
  const range = /^(BEF|AFT|BEFORE|AFTER)\.?\s+/;
  if (range.test(text)) {
    approx = true;
    text = text.replace(range, "");
  }
  const between = /^BET\.?\s+(.+?)\s+AND\s+.+$/;
  const betweenMatch = text.match(between);
  if (betweenMatch?.[1]) {
    approx = true;
    text = betweenMatch[1];
  }
  // DATE_PERIOD, the FROM/TO counterpart of BET/AND. Without this the whole
  // value fell through to the year-salvage branch below.
  const period = /^FROM\s+(.+?)(?:\s+TO\s+.+)?$/;
  const periodMatch = text.match(period);
  if (periodMatch?.[1]) {
    approx = true;
    text = periodMatch[1];
  }
  const to = /^TO\s+(.+)$/;
  const toMatch = text.match(to);
  if (toMatch?.[1]) {
    approx = true;
    text = toMatch[1];
  }

  // A BC/BCE date cannot be represented by these fields, and salvaging the
  // number below would silently store it as an AD year. The raw value is kept
  // in metadata either way, so returning null loses nothing recoverable.
  if (/\bB\.?C\.?(E\.?)?\b/.test(text)) return null;

  // Dual dating ("1 JAN 1750/51"): pre-1752 English records carry both the
  // Julian and Gregorian year. Keep the first, which is the Julian year the
  // rest of the record is stated in — otherwise the whole value failed the
  // shape match and degraded to an approximate year with no month or day.
  // The second half is written either short ("1750/51") or in full ("1699/1700").
  text = text.replace(/\b(\d{3,4})\/\d{1,4}\b/, "$1");

  let match = text.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{3,4})$/);
  if (match && MONTHS[match[2]!]) {
    return {
      year: Number(match[3]),
      month: MONTHS[match[2]!]!,
      day: Number(match[1]),
      approx,
    };
  }
  match = text.match(/^([A-Z]{3})\s+(\d{3,4})$/);
  if (match && MONTHS[match[1]!]) {
    return { year: Number(match[2]), month: MONTHS[match[1]!]!, day: null, approx };
  }
  match = text.match(/^(\d{3,4})$/);
  if (match) {
    return { year: Number(match[1]), month: null, day: null, approx };
  }
  // Unrecognized shape (interpreted dates, phrases): salvage a year if present.
  match = text.match(/(\d{4})/);
  if (match) {
    return { year: Number(match[1]), month: null, day: null, approx: true };
  }
  return null;
}

/** Format date parts as a GEDCOM DATE value; null when there is no year. */
export function formatGedcomDate(parts: GedcomDateParts): string | null {
  const { year, month, day, approx } = parts;
  if (year === null) return null;
  let text: string;
  if (month !== null && day !== null) {
    text = `${day} ${MONTH_NAMES[month - 1]} ${year}`;
  } else if (month !== null) {
    text = `${MONTH_NAMES[month - 1]} ${year}`;
  } else {
    text = String(year);
  }
  return approx ? `ABT ${text}` : text;
}
