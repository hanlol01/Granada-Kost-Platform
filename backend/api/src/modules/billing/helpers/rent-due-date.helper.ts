export const UNIFORM_RENT_DUE_DAY = 15;

const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The rent due date is the first 15th that is on or after the coverage start.
 * This keeps a due date from falling before the service period it settles.
 */
export function rentDueDateOnOrAfter(coverageStartDate: string): string {
  const { year, month, day } = parseBusinessDate(coverageStartDate);
  if (day <= UNIFORM_RENT_DUE_DAY) return formatBusinessDate(year, month, UNIFORM_RENT_DUE_DAY);

  const next = addMonths(year, month, 1);
  return formatBusinessDate(next.year, next.month, UNIFORM_RENT_DUE_DAY);
}

function parseBusinessDate(value: string): { year: number; month: number; day: number } {
  const match = BUSINESS_DATE_PATTERN.exec(value);
  if (!match) throw new RangeError('Business date must use YYYY-MM-DD');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    formatBusinessDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate()) !==
    value
  ) {
    throw new RangeError('Business date is invalid');
  }
  return { year, month, day };
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + month - 1 + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function formatBusinessDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
}
