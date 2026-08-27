-- Allow an awaiting-activation contract settlement to be cancelled before the lease starts.
BEGIN;

ALTER TABLE lease_contract_settlements
  DROP CONSTRAINT IF EXISTS lease_contract_settlements_state_check;

ALTER TABLE lease_contract_settlements
  ADD CONSTRAINT lease_contract_settlements_state_check CHECK (
    state IN ('awaiting_activation', 'open', 'termination_pending', 'terminated', 'paid', 'cancelled')
  );

ALTER TABLE lease_contract_settlements
  DROP CONSTRAINT IF EXISTS lease_contract_settlements_activation_check;

ALTER TABLE lease_contract_settlements
  ADD CONSTRAINT lease_contract_settlements_activation_check CHECK (
    (state IN ('awaiting_activation', 'cancelled') AND activated_at IS NULL AND original_due_at IS NULL)
    OR (state NOT IN ('awaiting_activation', 'cancelled') AND activated_at IS NOT NULL AND original_due_at IS NOT NULL)
  );

COMMIT;
