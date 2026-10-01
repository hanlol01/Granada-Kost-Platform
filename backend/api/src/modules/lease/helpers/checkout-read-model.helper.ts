/** Current linked-invoice balance; the original final decision remains immutable. */
export function checkoutInvoiceBalanceSql(settlement: string): string {
  return `SELECT count(*) AS link_count,
    COALESCE(sum(LEAST(link.linked_amount, GREATEST(invoice.total_amount-invoice.credit_amount
      - COALESCE(paid.amount,0),0))),0)::bigint AS remaining_amount
    FROM lease_exit_final_invoice_links link
    JOIN invoices invoice ON invoice.id=link.invoice_id AND invoice.property_id=link.property_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(sum(allocation.allocated_amount-COALESCE(reversed.amount,0)),0) AS amount
      FROM payment_allocations allocation
      JOIN payments payment ON payment.id=allocation.payment_id AND payment.property_id=invoice.property_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(reversal.reversed_amount),0) AS amount
        FROM payment_reversal_allocations reversal WHERE reversal.original_allocation_id=allocation.id
      ) reversed ON true
      WHERE allocation.invoice_id=invoice.id AND payment.payment_status='verified'
    ) paid ON true
    WHERE link.final_settlement_id=${settlement}.id AND link.property_id=${settlement}.property_id`;
}
