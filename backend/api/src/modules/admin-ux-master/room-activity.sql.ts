import { checkoutInvoiceBalanceSql } from '../lease/helpers/checkout-read-model.helper';

/** Read-only room activity; physical room references never follow the lease's current room. */
export const ROOM_ACTIVITY_SQL = `SELECT event_type, occurred_at, resident_name, other_room_number, notes, resident_id
  FROM (
    SELECT 'room_updated'::text AS event_type, audit.occurred_at,
      NULL::text AS resident_name, NULL::text AS other_room_number, NULL::text AS notes, NULL::uuid AS resident_id
    FROM audit_logs audit
    WHERE audit.property_id = $1 AND audit.resource_type = 'room' AND audit.resource_id = $2
      AND audit.action IN ('room.update.v2', 'room.status_update.v2')
    UNION ALL
    SELECT 'occupancy_' || history.event_type, history.created_at, resident.full_name, NULL, NULL, resident.id
    FROM occupancy_history history
    JOIN occupancies occupancy ON occupancy.id = history.occupancy_id AND occupancy.property_id = $1
    JOIN residents resident ON resident.id = occupancy.resident_id AND resident.property_id = occupancy.property_id
    WHERE occupancy.room_id = $2 AND history.event_type IN ('check_in', 'check_out')
    UNION ALL
    SELECT CASE WHEN transfer.from_room_id = $2 THEN 'room_transfer_out' ELSE 'room_transfer_in' END,
      transfer.created_at, resident.full_name,
      CASE WHEN transfer.from_room_id = $2 THEN destination.number ELSE origin.number END, NULL, resident.id
    FROM room_transfer_records transfer
    JOIN residents resident ON resident.id = transfer.resident_id AND resident.property_id = transfer.property_id
    JOIN rooms origin ON origin.id = transfer.from_room_id AND origin.property_id = transfer.property_id
    JOIN rooms destination ON destination.id = transfer.to_room_id AND destination.property_id = transfer.property_id
    WHERE transfer.property_id = $1 AND (transfer.from_room_id = $2 OR transfer.to_room_id = $2)
    UNION ALL
    SELECT 'lease_' || history.event_type, history.created_at, resident.full_name, NULL, NULL, resident.id
    FROM lease_history history
    JOIN leases lease ON lease.id = history.lease_id AND lease.property_id = history.property_id
    JOIN residents resident ON resident.id = lease.resident_id AND resident.property_id = lease.property_id
    WHERE history.property_id = $1
      AND COALESCE((SELECT transfer.from_room_id FROM room_transfer_records transfer
        WHERE transfer.property_id = lease.property_id AND transfer.from_lease_id = lease.id
        ORDER BY transfer.created_at, transfer.id LIMIT 1), lease.room_id) = $2
      AND history.event_type NOT IN ('transferred_out', 'transferred_in', 'checkout_completed')
    UNION ALL
    SELECT 'checkout_financial_completed',
      GREATEST(checkout.completed_at, refund.settled_at, final_payment.completed_at),
      resident.full_name, NULL, NULL, resident.id
    FROM lease_checkout_commands checkout
    JOIN residents resident ON resident.id = checkout.resident_id AND resident.property_id = checkout.property_id
    LEFT JOIN lease_exit_final_settlements settlement
      ON settlement.checkout_command_id = checkout.id AND settlement.property_id = checkout.property_id
    LEFT JOIN lease_exit_refunds refund
      ON refund.final_settlement_id = settlement.id AND refund.property_id = checkout.property_id
    LEFT JOIN LATERAL (${checkoutInvoiceBalanceSql('settlement')}) balance ON true
    LEFT JOIN LATERAL (
      SELECT max(COALESCE(payment.verified_at, payment.paid_at)) AS completed_at
      FROM lease_exit_final_invoice_links link
      JOIN payment_allocations allocation ON allocation.invoice_id = link.invoice_id
      JOIN payments payment ON payment.id = allocation.payment_id AND payment.property_id = link.property_id
      WHERE link.final_settlement_id = settlement.id AND link.property_id = checkout.property_id
        AND payment.payment_status = 'verified'
    ) final_payment ON true
    WHERE checkout.property_id = $1 AND checkout.room_id = $2 AND checkout.state = 'completed'
      AND (refund.refund_status IN ('settled', 'waived')
        OR (refund.id IS NULL AND settlement.decision_status = 'closed')
        OR (refund.id IS NULL AND settlement.decision_status = 'amount_due'
          AND balance.link_count > 0 AND balance.remaining_amount = 0))
    UNION ALL
    SELECT CASE WHEN event.payload->>'next_status' = 'vacant'
      THEN 'room_inspection_passed' ELSE 'room_inspection_failed' END,
      event.created_at, NULL, NULL, event.payload->>'notes', NULL::uuid
    FROM business_events event
    WHERE event.property_id = $1 AND event.aggregate_type = 'room' AND event.aggregate_id = $2
      AND event.event_type = 'room.inspection_resolved'
      AND event.payload->>'next_status' IN ('vacant', 'maintenance')
    UNION ALL
    SELECT 'hold_created', hold.created_at, NULL, NULL, NULL, NULL::uuid
    FROM booking_lead_holds hold WHERE hold.property_id = $1 AND hold.room_id = $2
    UNION ALL
    SELECT 'hold_released', hold.released_at, NULL, NULL, NULL, NULL::uuid
    FROM booking_lead_holds hold WHERE hold.property_id = $1 AND hold.room_id = $2 AND hold.released_at IS NOT NULL
    UNION ALL
    SELECT 'hold_expired', hold.expires_at, NULL, NULL, NULL, NULL::uuid
    FROM booking_lead_holds hold WHERE hold.property_id = $1 AND hold.room_id = $2 AND hold.hold_status = 'expired'
    UNION ALL
    SELECT 'maintenance_' || history.to_status, history.changed_at, NULL, NULL, NULL, NULL::uuid
    FROM maintenance_work_order_histories history
    JOIN maintenance_work_orders work_order ON work_order.id = history.work_order_id AND work_order.property_id = $1
    WHERE work_order.room_id = $2
  ) safe_timeline
  WHERE occurred_at IS NOT NULL
  ORDER BY occurred_at DESC, event_type
  LIMIT 50`;
