-- Owner realization replaces future operational use of the legacy monthly
-- settlement model.  It is deliberately additive: historical settlements and
-- their documents remain immutable and readable.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.property_owner_profiles') IS NULL
     OR to_regclass('public.leases') IS NULL
     OR to_regclass('public.rooms') IS NULL
     OR to_regclass('public.idempotency_commands') IS NULL THEN
    RAISE EXCEPTION 'OWNER_REALIZATION_PREREQUISITES_MISSING'
      USING ERRCODE = 'undefined_table';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS property_owner_realizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  owner_profile_id UUID NOT NULL REFERENCES property_owner_profiles(id) ON DELETE RESTRICT,
  realization_period DATE NOT NULL,
  realization_reference TEXT NOT NULL,
  realization_status TEXT NOT NULL DEFAULT 'draft',
  entry_kind TEXT NOT NULL DEFAULT 'system',
  historical_source TEXT,
  owner_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  scope_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  tariff_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  room_count INTEGER NOT NULL DEFAULT 0,
  eligible_contract_total BIGINT NOT NULL DEFAULT 0,
  management_fee_total BIGINT NOT NULL DEFAULT 0,
  correction_total BIGINT NOT NULL DEFAULT 0,
  realization_total BIGINT NOT NULL DEFAULT 0,
  transferred_total BIGINT NOT NULL DEFAULT 0,
  notes TEXT,
  prepared_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  prepared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_for_review_at TIMESTAMPTZ,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  submitted_to_finance_at TIMESTAMPTZ,
  awaiting_transfer_at TIMESTAMPTZ,
  realized_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  published_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  voided_at TIMESTAMPTZ,
  voided_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_owner_realizations_period_check CHECK (
    realization_period = date_trunc('month', realization_period)::date
  ),
  CONSTRAINT property_owner_realizations_status_check CHECK (
    realization_status IN (
      'draft','awaiting_review','approved','submitted_to_finance',
      'awaiting_transfer','partially_realized','realized','published_to_owner','void'
    )
  ),
  CONSTRAINT property_owner_realizations_entry_kind_check CHECK (
    entry_kind IN ('system','historical_manual','historical_import')
  ),
  CONSTRAINT property_owner_realizations_snapshot_check CHECK (
    jsonb_typeof(owner_snapshot)='object'
    AND jsonb_typeof(scope_snapshot)='object'
    AND jsonb_typeof(tariff_snapshot)='object'
  ),
  CONSTRAINT property_owner_realizations_amount_check CHECK (
    room_count >= 0
    AND eligible_contract_total >= 0
    AND management_fee_total >= 0
    AND transferred_total >= 0
    AND realization_total = eligible_contract_total - management_fee_total + correction_total
    AND realization_total >= 0
  ),
  CONSTRAINT property_owner_realizations_historical_source_check CHECK (
    (entry_kind='system' AND historical_source IS NULL)
    OR (entry_kind IN ('historical_manual','historical_import')
        AND char_length(trim(COALESCE(historical_source,''))) BETWEEN 3 AND 120)
  ),
  CONSTRAINT property_owner_realizations_reference_unique UNIQUE(property_id, realization_reference),
  CONSTRAINT property_owner_realizations_owner_period_unique UNIQUE(property_id, owner_profile_id, realization_period)
);

CREATE INDEX IF NOT EXISTS idx_property_owner_realizations_property_status_period
  ON property_owner_realizations(property_id, realization_status, realization_period DESC);
CREATE INDEX IF NOT EXISTS idx_property_owner_realizations_owner_period
  ON property_owner_realizations(owner_profile_id, realization_period DESC);

CREATE TABLE IF NOT EXISTS property_owner_realization_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realization_id UUID NOT NULL REFERENCES property_owner_realizations(id) ON DELETE RESTRICT,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID REFERENCES leases(id) ON DELETE RESTRICT,
  room_id UUID REFERENCES rooms(id) ON DELETE RESTRICT,
  resident_id UUID REFERENCES residents(id) ON DELETE RESTRICT,
  line_kind TEXT NOT NULL DEFAULT 'lease',
  line_status TEXT NOT NULL DEFAULT 'eligible',
  room_code_snapshot TEXT NOT NULL,
  building_name_snapshot TEXT,
  resident_name_snapshot TEXT,
  owner_name_snapshot TEXT NOT NULL,
  plot_number_snapshot TEXT,
  duration_months SMALLINT,
  pricing_source_snapshot TEXT,
  pricing_tier_snapshot TEXT,
  payment_completed_at TIMESTAMPTZ,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  money_received_amount BIGINT NOT NULL DEFAULT 0,
  contract_total_amount BIGINT NOT NULL DEFAULT 0,
  outstanding_amount BIGINT NOT NULL DEFAULT 0,
  management_fee_amount BIGINT NOT NULL DEFAULT 0,
  correction_amount BIGINT NOT NULL DEFAULT 0,
  net_realization_amount BIGINT NOT NULL DEFAULT 0,
  legacy_reference TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_owner_realization_lines_kind_check CHECK (line_kind IN ('lease','historical')),
  CONSTRAINT property_owner_realization_lines_status_check CHECK (
    line_status IN ('eligible','historical_linked','historical_unlinked','released','reversed')
  ),
  CONSTRAINT property_owner_realization_lines_snapshot_check CHECK (jsonb_typeof(snapshot)='object'),
  CONSTRAINT property_owner_realization_lines_amount_check CHECK (
    money_received_amount >= 0
    AND contract_total_amount >= 0
    AND outstanding_amount >= 0
    AND management_fee_amount >= 0
    AND net_realization_amount = contract_total_amount - management_fee_amount + correction_amount
    AND net_realization_amount >= 0
  ),
  CONSTRAINT property_owner_realization_lines_lease_shape_check CHECK (
    (line_kind='lease' AND lease_id IS NOT NULL AND room_id IS NOT NULL AND resident_id IS NOT NULL)
    OR (line_kind='historical')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_property_owner_realization_lines_lease_per_realization
  ON property_owner_realization_lines(realization_id, lease_id) WHERE lease_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_property_owner_realization_lines_realization
  ON property_owner_realization_lines(realization_id, room_code_snapshot);

-- A lock is separate from the historical line so a voided report may release a
-- contract without deleting its former audit trail.
CREATE TABLE IF NOT EXISTS property_owner_realization_lease_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  realization_id UUID NOT NULL REFERENCES property_owner_realizations(id) ON DELETE RESTRICT,
  realization_line_id UUID NOT NULL REFERENCES property_owner_realization_lines(id) ON DELETE RESTRICT,
  lock_status TEXT NOT NULL DEFAULT 'locked',
  released_at TIMESTAMPTZ,
  released_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  release_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_owner_realization_lease_locks_status_check CHECK (lock_status IN ('locked','released')),
  CONSTRAINT property_owner_realization_lease_locks_release_check CHECK (
    (lock_status='locked' AND released_at IS NULL AND released_by_user_id IS NULL AND release_reason IS NULL)
    OR (lock_status='released' AND released_at IS NOT NULL AND released_by_user_id IS NOT NULL
        AND char_length(trim(COALESCE(release_reason,''))) BETWEEN 3 AND 500)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_property_owner_realization_active_lease_lock
  ON property_owner_realization_lease_locks(lease_id) WHERE lock_status='locked';
CREATE INDEX IF NOT EXISTS idx_property_owner_realization_lease_locks_realization
  ON property_owner_realization_lease_locks(realization_id, lock_status);

CREATE TABLE IF NOT EXISTS property_owner_realization_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realization_id UUID NOT NULL REFERENCES property_owner_realizations(id) ON DELETE RESTRICT,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  correction_kind TEXT NOT NULL,
  amount BIGINT NOT NULL,
  reason TEXT NOT NULL,
  evidence_reference TEXT,
  source_reference TEXT,
  correction_status TEXT NOT NULL DEFAULT 'approved',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_owner_realization_corrections_kind_check CHECK (
    correction_kind IN ('contract_correction','transfer_recovery','approved_operational_adjustment')
  ),
  CONSTRAINT property_owner_realization_corrections_amount_check CHECK (amount <> 0),
  CONSTRAINT property_owner_realization_corrections_reason_check CHECK (char_length(trim(reason)) BETWEEN 5 AND 1000),
  CONSTRAINT property_owner_realization_corrections_status_check CHECK (correction_status IN ('approved','reversed'))
);
CREATE INDEX IF NOT EXISTS idx_property_owner_realization_corrections_realization
  ON property_owner_realization_corrections(realization_id, created_at);

CREATE TABLE IF NOT EXISTS property_owner_realization_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realization_id UUID NOT NULL REFERENCES property_owner_realizations(id) ON DELETE RESTRICT,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  transfer_amount BIGINT NOT NULL,
  transfer_method TEXT NOT NULL,
  transfer_reference TEXT NOT NULL,
  transfer_evidence_reference TEXT,
  destination_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  transfer_status TEXT NOT NULL DEFAULT 'succeeded',
  transferred_at TIMESTAMPTZ NOT NULL,
  recorded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  receipt_number TEXT,
  receipt_issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_owner_realization_transfers_amount_check CHECK (transfer_amount > 0),
  CONSTRAINT property_owner_realization_transfers_method_check CHECK (
    transfer_method IN ('bank_transfer','cash','other')
  ),
  CONSTRAINT property_owner_realization_transfers_reference_check CHECK (char_length(trim(transfer_reference)) BETWEEN 3 AND 150),
  CONSTRAINT property_owner_realization_transfers_destination_check CHECK (jsonb_typeof(destination_snapshot)='object'),
  CONSTRAINT property_owner_realization_transfers_status_check CHECK (transfer_status IN ('succeeded','reversed','recovery')),
  CONSTRAINT property_owner_realization_transfers_receipt_unique UNIQUE(property_id, receipt_number)
);
CREATE INDEX IF NOT EXISTS idx_property_owner_realization_transfers_realization
  ON property_owner_realization_transfers(realization_id, transferred_at);

CREATE TABLE IF NOT EXISTS property_owner_realization_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realization_id UUID NOT NULL REFERENCES property_owner_realizations(id) ON DELETE RESTRICT,
  transfer_id UUID REFERENCES property_owner_realization_transfers(id) ON DELETE RESTRICT,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  document_kind TEXT NOT NULL,
  document_number TEXT NOT NULL,
  document_snapshot JSONB NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_owner_realization_documents_kind_check CHECK (document_kind IN ('payout_receipt','realization_report')),
  CONSTRAINT property_owner_realization_documents_snapshot_check CHECK (jsonb_typeof(document_snapshot)='object'),
  CONSTRAINT property_owner_realization_documents_number_unique UNIQUE(property_id, document_number),
  CONSTRAINT property_owner_realization_documents_transfer_unique UNIQUE(transfer_id, document_kind)
);
CREATE INDEX IF NOT EXISTS idx_property_owner_realization_documents_realization
  ON property_owner_realization_documents(realization_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS property_owner_realization_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realization_id UUID NOT NULL REFERENCES property_owner_realizations(id) ON DELETE RESTRICT,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  import_reference TEXT NOT NULL,
  source_filename TEXT,
  imported_row_count INTEGER NOT NULL DEFAULT 0,
  accepted_row_count INTEGER NOT NULL DEFAULT 0,
  rejected_row_count INTEGER NOT NULL DEFAULT 0,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_owner_realization_imports_count_check CHECK (
    imported_row_count >= 0 AND accepted_row_count >= 0 AND rejected_row_count >= 0
    AND accepted_row_count + rejected_row_count <= imported_row_count
  ),
  CONSTRAINT property_owner_realization_imports_reference_unique UNIQUE(property_id, import_reference),
  CONSTRAINT property_owner_realization_imports_realization_unique UNIQUE(realization_id)
);

CREATE OR REPLACE FUNCTION next_owner_realization_receipt_number(
  p_property_id UUID,
  p_issued_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TEXT LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_property_code TEXT;
  v_year SMALLINT;
  v_month TEXT;
  v_sequence BIGINT;
BEGIN
  SELECT document_code INTO v_property_code FROM properties WHERE id=p_property_id;
  IF v_property_code IS NULL THEN
    RAISE EXCEPTION 'OWNER_REALIZATION_PROPERTY_NOT_FOUND' USING ERRCODE='foreign_key_violation';
  END IF;
  v_year := extract(year FROM (COALESCE(p_issued_at,now()) AT TIME ZONE 'Asia/Jakarta'))::smallint;
  v_month := to_char(COALESCE(p_issued_at,now()) AT TIME ZONE 'Asia/Jakarta','MM');
  INSERT INTO billing_document_sequences(property_id,document_kind,sequence_year,last_value)
  VALUES(p_property_id,'owner_realization_receipt',v_year,1)
  ON CONFLICT(property_id,document_kind,sequence_year)
  DO UPDATE SET last_value=billing_document_sequences.last_value+1,updated_at=now()
  RETURNING last_value INTO v_sequence;
  RETURN format('KWT-RLS/%s/%s/%s/%s',v_property_code,v_year,v_month,lpad(v_sequence::text,4,'0'));
END;
$$;

-- The shared sequence table predates realization documents; retain its old
-- family and extend the constraint safely for replayed migrations.
ALTER TABLE billing_document_sequences
  DROP CONSTRAINT IF EXISTS billing_document_sequences_kind_check;
ALTER TABLE billing_document_sequences
  ADD CONSTRAINT billing_document_sequences_kind_check CHECK (
    document_kind IN (
      'invoice_rent','invoice_other_charge','receipt_booking_fee','receipt_down_payment',
      'receipt_full_settlement','receipt_rent','receipt_final_settlement','receipt_security_deposit',
      'receipt_other_charge','receipt_reversal','receipt_booking_refund','checkout_handover',
      'final_settlement','checkout_refund','receipt_management_fee','contract_paid_confirmation',
      'owner_realization_receipt'
    )
  );

INSERT INTO permissions(code,name,description)
VALUES ('property_owner.realization.manage','Manage Owner realizations','Prepare, approve, transfer, publish, import and export Owner realizations')
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description;

INSERT INTO role_permissions(role_id,permission_id)
SELECT roles.id,permissions.id FROM roles JOIN permissions ON permissions.code='property_owner.realization.manage'
WHERE roles.code IN ('owner','manager','admin')
ON CONFLICT DO NOTHING;

COMMIT;
