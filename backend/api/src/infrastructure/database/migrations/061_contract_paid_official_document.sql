-- Persist one immutable proof of full contract settlement for each payment episode
-- that brings a lease contract to a zero balance.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.lease_contract_settlements') IS NULL
     OR to_regclass('public.payment_reversals') IS NULL
     OR to_regclass('public.billing_document_sequences') IS NULL
     OR to_regprocedure('public.next_billing_document_number(uuid,text,timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'CONTRACT_PAID_DOCUMENT_PREREQUISITE_MISSING'
      USING ERRCODE = 'undefined_table';
  END IF;
END;
$$;

ALTER TABLE billing_document_sequences
  DROP CONSTRAINT IF EXISTS billing_document_sequences_kind_check;

ALTER TABLE billing_document_sequences
  ADD CONSTRAINT billing_document_sequences_kind_check CHECK (
    document_kind IN (
      'invoice_rent',
      'invoice_other_charge',
      'receipt_booking_fee',
      'receipt_down_payment',
      'receipt_full_settlement',
      'receipt_rent',
      'receipt_final_settlement',
      'receipt_security_deposit',
      'receipt_other_charge',
      'receipt_reversal',
      'receipt_booking_refund',
      'checkout_handover',
      'final_settlement',
      'checkout_refund',
      'contract_paid_confirmation'
    )
  );

CREATE OR REPLACE FUNCTION next_billing_document_number(
  p_property_id UUID,
  p_document_kind TEXT,
  p_issued_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TEXT LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_property_code TEXT;
  v_local_issued_at TIMESTAMP;
  v_year SMALLINT;
  v_month TEXT;
  v_sequence BIGINT;
  v_sequence_kind TEXT;
  v_segment TEXT;
BEGIN
  SELECT document_code
    INTO v_property_code
    FROM properties
   WHERE id = p_property_id;

  IF v_property_code IS NULL THEN
    RAISE EXCEPTION 'BILLING_DOCUMENT_PROPERTY_NOT_FOUND'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_segment := CASE p_document_kind
    WHEN 'invoice_rent' THEN 'SEWA-KOST'
    WHEN 'invoice_other_charge' THEN 'TAGIHAN-LAIN'
    WHEN 'receipt_booking_fee' THEN 'BIAYA-BOOKING'
    WHEN 'receipt_down_payment' THEN 'DP-KOST'
    WHEN 'receipt_full_settlement' THEN 'PELUNASAN-SEWA'
    WHEN 'receipt_rent' THEN 'SEWA-KOST'
    WHEN 'receipt_final_settlement' THEN 'PELUNASAN-SEWA'
    WHEN 'receipt_security_deposit' THEN 'DEPOSIT-JAMINAN'
    WHEN 'receipt_other_charge' THEN 'TAGIHAN-LAIN'
    WHEN 'receipt_reversal' THEN 'PEMBATALAN-REFUND'
    WHEN 'receipt_booking_refund' THEN 'REFUND-MINAT-BOOKING'
    WHEN 'checkout_handover' THEN 'BAST-KELUAR'
    WHEN 'final_settlement' THEN 'RINCIAN-AKHIR'
    WHEN 'checkout_refund' THEN 'REFUND-KELUAR'
    WHEN 'contract_paid_confirmation' THEN 'KONTRAK-LUNAS'
    ELSE NULL
  END;

  IF v_segment IS NULL THEN
    RAISE EXCEPTION 'BILLING_DOCUMENT_KIND_INVALID: %', p_document_kind
      USING ERRCODE = 'check_violation';
  END IF;

  v_sequence_kind := CASE
    WHEN p_document_kind = 'receipt_final_settlement' THEN 'receipt_full_settlement'
    ELSE p_document_kind
  END;

  v_local_issued_at := COALESCE(p_issued_at, now()) AT TIME ZONE 'Asia/Jakarta';
  v_year := extract(year FROM v_local_issued_at)::smallint;
  v_month := to_char(v_local_issued_at, 'MM');

  INSERT INTO billing_document_sequences(
    property_id, document_kind, sequence_year, last_value
  ) VALUES (
    p_property_id, v_sequence_kind, v_year, 1
  )
  ON CONFLICT(property_id, document_kind, sequence_year)
  DO UPDATE SET
    last_value = billing_document_sequences.last_value + 1,
    updated_at = now()
  RETURNING last_value INTO v_sequence;

  IF p_document_kind IN ('invoice_rent', 'invoice_other_charge') THEN
    RETURN format(
      'INV-%s-%s/%s/%s/%s',
      lpad(v_sequence::text, 3, '0'),
      v_month,
      v_segment,
      v_property_code,
      v_year
    );
  END IF;

  RETURN format(
    '%s-%s/%s/%s/%s',
    lpad(v_sequence::text, 3, '0'),
    v_month,
    v_segment,
    v_property_code,
    v_year
  );
END;
$$;

CREATE TABLE IF NOT EXISTS lease_contract_paid_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  settlement_id UUID NOT NULL REFERENCES lease_contract_settlements(id) ON DELETE RESTRICT,
  settling_payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  document_code TEXT NOT NULL,
  safe_snapshot JSONB NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  invalidated_at TIMESTAMPTZ,
  invalidated_by_reversal_id UUID REFERENCES payment_reversals(id) ON DELETE RESTRICT,
  invalidation_reason TEXT,
  CONSTRAINT lease_contract_paid_documents_code_unique UNIQUE (property_id, document_code),
  CONSTRAINT lease_contract_paid_documents_episode_unique UNIQUE (settlement_id, settling_payment_id),
  CONSTRAINT lease_contract_paid_documents_snapshot_check CHECK (
    jsonb_typeof(safe_snapshot) = 'object'
  ),
  CONSTRAINT lease_contract_paid_documents_invalidation_check CHECK (
    (invalidated_at IS NULL AND invalidated_by_reversal_id IS NULL AND invalidation_reason IS NULL)
    OR (
      invalidated_at IS NOT NULL
      AND invalidated_by_reversal_id IS NOT NULL
      AND char_length(trim(invalidation_reason)) BETWEEN 3 AND 1000
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_lease_contract_paid_documents_lease_issued
  ON lease_contract_paid_documents(property_id, lease_id, issued_at DESC);

CREATE OR REPLACE FUNCTION enforce_lease_contract_paid_document_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM lease_contract_settlements settlement
      JOIN payments payment
        ON payment.id = NEW.settling_payment_id
       AND payment.property_id = settlement.property_id
       AND payment.lease_id = settlement.lease_id
     WHERE settlement.id = NEW.settlement_id
       AND settlement.property_id = NEW.property_id
       AND settlement.lease_id = NEW.lease_id
  ) THEN
    RAISE EXCEPTION 'CONTRACT_PAID_DOCUMENT_SCOPE_MISMATCH'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lease_contract_paid_documents_scope
BEFORE INSERT ON lease_contract_paid_documents
FOR EACH ROW EXECUTE FUNCTION enforce_lease_contract_paid_document_scope();

CREATE OR REPLACE FUNCTION guard_lease_contract_paid_document_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.property_id IS DISTINCT FROM OLD.property_id
     OR NEW.lease_id IS DISTINCT FROM OLD.lease_id
     OR NEW.settlement_id IS DISTINCT FROM OLD.settlement_id
     OR NEW.settling_payment_id IS DISTINCT FROM OLD.settling_payment_id
     OR NEW.document_code IS DISTINCT FROM OLD.document_code
     OR NEW.safe_snapshot IS DISTINCT FROM OLD.safe_snapshot
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
     OR NEW.issued_by_user_id IS DISTINCT FROM OLD.issued_by_user_id THEN
    RAISE EXCEPTION 'CONTRACT_PAID_DOCUMENT_IMMUTABLE'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.invalidated_at IS NOT NULL AND ROW(
       NEW.invalidated_at,
       NEW.invalidated_by_reversal_id,
       NEW.invalidation_reason
     ) IS DISTINCT FROM ROW(
       OLD.invalidated_at,
       OLD.invalidated_by_reversal_id,
       OLD.invalidation_reason
     ) THEN
    RAISE EXCEPTION 'CONTRACT_PAID_DOCUMENT_INVALIDATION_IMMUTABLE'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lease_contract_paid_documents_immutable
BEFORE UPDATE ON lease_contract_paid_documents
FOR EACH ROW EXECUTE FUNCTION guard_lease_contract_paid_document_update();

CREATE OR REPLACE FUNCTION issue_contract_paid_document(
  p_property_id UUID,
  p_lease_id UUID,
  p_settling_payment_id UUID,
  p_actor_user_id UUID
)
RETURNS UUID LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_context RECORD;
  v_payment RECORD;
  v_existing_id UUID;
  v_document_id UUID;
  v_document_code TEXT;
  v_invoice_credit BIGINT := 0;
  v_outstanding BIGINT := 0;
  v_payment_total BIGINT := 0;
  v_initial_payment_total BIGINT := 0;
  v_contract_total BIGINT := 0;
  v_total_settled BIGINT := 0;
  v_transaction_codes JSONB := '[]'::jsonb;
  v_issued_at TIMESTAMPTZ;
  v_issued_by UUID;
BEGIN
  SELECT settlement.id AS settlement_id,
         settlement.policy_snapshot_id,
         lease.contract_rent_amount,
         lease.start_date::text AS lease_start,
         lease.end_date::text AS lease_end,
         lease.snapshot_room_number AS room_number,
         building.building_code,
         resident.full_name AS resident_name,
         property.name AS property_name,
         property.address AS property_address
    INTO v_context
    FROM lease_contract_settlements settlement
    JOIN leases lease
      ON lease.id=settlement.lease_id AND lease.property_id=settlement.property_id
    JOIN residents resident
      ON resident.id=lease.resident_id AND resident.property_id=lease.property_id
    JOIN properties property ON property.id=lease.property_id
    LEFT JOIN rooms room ON room.id=lease.room_id AND room.property_id=lease.property_id
    LEFT JOIN room_buildings building
      ON building.id=room.building_id AND building.property_id=room.property_id
   WHERE settlement.property_id=p_property_id
     AND settlement.lease_id=p_lease_id
   FOR UPDATE OF settlement;

  IF v_context.settlement_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT payment.verified_at,payment.paid_at,
         COALESCE(payment.verified_by_user_id,payment.received_by_user_id,p_actor_user_id) AS actor_id
    INTO v_payment
    FROM payments payment
   WHERE payment.id=p_settling_payment_id
     AND payment.property_id=p_property_id
     AND payment.lease_id=p_lease_id
     AND payment.payment_status='verified';

  IF v_payment.actor_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_existing_id
    FROM lease_contract_paid_documents
   WHERE settlement_id=v_context.settlement_id
     AND invalidated_at IS NULL
   ORDER BY issued_at DESC,id DESC
   LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  WITH scoped_invoice AS (
    SELECT invoice.id,invoice.total_amount,invoice.credit_amount,
           COALESCE(allocation.net,0) AS allocated_amount
      FROM invoices invoice
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(payment_allocation.allocated_amount
                 - COALESCE(reversal.reversed_amount,0)),0) AS net
          FROM payment_allocations payment_allocation
          LEFT JOIN LATERAL (
            SELECT COALESCE(sum(reversal_allocation.reversed_amount),0) AS reversed_amount
              FROM payment_reversal_allocations reversal_allocation
             WHERE reversal_allocation.original_allocation_id=payment_allocation.id
          ) reversal ON true
         WHERE payment_allocation.invoice_id=invoice.id
      ) allocation ON true
     WHERE invoice.property_id=p_property_id
       AND invoice.lease_id=p_lease_id
       AND invoice.invoice_purpose='rent'
       AND invoice.invoice_status<>'void'
       AND (
         (v_context.policy_snapshot_id IS NULL AND invoice.id=(
           SELECT settlement.invoice_id FROM lease_contract_settlements settlement
            WHERE settlement.id=v_context.settlement_id
         ))
         OR (v_context.policy_snapshot_id IS NOT NULL AND invoice.authority_source='contract_schedule')
       )
  )
  SELECT COALESCE(sum(credit_amount),0)::bigint,
         COALESCE(sum(GREATEST(total_amount-credit_amount-allocated_amount,0)),0)::bigint
    INTO v_invoice_credit,v_outstanding
    FROM scoped_invoice;

  WITH scoped_payment AS (
    SELECT payment.id,payment.payment_code,payment.paid_at,payment.command_fingerprint,
           sum(payment_allocation.allocated_amount
               - COALESCE(reversal.reversed_amount,0))::bigint AS net_amount
      FROM payment_allocations payment_allocation
      JOIN invoices invoice
        ON invoice.id=payment_allocation.invoice_id
       AND invoice.property_id=p_property_id
       AND invoice.lease_id=p_lease_id
       AND invoice.invoice_purpose='rent'
       AND invoice.invoice_status<>'void'
       AND (
         (v_context.policy_snapshot_id IS NULL AND invoice.id=(
           SELECT settlement.invoice_id FROM lease_contract_settlements settlement
            WHERE settlement.id=v_context.settlement_id
         ))
         OR (v_context.policy_snapshot_id IS NOT NULL AND invoice.authority_source='contract_schedule')
       )
      JOIN payments payment
        ON payment.id=payment_allocation.payment_id
       AND payment.property_id=p_property_id
       AND payment.lease_id=p_lease_id
       AND payment.payment_status='verified'
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(reversal_allocation.reversed_amount),0) AS reversed_amount
          FROM payment_reversal_allocations reversal_allocation
         WHERE reversal_allocation.original_allocation_id=payment_allocation.id
      ) reversal ON true
     GROUP BY payment.id,payment.payment_code,payment.paid_at,payment.command_fingerprint
  )
  SELECT COALESCE(sum(net_amount),0)::bigint,
         COALESCE(sum(net_amount) FILTER (
           WHERE command_fingerprint LIKE 'onboarding:%'
         ),0)::bigint,
         COALESCE(jsonb_agg(payment_code ORDER BY paid_at,id)
           FILTER (WHERE net_amount>0),'[]'::jsonb)
    INTO v_payment_total,v_initial_payment_total,v_transaction_codes
    FROM scoped_payment;

  v_contract_total := v_context.contract_rent_amount::bigint;
  v_total_settled := v_invoice_credit + v_payment_total;
  IF v_contract_total <= 0 OR v_outstanding > 0 OR v_total_settled < v_contract_total THEN
    RETURN NULL;
  END IF;

  v_issued_at := COALESCE(v_payment.verified_at,v_payment.paid_at,now());
  v_issued_by := v_payment.actor_id;
  v_document_code := next_billing_document_number(
    p_property_id,
    'contract_paid_confirmation',
    v_issued_at
  );

  INSERT INTO lease_contract_paid_documents(
    property_id,lease_id,settlement_id,settling_payment_id,document_code,
    safe_snapshot,issued_at,issued_by_user_id
  ) VALUES (
    p_property_id,p_lease_id,v_context.settlement_id,p_settling_payment_id,v_document_code,
    jsonb_build_object(
      'documentCode',v_document_code,
      'residentName',v_context.resident_name,
      'roomNumber',v_context.room_number,
      'buildingCode',v_context.building_code,
      'leaseStart',v_context.lease_start,
      'leaseEnd',v_context.lease_end,
      'contractRentAmount',v_contract_total,
      'initialRentCredit',v_initial_payment_total,
      'additionalRentPayments',GREATEST(v_payment_total-v_initial_payment_total,0),
      'contractAdjustmentAmount',v_invoice_credit,
      'totalRentReceived',v_payment_total,
      'totalSettledAmount',v_total_settled,
      'outstandingAmount',v_outstanding,
      'settledAt',v_issued_at,
      'issuedAt',v_issued_at,
      'transactionCodes',v_transaction_codes,
      'propertyName',v_context.property_name,
      'propertyAddress',v_context.property_address,
      'issuedByName',(SELECT display_name FROM users WHERE id=v_issued_by)
    ),
    v_issued_at,v_issued_by
  )
  RETURNING id INTO v_document_id;

  RETURN v_document_id;
END;
$$;

-- Existing fully paid leases receive the same immutable proof during rollout.
DO $$
DECLARE
  candidate RECORD;
BEGIN
  FOR candidate IN
    SELECT settlement.property_id,settlement.lease_id,payment.id AS payment_id,
           COALESCE(payment.verified_by_user_id,payment.received_by_user_id,lease.created_by_user_id) AS actor_id
      FROM lease_contract_settlements settlement
      JOIN leases lease
        ON lease.id=settlement.lease_id AND lease.property_id=settlement.property_id
      JOIN LATERAL (
        SELECT paid.id,paid.verified_by_user_id,paid.received_by_user_id
          FROM payments paid
         WHERE paid.property_id=settlement.property_id
           AND paid.lease_id=settlement.lease_id
           AND paid.payment_status='verified'
           AND paid.payment_purpose IN ('rent','dp')
         ORDER BY COALESCE(paid.verified_at,paid.paid_at) DESC,paid.id DESC
         LIMIT 1
      ) payment ON true
  LOOP
    PERFORM issue_contract_paid_document(
      candidate.property_id,
      candidate.lease_id,
      candidate.payment_id,
      candidate.actor_id
    );
  END LOOP;
END;
$$;

COMMIT;
