CREATE TABLE IF NOT EXISTS billing_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_periods_status_check CHECK (status IN ('open', 'closed', 'cancelled')),
  CONSTRAINT billing_periods_date_check CHECK (end_date >= start_date),
  CONSTRAINT billing_periods_due_date_check CHECK (due_date BETWEEN start_date AND end_date),
  CONSTRAINT billing_periods_unique_period UNIQUE (property_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_billing_periods_property_period
  ON billing_periods(property_id, period_key);

CREATE TABLE IF NOT EXISTS payment_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL DEFAULT 'bank_transfer',
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  instructions TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_accounts_type_check CHECK (account_type IN ('bank_transfer', 'qris', 'ewallet', 'cash', 'other')),
  CONSTRAINT payment_accounts_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT payment_accounts_unique_account UNIQUE (property_id, account_type, account_number)
);

CREATE INDEX IF NOT EXISTS idx_payment_accounts_property_status
  ON payment_accounts(property_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_accounts_one_primary_active
  ON payment_accounts(property_id)
  WHERE is_primary = true AND status = 'active';

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  occupancy_id UUID NOT NULL REFERENCES occupancies(id) ON DELETE RESTRICT,
  billing_period_id UUID NOT NULL REFERENCES billing_periods(id) ON DELETE RESTRICT,
  invoice_code TEXT NOT NULL,
  invoice_status TEXT NOT NULL DEFAULT 'draft',
  subtotal_amount BIGINT NOT NULL DEFAULT 0,
  late_fee_amount BIGINT NOT NULL DEFAULT 0,
  total_amount BIGINT NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  issued_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  snapshot_period_key TEXT NOT NULL,
  snapshot_period_start_date DATE NOT NULL,
  snapshot_period_end_date DATE NOT NULL,
  snapshot_room_number TEXT NOT NULL,
  snapshot_resident_name TEXT NOT NULL,
  snapshot_monthly_price BIGINT NOT NULL,
  snapshot_proration_policy TEXT NOT NULL DEFAULT 'full_month',
  snapshot_grace_period_days INTEGER NOT NULL DEFAULT 0,
  snapshot_late_fee_rate_percent_per_day NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  snapshot_late_fee_cap_percent NUMERIC(5,2) NOT NULL DEFAULT 30.00,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  voided_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invoices_status_check CHECK (
    invoice_status IN ('draft', 'issued', 'unpaid', 'partially_paid', 'paid', 'overdue', 'void')
  ),
  CONSTRAINT invoices_amount_check CHECK (
    subtotal_amount >= 0 AND late_fee_amount >= 0 AND total_amount >= 0
  ),
  CONSTRAINT invoices_snapshot_amount_check CHECK (snapshot_monthly_price >= 0),
  CONSTRAINT invoices_proration_policy_check CHECK (snapshot_proration_policy IN ('full_month')),
  CONSTRAINT invoices_late_fee_policy_check CHECK (
    snapshot_grace_period_days = 0 AND
    snapshot_late_fee_rate_percent_per_day >= 0 AND
    snapshot_late_fee_cap_percent >= 0
  ),
  CONSTRAINT invoices_unique_code UNIQUE (property_id, invoice_code),
  CONSTRAINT invoices_unique_occupancy_period UNIQUE (billing_period_id, occupancy_id)
);

CREATE INDEX IF NOT EXISTS idx_invoices_property_status_due
  ON invoices(property_id, invoice_status, due_date);

CREATE INDEX IF NOT EXISTS idx_invoices_resident_issued
  ON invoices(resident_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_overdue_queue
  ON invoices(property_id, due_date)
  WHERE invoice_status IN ('issued', 'unpaid', 'partially_paid', 'overdue');

CREATE INDEX IF NOT EXISTS idx_invoices_occupancy_period
  ON invoices(occupancy_id, billing_period_id);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_type TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_amount BIGINT NOT NULL,
  total_amount BIGINT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invoice_line_items_type_check CHECK (
    line_type IN ('rent', 'electricity', 'water', 'wifi', 'late_fee', 'adjustment', 'other')
  ),
  CONSTRAINT invoice_line_items_amount_check CHECK (
    quantity > 0 AND unit_amount >= 0 AND total_amount >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_order
  ON invoice_line_items(invoice_id, sort_order);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  resident_id UUID REFERENCES residents(id) ON DELETE SET NULL,
  payment_code TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  amount BIGINT NOT NULL,
  paid_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  received_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  voided_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payments_method_check CHECK (payment_method IN ('cash', 'bank_transfer', 'qris', 'ewallet', 'other')),
  CONSTRAINT payments_status_check CHECK (payment_status IN ('pending', 'verified', 'void')),
  CONSTRAINT payments_amount_check CHECK (amount > 0),
  CONSTRAINT payments_unique_code UNIQUE (property_id, payment_code)
);

CREATE INDEX IF NOT EXISTS idx_payments_property_status_paid
  ON payments(property_id, payment_status, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_resident_paid
  ON payments(resident_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL DEFAULT 'invoice',
  target_id UUID NOT NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  allocated_amount BIGINT NOT NULL,
  allocation_status TEXT NOT NULL DEFAULT 'active',
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_allocations_target_check CHECK (target_type IN ('invoice', 'deposit', 'other')),
  CONSTRAINT payment_allocations_invoice_target_check CHECK (
    (target_type = 'invoice' AND invoice_id IS NOT NULL AND target_id = invoice_id) OR
    (target_type <> 'invoice')
  ),
  CONSTRAINT payment_allocations_status_check CHECK (allocation_status IN ('active', 'reversed')),
  CONSTRAINT payment_allocations_amount_check CHECK (allocated_amount > 0),
  CONSTRAINT payment_allocations_unique_target UNIQUE (payment_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment
  ON payment_allocations(payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice
  ON payment_allocations(invoice_id);

CREATE TABLE IF NOT EXISTS late_fee_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  assessment_date DATE NOT NULL,
  days_overdue INTEGER NOT NULL,
  rate_percent_per_day NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  cap_percent NUMERIC(5,2) NOT NULL DEFAULT 30.00,
  subtotal_basis_amount BIGINT NOT NULL,
  assessed_amount BIGINT NOT NULL,
  applied_amount BIGINT NOT NULL DEFAULT 0,
  assessment_status TEXT NOT NULL DEFAULT 'assessed',
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assessed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  waived_at TIMESTAMPTZ,
  waived_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  waive_reason TEXT,
  CONSTRAINT late_fee_assessments_days_check CHECK (days_overdue >= 0),
  CONSTRAINT late_fee_assessments_policy_check CHECK (rate_percent_per_day >= 0 AND cap_percent >= 0),
  CONSTRAINT late_fee_assessments_amount_check CHECK (
    subtotal_basis_amount >= 0 AND assessed_amount >= 0 AND applied_amount >= 0
  ),
  CONSTRAINT late_fee_assessments_status_check CHECK (
    assessment_status IN ('assessed', 'applied', 'waived', 'reversed')
  ),
  CONSTRAINT late_fee_assessments_unique_invoice_date UNIQUE (invoice_id, assessment_date)
);

CREATE INDEX IF NOT EXISTS idx_late_fee_assessments_invoice
  ON late_fee_assessments(invoice_id);

CREATE INDEX IF NOT EXISTS idx_late_fee_assessments_property_date
  ON late_fee_assessments(property_id, assessment_date DESC);

CREATE TABLE IF NOT EXISTS payment_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  payment_account_id UUID REFERENCES payment_accounts(id) ON DELETE SET NULL,
  proof_status TEXT NOT NULL DEFAULT 'pending_review',
  claimed_amount BIGINT NOT NULL,
  payment_method TEXT NOT NULL,
  notes TEXT,
  uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_proofs_status_check CHECK (
    proof_status IN ('pending_review', 'verified', 'rejected', 'expired')
  ),
  CONSTRAINT payment_proofs_method_check CHECK (payment_method IN ('bank_transfer', 'qris', 'ewallet', 'cash', 'other')),
  CONSTRAINT payment_proofs_amount_check CHECK (claimed_amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_review_queue
  ON payment_proofs(property_id, proof_status, uploaded_at ASC);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_resident_uploaded
  ON payment_proofs(resident_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_invoice
  ON payment_proofs(invoice_id);

CREATE TABLE IF NOT EXISTS payment_proof_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_proof_id UUID NOT NULL REFERENCES payment_proofs(id) ON DELETE CASCADE,
  file_id UUID NOT NULL,
  uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_proof_files_unique_file UNIQUE (payment_proof_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_proof_files_proof
  ON payment_proof_files(payment_proof_id);
