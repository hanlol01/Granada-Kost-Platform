/** A null/empty owner is intentionally ambiguous, never permission to delete. */
export const ARCHIVE_FILE_OWNERSHIP_SQL = `WITH invoice_owners AS (
  SELECT invoice.id,invoice.property_id,invoice.invoice_code,
    ARRAY(SELECT DISTINCT lease.id FROM leases lease
      WHERE lease.property_id=invoice.property_id AND (lease.id=invoice.lease_id
        OR invoice.lease_id IS NULL AND lease.occupancy_id=invoice.occupancy_id)
      ORDER BY lease.id) AS lease_ids
  FROM invoices invoice
), payment_owners AS (
  SELECT payment.id,payment.property_id,payment.payment_code,
    ARRAY(SELECT DISTINCT lease_id FROM (
      SELECT payment.lease_id AS lease_id
      UNION ALL SELECT allocation.lease_id FROM payment_allocations allocation WHERE allocation.payment_id=payment.id
      UNION ALL SELECT unnest(invoice.lease_ids) FROM payment_allocations allocation
        JOIN invoice_owners invoice ON invoice.id=allocation.invoice_id WHERE allocation.payment_id=payment.id
      UNION ALL SELECT deposit.lease_id FROM lease_deposit_transactions deposit WHERE deposit.payment_id=payment.id
    ) owners WHERE lease_id IS NOT NULL ORDER BY lease_id) AS lease_ids,
    EXISTS(SELECT 1 FROM payment_allocations allocation LEFT JOIN invoice_owners invoice ON invoice.id=allocation.invoice_id
      WHERE allocation.payment_id=payment.id AND allocation.lease_id IS NULL
        AND (invoice.id IS NULL OR cardinality(invoice.lease_ids)=0)) AS ambiguous
  FROM payments payment
), bindings AS (
  SELECT evidence.file_id,evidence.property_id,ARRAY[evidence.lease_id] AS lease_ids,
    'Bukti koreksi penyewaan'::text AS relationship,lease.lease_code AS record_code,
    'lease_revision_file_bindings.file_id'::text AS source, evidence.lease_id::text AS group_id
  FROM lease_revision_file_bindings evidence JOIN leases lease ON lease.id=evidence.lease_id
  UNION ALL SELECT evidence.file_id,evidence.property_id,ARRAY[evidence.lease_id],
    'Riwayat koreksi penyewaan',lease.lease_code||'-KOREKSI-'||correction.sequence_number,
    'lease_data_correction_evidence.file_id',evidence.correction_id::text
  FROM lease_data_correction_evidence evidence JOIN leases lease ON lease.id=evidence.lease_id
    JOIN lease_data_corrections correction ON correction.id=evidence.correction_id
  UNION ALL SELECT evidence.file_id,evidence.property_id,invoice.lease_ids,'Bukti tagihan',invoice.invoice_code,
    'invoice_evidence_files.file_id',evidence.invoice_id::text
  FROM invoice_evidence_files evidence JOIN invoice_owners invoice ON invoice.id=evidence.invoice_id
  UNION ALL SELECT evidence.file_id,evidence.property_id,
    CASE WHEN payment.ambiguous THEN array_append(payment.lease_ids,NULL::uuid) ELSE payment.lease_ids END,
    'Bukti pembayaran',payment.payment_code,'payment_evidence_files.file_id',evidence.payment_id::text
  FROM payment_evidence_files evidence JOIN payment_owners payment ON payment.id=evidence.payment_id
  UNION ALL SELECT evidence.file_id,proof.property_id,
    CASE WHEN cardinality(invoice.lease_ids)=0 OR payment.ambiguous THEN ARRAY[NULL::uuid]
      ELSE invoice.lease_ids||COALESCE(payment.lease_ids,'{}'::uuid[]) END,
    'Bukti konfirmasi pembayaran',COALESCE(payment.payment_code,invoice.invoice_code),
    'payment_proof_files.file_id',proof.id::text
  FROM payment_proof_files evidence JOIN payment_proofs proof ON proof.id=evidence.payment_proof_id
    JOIN invoice_owners invoice ON invoice.id=proof.invoice_id LEFT JOIN payment_owners payment ON payment.id=proof.payment_id
  UNION ALL SELECT evidence.file_id,evidence.property_id,ARRAY[command.lease_id],
    'Bukti check-out',lease.lease_code,'lease_checkout_evidence.file_id',command.id::text
  FROM lease_checkout_evidence evidence JOIN lease_checkout_commands command ON command.id=evidence.checkout_command_id
    JOIN leases lease ON lease.id=command.lease_id
  UNION ALL SELECT deposit.evidence_file_id,deposit.property_id,ARRAY[deposit.lease_id],
    'Bukti deposit',lease.lease_code,'lease_deposit_transactions.evidence_file_id',deposit.id::text
  FROM lease_deposit_transactions deposit JOIN leases lease ON lease.id=deposit.lease_id WHERE deposit.evidence_file_id IS NOT NULL
  UNION ALL SELECT settlement.refund_adjustment_evidence_file_id,settlement.property_id,ARRAY[settlement.lease_id],
    'Bukti penyesuaian pengembalian',lease.lease_code,'lease_exit_final_settlements.refund_adjustment_evidence_file_id',settlement.id::text
  FROM lease_exit_final_settlements settlement JOIN leases lease ON lease.id=settlement.lease_id
    WHERE settlement.refund_adjustment_evidence_file_id IS NOT NULL
  UNION ALL SELECT refund.evidence_file_id,refund.property_id,ARRAY[refund.lease_id],
    'Bukti pengembalian dana',lease.lease_code,'lease_exit_refunds.evidence_file_id',refund.id::text
  FROM lease_exit_refunds refund JOIN leases lease ON lease.id=refund.lease_id WHERE refund.evidence_file_id IS NOT NULL
  UNION ALL SELECT termination.damage_evidence_file_id,termination.property_id,ARRAY[termination.lease_id],
    'Bukti kerusakan',lease.lease_code,'lease_termination_cases.damage_evidence_file_id',termination.id::text
  FROM lease_termination_cases termination JOIN leases lease ON lease.id=termination.lease_id WHERE termination.damage_evidence_file_id IS NOT NULL
  UNION ALL SELECT termination.refund_evidence_file_id,termination.property_id,ARRAY[termination.lease_id],
    'Bukti pengembalian saat check-out',lease.lease_code,'lease_termination_cases.refund_evidence_file_id',termination.id::text
  FROM lease_termination_cases termination JOIN leases lease ON lease.id=termination.lease_id WHERE termination.refund_evidence_file_id IS NOT NULL
  UNION ALL SELECT evidence.file_id,termination.property_id,ARRAY[termination.lease_id],
    'Bukti kerusakan',lease.lease_code,'lease_termination_cases.damage_evidence_file_ids',termination.id::text
  FROM lease_termination_cases termination JOIN leases lease ON lease.id=termination.lease_id
    CROSS JOIN LATERAL unnest(termination.damage_evidence_file_ids) evidence(file_id)
  UNION ALL SELECT evidence.file_id,termination.property_id,ARRAY[termination.lease_id],
    'Bukti pengembalian saat check-out',lease.lease_code,'lease_termination_cases.refund_evidence_file_ids',termination.id::text
  FROM lease_termination_cases termination JOIN leases lease ON lease.id=termination.lease_id
    CROSS JOIN LATERAL unnest(termination.refund_evidence_file_ids) evidence(file_id)
  UNION ALL SELECT evidence.file_id,commitment.property_id,
    CASE WHEN onboarding.lease_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[onboarding.lease_id] END,
    'Bukti minat booking',commitment.transaction_code,'booking_lead_payment_commitments.payment_evidence_file_ids',commitment.id::text
  FROM booking_lead_payment_commitments commitment LEFT JOIN onboarding_commitments onboarding
    ON onboarding.id=commitment.materialized_onboarding_commitment_id
    CROSS JOIN LATERAL unnest(commitment.payment_evidence_file_ids) evidence(file_id)
  UNION ALL SELECT evidence.file_id,refund.property_id,
    CASE WHEN onboarding.lease_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[onboarding.lease_id] END,
    'Bukti pengembalian minat booking',refund.transaction_code,
    'booking_lead_payment_commitment_refunds.refund_evidence_file_ids',refund.id::text
  FROM booking_lead_payment_commitment_refunds refund JOIN booking_lead_payment_commitments commitment ON commitment.id=refund.commitment_id
    LEFT JOIN onboarding_commitments onboarding ON onboarding.id=commitment.materialized_onboarding_commitment_id
    CROSS JOIN LATERAL unnest(refund.refund_evidence_file_ids) evidence(file_id)
) SELECT binding.*,
  (SELECT count(DISTINCT peer.file_id)::int FROM bindings peer JOIN files file ON file.id=peer.file_id
    WHERE peer.source=binding.source AND peer.group_id=binding.group_id AND NOT file.is_deleted) AS available_evidence_count
FROM bindings binding JOIN files file ON file.id=binding.file_id WHERE file.property_id=$1
ORDER BY binding.file_id,binding.source,binding.group_id,binding.record_code`;

export const LEASE_FILE_OWNING_COLUMNS = new Set([
  'lease_revision_file_bindings.file_id', 'lease_data_correction_evidence.file_id',
  'invoice_evidence_files.file_id', 'payment_evidence_files.file_id', 'payment_proof_files.file_id',
  'lease_checkout_evidence.file_id', 'lease_deposit_transactions.evidence_file_id',
  'lease_exit_final_settlements.refund_adjustment_evidence_file_id', 'lease_exit_refunds.evidence_file_id',
  'lease_termination_cases.damage_evidence_file_id', 'lease_termination_cases.refund_evidence_file_id',
  'lease_termination_cases.damage_evidence_file_ids', 'lease_termination_cases.refund_evidence_file_ids',
  'booking_lead_payment_commitments.payment_evidence_file_ids',
  'booking_lead_payment_commitment_refunds.refund_evidence_file_ids',
]);

// Pure descriptive/audit snapshots are retained text, not live attachment authority.
// An unknown JSON consumer is protected conservatively, even if that is a false positive.
export const DESCRIPTIVE_FILE_JSON_TABLES = new Set([
  'audit_logs', 'auth_audit_logs', 'business_events', 'idempotency_keys',
  'lease_history', 'occupancy_history', 'lease_data_corrections',
  'lease_archive_commands', 'lease_archive_restore_commands', 'lease_archive_successor_commands',
  'lease_file_purge_commands', 'lease_file_purge_attempts', 'lease_file_purge_items',
  'lease_checkout_commands', 'lease_transfer_commands', 'lease_renewal_commands',
  'owner_sponsored_policy_revisions', 'lease_commercial_mode_revisions',
]);
