import { BILLING_POLICY } from '../constants/billing.constants';

export type InvoiceCalculationInput = {
  monthlyPrice: number;
  additionalLineAmounts?: number[];
  lateFeeAmount?: number;
};

export type InvoiceCalculationResult = {
  subtotalAmount: number;
  lateFeeAmount: number;
  totalAmount: number;
  prorationPolicy: typeof BILLING_POLICY.prorationPolicy;
};

export function calculateInvoiceTotals(input: InvoiceCalculationInput): InvoiceCalculationResult {
  const additional = input.additionalLineAmounts?.reduce((sum, amount) => sum + amount, 0) ?? 0;
  const subtotalAmount = input.monthlyPrice + additional;
  const lateFeeAmount = input.lateFeeAmount ?? 0;

  return {
    subtotalAmount,
    lateFeeAmount,
    totalAmount: subtotalAmount + lateFeeAmount,
    prorationPolicy: BILLING_POLICY.prorationPolicy,
  };
}
