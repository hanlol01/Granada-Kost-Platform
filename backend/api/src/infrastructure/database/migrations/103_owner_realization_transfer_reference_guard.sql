-- A bank/finance transfer reference must describe one successful Owner
-- realization transfer only. The service performs a friendly preflight; this
-- unique index remains the race-safe source of truth.
CREATE UNIQUE INDEX IF NOT EXISTS uq_owner_realization_transfer_reference
  ON property_owner_realization_transfers(property_id, transfer_reference)
  WHERE transfer_status = 'succeeded';
