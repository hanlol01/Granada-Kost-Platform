/** Financial authority shared by candidate lists and period-correction previews.
 * `lease` must be the scoped leases alias in the surrounding query.
 * Corrections are not cash; reversed allocations do not satisfy rent settlement.
 */
export const ownerRealizationPaymentLedgerSql = `
  WITH rent_invoices AS (
    SELECT invoice.id, invoice.credit_amount - COALESCE(correction_credit.amount,0) AS cash_credit
      FROM invoices invoice
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(credit.amount),0) AS amount
          FROM lease_data_correction_invoice_credits credit
         WHERE credit.invoice_id=invoice.id AND credit.property_id=invoice.property_id
           AND credit.lease_id=invoice.lease_id
      ) correction_credit ON true
     WHERE invoice.property_id=lease.property_id AND invoice.lease_id=lease.id
       AND invoice.invoice_purpose='rent' AND invoice.authority_source='contract_schedule'
       AND invoice.invoice_status<>'void'
  ), payment_events AS (
    SELECT payment.id,COALESCE(payment.paid_at,payment.verified_at) AS paid_at,
           sum(allocation.allocated_amount-COALESCE(reversal.amount,0)) AS amount
      FROM rent_invoices invoice
      JOIN payment_allocations allocation ON allocation.invoice_id=invoice.id
        AND allocation.allocation_status='active'
      JOIN payments payment ON payment.id=allocation.payment_id
        AND payment.property_id=lease.property_id AND payment.payment_status='verified'
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(reversed_amount),0) AS amount
          FROM payment_reversal_allocations
         WHERE original_allocation_id=allocation.id
      ) reversal ON true
     GROUP BY payment.id,COALESCE(payment.paid_at,payment.verified_at)
    HAVING sum(allocation.allocated_amount-COALESCE(reversal.amount,0))>0
  ), running_payments AS (
    SELECT paid_at,sum(amount) OVER (ORDER BY paid_at,id ROWS UNBOUNDED PRECEDING) AS received
      FROM payment_events
  ), credits AS (
    SELECT COALESCE(sum(cash_credit),0) AS amount FROM rent_invoices
  )
  SELECT (credits.amount+COALESCE((SELECT sum(amount) FROM payment_events),0))::bigint AS verified_rent_credit,
         (SELECT min(paid_at) FROM running_payments
           WHERE credits.amount+received>=lease.contract_rent_amount) AS paid_in_full_at
    FROM credits
`;
