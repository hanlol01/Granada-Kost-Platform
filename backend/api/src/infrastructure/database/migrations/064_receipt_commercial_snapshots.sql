BEGIN;

ALTER TABLE booking_lead_payment_commitments
  ADD COLUMN IF NOT EXISTS contract_rent_amount BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'booking_lead_payment_commitments_contract_rent_check'
      AND conrelid = 'public.booking_lead_payment_commitments'::regclass
  ) THEN
    ALTER TABLE booking_lead_payment_commitments
      ADD CONSTRAINT booking_lead_payment_commitments_contract_rent_check
      CHECK (contract_rent_amount IS NULL OR contract_rent_amount >= rent_credit_amount)
      NOT VALID;
  END IF;
END $$;

UPDATE properties
SET address = 'Jl. Kiara Beres, Desa Cipacing, Kec. Jatinangor, Kab. Sumedang 45363',
    updated_at = now()
WHERE address = 'Jl. Kiara Beres, Desa Cipacing, Kec. Jatinangor, Kab. Sumedang';

COMMIT;
