ALTER TABLE lease_termination_cases
  ADD COLUMN IF NOT EXISTS damage_evidence_file_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS refund_evidence_file_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

UPDATE lease_termination_cases
SET damage_evidence_file_ids = ARRAY[damage_evidence_file_id]::uuid[]
WHERE damage_evidence_file_id IS NOT NULL
  AND cardinality(damage_evidence_file_ids) = 0;

UPDATE lease_termination_cases
SET refund_evidence_file_ids = ARRAY[refund_evidence_file_id]::uuid[]
WHERE refund_evidence_file_id IS NOT NULL
  AND cardinality(refund_evidence_file_ids) = 0;

ALTER TABLE lease_termination_cases
  DROP CONSTRAINT IF EXISTS lease_termination_damage_evidence_limit,
  DROP CONSTRAINT IF EXISTS lease_termination_refund_evidence_limit;

ALTER TABLE lease_termination_cases
  ADD CONSTRAINT lease_termination_damage_evidence_limit
    CHECK (cardinality(damage_evidence_file_ids) <= 5),
  ADD CONSTRAINT lease_termination_refund_evidence_limit
    CHECK (cardinality(refund_evidence_file_ids) <= 5);

ALTER TABLE booking_lead_payment_commitment_refunds
  DROP CONSTRAINT IF EXISTS booking_lead_payment_commitment_refunds_evidence_limit_check,
  ADD CONSTRAINT booking_lead_payment_commitment_refunds_evidence_limit_check
    CHECK (cardinality(refund_evidence_file_ids) <= 5);
