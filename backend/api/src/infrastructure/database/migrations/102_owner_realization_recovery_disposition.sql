-- A post-transfer correction is never a hidden edit to the original Owner
-- realization. Capture the documented finance path for each recovery so the
-- immutable transfer receipt remains intelligible during later audit.
BEGIN;

ALTER TABLE property_owner_realization_corrections
  ADD COLUMN IF NOT EXISTS recovery_disposition TEXT,
  ADD COLUMN IF NOT EXISTS recovery_status TEXT,
  ADD COLUMN IF NOT EXISTS recovery_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recovery_reference TEXT;

-- Preserve any early implementation record while making its finance path
-- explicit rather than rejecting an already-audited historical correction.
UPDATE property_owner_realization_corrections
   SET recovery_disposition = COALESCE(recovery_disposition, 'outside_system_finance'),
       recovery_status = COALESCE(recovery_status, 'open'),
       recovery_reference = COALESCE(
         NULLIF(trim(source_reference), ''),
         NULLIF(trim(evidence_reference), ''),
         recovery_reference,
         'Legacy transfer recovery'
       )
 WHERE correction_kind = 'transfer_recovery'
   AND recovery_disposition IS NULL;

ALTER TABLE property_owner_realization_corrections
  DROP CONSTRAINT IF EXISTS property_owner_realization_corrections_recovery_check;
ALTER TABLE property_owner_realization_corrections
  ADD CONSTRAINT property_owner_realization_corrections_recovery_check CHECK (
    (
      correction_kind <> 'transfer_recovery'
      AND recovery_disposition IS NULL
      AND recovery_status IS NULL
      AND recovery_resolved_at IS NULL
      AND recovery_reference IS NULL
    )
    OR (
      correction_kind = 'transfer_recovery'
      AND amount < 0
      AND recovery_disposition IN (
        'recover_from_owner',
        'net_against_future_realization',
        'outside_system_finance'
      )
      AND recovery_status IN ('open', 'resolved')
      AND (
        (recovery_status = 'open' AND recovery_resolved_at IS NULL)
        OR (recovery_status = 'resolved' AND recovery_resolved_at IS NOT NULL)
      )
      AND char_length(trim(COALESCE(recovery_reference, ''))) BETWEEN 3 AND 300
    )
  );

CREATE INDEX IF NOT EXISTS idx_owner_realization_corrections_open_recovery
  ON property_owner_realization_corrections(property_id, recovery_status, created_at DESC)
  WHERE correction_kind = 'transfer_recovery' AND recovery_status = 'open';

COMMIT;
