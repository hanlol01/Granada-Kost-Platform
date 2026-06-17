import { InvoiceRecord, PaymentAllocationRecord } from '../types/billing.types';

export function calculateOutstandingBalance(
  invoice: Pick<InvoiceRecord, 'invoiceStatus' | 'totalAmount'>,
  allocations: Array<Pick<PaymentAllocationRecord, 'allocatedAmount' | 'allocationStatus'>>,
): number {
  if (invoice.invoiceStatus === 'void') {
    return 0;
  }

  const allocatedAmount = allocations
    .filter((allocation) => allocation.allocationStatus === 'active')
    .reduce((sum, allocation) => sum + allocation.allocatedAmount, 0);

  return Math.max(0, invoice.totalAmount - allocatedAmount);
}
