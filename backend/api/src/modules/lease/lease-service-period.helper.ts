import { buildContractSchedule } from '../billing/helpers/contract-schedule.helper';

/** Stored lease end is exclusive; invoice coverage end is inclusive. */
export function buildServicePeriod(checkedInDate: string | null, termMonths: number) {
  if (checkedInDate === null) return { startDate: null, endDate: null };
  const [coverage] = buildContractSchedule({
    startDate: checkedInDate,
    termMonths,
    paymentPlanType: 'annual_full',
    contractRentAmount: 0,
  });
  const end = new Date(`${coverage.coverageEndDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { startDate: checkedInDate, endDate: end.toISOString().slice(0, 10) };
}

export function servicePeriodLabel(pending: boolean, termMonths: number | null | undefined) {
  return pending
    ? `${termMonths ? `${termMonths} bulan · ` : ''}Masa sewa belum dimulai—menunggu check-in`
    : null;
}
