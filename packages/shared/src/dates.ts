/**
 * Person date handling (PRD §12.4): exact, partial (year or year+month),
 * approximate, or unknown (all parts null). Stored as separate integer parts so
 * GEDCOM dates (M5) round-trip without loss.
 */

export interface DateParts {
  year: number | null;
  month: number | null;
  day: number | null;
  approx: boolean;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Validate parts: month/day require the coarser parts; ranges checked. */
export function validateDateParts(parts: DateParts): string | null {
  const { year, month, day } = parts;
  if (month !== null && year === null) return "A month requires a year";
  if (day !== null && month === null) return "A day requires a month";
  if (year !== null && (year < 1 || year > 9999)) return "Year must be between 1 and 9999";
  if (month !== null && (month < 1 || month > 12)) return "Month must be between 1 and 12";
  if (day !== null && (day < 1 || day > 31)) return "Day must be between 1 and 31";
  return null;
}

/** "May 3, 1892", "May 1892", "1892", "abt. 1892", or null when unknown. */
export function formatDateParts(parts: DateParts): string | null {
  const { year, month, day, approx } = parts;
  if (year === null) return null;
  let text: string;
  if (month !== null && day !== null) {
    text = `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
  } else if (month !== null) {
    text = `${MONTH_NAMES[month - 1]} ${year}`;
  } else {
    text = String(year);
  }
  return approx ? `abt. ${text}` : text;
}

/** "1892–1967", "b. 1892", "d. abt. 1967", or null when both unknown. */
export function formatLifespan(birth: DateParts, death: DateParts): string | null {
  const born = formatDateParts(birth);
  const died = formatDateParts(death);
  if (born && died) return `${born} – ${died}`;
  if (born) return `b. ${born}`;
  if (died) return `d. ${died}`;
  return null;
}
