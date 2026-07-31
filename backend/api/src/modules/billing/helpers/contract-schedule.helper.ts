export type ContractPaymentPlan = 'annual_full' | 'two_month_installments';

export type ContractScheduleItem = {
  sequenceNumber: number;
  coverageStartDate: string;
  coverageEndDate: string;
  dueDate: string;
  scheduledAmount: number;
};

type ContractScheduleInput = {
  startDate: string;
  termMonths: number;
  paymentPlanType: ContractPaymentPlan;
  contractRentAmount: number;
};

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function minimumDpAmount(contractRentAmount: number): number {
  const rent = exactMoney(contractRentAmount, 'contract rent');
  return exactMoney(Number((BigInt(rent) * 25n + 99n) / 100n), 'minimum DP');
}

export function buildContractSchedule(input: ContractScheduleInput): ContractScheduleItem[] {
  if (!Number.isSafeInteger(input.termMonths) || input.termMonths < 12) {
    throw new RangeError('Lease term must be at least 12 months');
  }
  if (input.paymentPlanType === 'two_month_installments' && input.termMonths % 2 !== 0) {
    throw new RangeError('Two-month installments require an even lease term');
  }
  const contractRent = exactMoney(input.contractRentAmount, 'contract rent');
  const installmentCount =
    input.paymentPlanType === 'annual_full' ? 1 : input.termMonths / 2;
  const coverageMonths =
    input.paymentPlanType === 'annual_full' ? input.termMonths : 2;
  const start = parseBusinessDate(input.startDate);
  const amount = BigInt(contractRent);
  const baseAmount = amount / BigInt(installmentCount);
  const schedule: ContractScheduleItem[] = [];
  const contractEnd = addDays(addCalendarMonths(start, input.termMonths), -1);
  let coverageStart = start;

  for (let index = 0; index < installmentCount; index += 1) {
    const nextCoverageStart = addCalendarMonths(coverageStart, coverageMonths);
    const coverageEnd =
      index === installmentCount - 1 ? contractEnd : addDays(nextCoverageStart, -1);
    const scheduledAmount =
      index === installmentCount - 1
        ? amount - baseAmount * BigInt(installmentCount - 1)
        : baseAmount;
    schedule.push({
      sequenceNumber: index + 1,
      coverageStartDate: formatBusinessDate(coverageStart),
      coverageEndDate: formatBusinessDate(coverageEnd),
      dueDate: formatBusinessDate(index === 0 ? coverageStart : addDays(coverageStart, -7)),
      scheduledAmount: exactMoney(Number(scheduledAmount), 'installment amount'),
    });
    coverageStart = nextCoverageStart;
  }

  const total = schedule.reduce((sum, item) => sum + BigInt(item.scheduledAmount), 0n);
  if (total !== amount) throw new RangeError('Installment schedule does not reconcile');
  return schedule;
}

function exactMoney(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function parseBusinessDate(value: string): Date {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new RangeError('Business date must use YYYY-MM-DD');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (formatBusinessDate(date) !== value) throw new RangeError('Business date is invalid');
  return date;
}

function addCalendarMonths(date: Date, months: number): Date {
  const firstOfTarget = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0),
  ).getUTCDate();
  firstOfTarget.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return firstOfTarget;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatBusinessDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
