export type LeaseCorrectionImpact = {
  contractDelta: number;
  additionalCharge: number;
  contractCredit: number;
  verifiedRentPayment: number;
  outstandingAfter: number;
  overpaymentAfter: number;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function calculateCorrectedLeaseEndDate(startDate: string, termMonths: number): string {
  if (
    !ISO_DATE.test(startDate) ||
    !Number.isInteger(termMonths) ||
    termMonths < 1 ||
    termMonths > 120
  )
    throw new RangeError('Invalid lease correction date or duration');
  const [year, month, day] = startDate.split('-').map(Number);
  const source = new Date(Date.UTC(year, month - 1, 1));
  source.setUTCMonth(source.getUTCMonth() + termMonths);
  const lastDay = new Date(
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 0),
  ).getUTCDate();
  source.setUTCDate(Math.min(day, lastDay));
  return source.toISOString().slice(0, 10);
}

export function calculateLeaseCorrectionImpact(
  previousContractAmount: number,
  correctedContractAmount: number,
  verifiedRentPayment: number,
): LeaseCorrectionImpact {
  if (
    [previousContractAmount, correctedContractAmount, verifiedRentPayment].some(
      (value) => !Number.isSafeInteger(value) || value < 0,
    )
  )
    throw new RangeError('Invalid lease correction amount');
  const contractDelta = correctedContractAmount - previousContractAmount;
  return {
    contractDelta,
    additionalCharge: Math.max(contractDelta, 0),
    contractCredit: Math.max(-contractDelta, 0),
    verifiedRentPayment,
    outstandingAfter: Math.max(correctedContractAmount - verifiedRentPayment, 0),
    overpaymentAfter: Math.max(verifiedRentPayment - correctedContractAmount, 0),
  };
}
