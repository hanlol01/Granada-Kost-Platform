/** A correction reduces the invoice face value; it is never rent money received.
 * Aliases are source-owned constants, never request input.
 */
export function contractCorrectionCreditSql(invoiceAlias: 'invoice' | 'i' | 'contract_invoice' | 'rent_invoice'): string {
  return `COALESCE((SELECT sum(correction.amount)
    FROM lease_data_correction_invoice_credits correction
    WHERE correction.invoice_id=${invoiceAlias}.id
      AND correction.property_id=${invoiceAlias}.property_id
      AND correction.lease_id=${invoiceAlias}.lease_id),0)`;
}

export function receivedInvoiceCreditSql(invoiceAlias: Parameters<typeof contractCorrectionCreditSql>[0]): string {
  return `(${invoiceAlias}.credit_amount-${contractCorrectionCreditSql(invoiceAlias)})`;
}
