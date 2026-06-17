export type PaymentAllocationPlanInput = {
  paymentAmount: number;
  invoices: Array<{
    invoiceId: string;
    outstandingAmount: number;
  }>;
};

export type PaymentAllocationPlanItem = {
  invoiceId: string;
  allocatedAmount: number;
};

export function calculatePaymentAllocationPlan(input: PaymentAllocationPlanInput): PaymentAllocationPlanItem[] {
  let remaining = input.paymentAmount;
  const plan: PaymentAllocationPlanItem[] = [];

  for (const invoice of input.invoices) {
    if (remaining <= 0) {
      break;
    }

    const allocatedAmount = Math.min(remaining, invoice.outstandingAmount);
    if (allocatedAmount > 0) {
      plan.push({ invoiceId: invoice.invoiceId, allocatedAmount });
      remaining -= allocatedAmount;
    }
  }

  return plan;
}
