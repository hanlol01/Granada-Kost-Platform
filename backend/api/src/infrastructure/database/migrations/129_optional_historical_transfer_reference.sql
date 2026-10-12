-- Historical Owner realization imports may lack a transfer reference.
-- New operational transfers keep their required reference validation in the DTO
-- and service; this migration only relaxes the shared storage boundary for the
-- explicitly historical input path.
ALTER TABLE property_owner_realization_transfers
  ALTER COLUMN transfer_reference DROP NOT NULL;

ALTER TABLE property_owner_realization_transfers
  DROP CONSTRAINT IF EXISTS property_owner_realization_transfers_reference_check;

ALTER TABLE property_owner_realization_transfers
  ADD CONSTRAINT property_owner_realization_transfers_reference_check CHECK (
    transfer_reference IS NULL OR
    char_length(trim(transfer_reference)) BETWEEN 3 AND 150
  );

COMMENT ON COLUMN property_owner_realization_transfers.transfer_reference IS
  'Operational transfers require a reference; historical imports may leave it NULL when the source record has none.';
