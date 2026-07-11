import { BadRequestException } from '@nestjs/common';
import type { BillingCycle } from './lease.types';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoBusinessDate(value: string): void {
  if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Business date must be YYYY-MM-DD',
    });
  }
}

export function nextBillingStart(
  startDate: string,
  cycle: BillingCycle,
  anchorDay: number,
): string {
  const [year, month] = dateParts(startDate);
  if (cycle === 'monthly') {
    const thisMonth = formatDate(year, month, Math.min(anchorDay, daysInMonth(year, month)));
    if (thisMonth > startDate) return thisMonth;
    const next = addMonths(year, month, 1);
    return formatDate(
      next.year,
      next.month,
      Math.min(anchorDay, daysInMonth(next.year, next.month)),
    );
  }

  const thisYear = formatDate(year, month, Math.min(anchorDay, daysInMonth(year, month)));
  if (thisYear > startDate) return thisYear;
  return formatDate(year + 1, month, Math.min(anchorDay, daysInMonth(year + 1, month)));
}

export function previousDate(value: string): string {
  const [year, month, day] = dateParts(value);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return formatDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

export function dueDateWithinCycle(startDate: string, endDate: string, dueDay: number): string {
  const [year, month] = dateParts(startDate);
  const candidate = formatDate(year, month, Math.min(dueDay, daysInMonth(year, month)));
  if (candidate < startDate) return startDate;
  if (candidate > endDate) return endDate;
  return candidate;
}

export function dateParts(value: string): [number, number, number] {
  assertIsoBusinessDate(value);
  const [year, month, day] = value.split('-').map(Number);
  return [year, month, day];
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function formatDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
