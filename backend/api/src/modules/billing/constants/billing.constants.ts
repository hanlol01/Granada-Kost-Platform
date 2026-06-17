export const BILLING_POLICY = {
  prorationPolicy: 'full_month',
  gracePeriodDays: 0,
  lateFeeRatePercentPerDay: 1,
  lateFeeCapPercent: 30,
} as const;

export const BILLING_AUDIT_ACTIONS = {
  invoiceCreate: 'invoice.create',
  invoiceIssue: 'invoice.issue',
  invoiceCancel: 'invoice.cancel',
  paymentRecord: 'payment.record',
  paymentAllocate: 'payment.allocate',
  paymentVerify: 'payment.verify',
  paymentReject: 'payment.reject',
} as const;
