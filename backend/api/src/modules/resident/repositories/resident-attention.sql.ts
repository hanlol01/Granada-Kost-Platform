import { checkoutInvoiceBalanceSql } from '../../lease/helpers/checkout-read-model.helper';

/** Shared read-only predicates: counts and drill-down must refer to the same people. */
export const RESIDENT_ATTENTION_PREDICATES = {
  outstanding: `projection.projected_lease_status='active'
    AND projection.contract_settlement_remaining_amount>0
    AND (checkout_projection.checkout_lease_id IS DISTINCT FROM projection.projected_lease_id
      OR COALESCE(checkout_projection.checkout_state,'none')<>'completed')`,
  awaiting_activation: `residents.resident_status='pending_activation'
    AND projection.projected_lease_status='awaiting_activation'`,
  lease_expired: `projection.projected_lease_status='active'
    AND projection.lease_end::date <= (now() AT TIME ZONE 'Asia/Jakarta')::date
    AND (checkout_projection.checkout_lease_id IS DISTINCT FROM projection.projected_lease_id
      OR COALESCE(checkout_projection.checkout_state,'none') NOT IN ('scheduled','inspection_required','settlement_pending','completed'))`,
  refund_pending: `checkout_projection.checkout_financial_status='refund_pending'`,
  amount_due: `checkout_projection.checkout_financial_status='amount_due'`,
  lease_ending: `projection.projected_lease_status='active'
    AND projection.lease_end::date > (now() AT TIME ZONE 'Asia/Jakarta')::date
    AND projection.lease_end::date <= (now() AT TIME ZONE 'Asia/Jakarta')::date + 30
    AND (checkout_projection.checkout_lease_id IS DISTINCT FROM projection.projected_lease_id
      OR COALESCE(checkout_projection.checkout_state,'none') NOT IN ('scheduled','inspection_required','settlement_pending','completed'))`,
  awaiting_handover: `checkout_projection.checkout_state='scheduled'
    AND checkout_projection.handover_date >= (now() AT TIME ZONE 'Asia/Jakarta')::date`,
  handover_overdue: `checkout_projection.checkout_state='scheduled'
    AND checkout_projection.handover_date < (now() AT TIME ZONE 'Asia/Jakarta')::date`,
} as const;

export type ResidentAttentionCategory = keyof typeof RESIDENT_ATTENTION_PREDICATES;

export const RESIDENT_CHECKOUT_JOIN = `LEFT JOIN LATERAL (
  SELECT checkout.state AS checkout_state,checkout.lease_id AS checkout_lease_id,checkout.effective_date AS handover_date,
    CASE
      WHEN refund.refund_status='settled' THEN 'refund_settled'
      WHEN refund.refund_status='waived' THEN 'refund_waived'
      WHEN refund.refund_status IN ('pending','reversed') THEN 'refund_pending'
      WHEN settlement.decision_status='refund_pending' THEN 'refund_pending'
      WHEN settlement.decision_status='amount_due'
        AND (balance.link_count=0 OR balance.remaining_amount>0) THEN 'amount_due'
      WHEN settlement.decision_status IN ('amount_due','closed') THEN 'closed'
      WHEN checkout.state='scheduled' AND checkout.effective_date < (now() AT TIME ZONE 'Asia/Jakarta')::date THEN 'handover_overdue'
      WHEN checkout.state='scheduled' THEN 'awaiting_handover'
      ELSE 'in_progress'
    END AS checkout_financial_status,
    refund.amount AS refund_amount,refund.refund_due_date
  FROM lease_checkout_commands checkout
  LEFT JOIN lease_exit_final_settlements settlement
    ON settlement.checkout_command_id=checkout.id AND settlement.property_id=checkout.property_id
  LEFT JOIN lease_exit_refunds refund
    ON refund.final_settlement_id=settlement.id AND refund.property_id=checkout.property_id
  LEFT JOIN LATERAL (${checkoutInvoiceBalanceSql('settlement')}) balance ON true
  WHERE checkout.resident_id=residents.id AND checkout.property_id=residents.property_id
    AND checkout.state<>'cancelled'
  ORDER BY checkout.created_at DESC,checkout.id DESC LIMIT 1
) checkout_projection ON true`;

export function residentAttentionFilterSql(parameter: string): string {
  return `(${parameter}::text IS NULL OR CASE ${parameter}
    ${Object.entries(RESIDENT_ATTENTION_PREDICATES)
      .map(([category, predicate]) => `WHEN '${category}' THEN (${predicate})`)
      .join('\n')}
    ELSE false END) /* attention_category */`;
}

export const CHECKOUT_STATUS_FILTER_SQL = `($14::text IS NULL
  OR checkout_projection.checkout_financial_status=$14
  OR ($14='awaiting_handover' AND checkout_projection.checkout_state='scheduled')
  OR ($14='attention' AND checkout_projection.checkout_financial_status IN
    ('in_progress','awaiting_handover','handover_overdue','refund_pending','amount_due')))`;
