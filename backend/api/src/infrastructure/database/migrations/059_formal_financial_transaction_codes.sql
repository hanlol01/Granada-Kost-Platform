CREATE TABLE IF NOT EXISTS financial_transaction_sequences (
  code_family TEXT NOT NULL,
  sequence_date DATE NOT NULL,
  last_value BIGINT NOT NULL CHECK (last_value > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (code_family, sequence_date),
  CONSTRAINT financial_transaction_sequences_family_check
    CHECK (code_family IN ('TRX', 'REF', 'BTL'))
);

CREATE OR REPLACE FUNCTION next_financial_transaction_code(
  p_code_family TEXT,
  p_transaction_purpose TEXT,
  p_occurred_at TIMESTAMPTZ DEFAULT now()
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_family TEXT := upper(btrim(p_code_family));
  normalized_purpose TEXT := upper(btrim(p_transaction_purpose));
  local_date DATE := (COALESCE(p_occurred_at, now()) AT TIME ZONE 'Asia/Jakarta')::date;
  next_value BIGINT;
BEGIN
  IF normalized_family IS NULL OR normalized_family NOT IN ('TRX', 'REF', 'BTL') THEN
    RAISE EXCEPTION 'Unsupported financial transaction family: %', p_code_family;
  END IF;

  IF normalized_purpose IS NULL OR normalized_purpose NOT IN (
    'BOOKING',
    'DP',
    'PELUNASAN-AWAL',
    'SEWA',
    'LUNAS',
    'DEPOSIT',
    'TAMBAH-DEPOSIT',
    'TAGIHAN-LAIN',
    'CHECKOUT',
    'KELEBIHAN-BAYAR',
    'CANCEL'
  ) THEN
    RAISE EXCEPTION 'Unsupported financial transaction purpose: %', p_transaction_purpose;
  END IF;

  INSERT INTO financial_transaction_sequences(code_family, sequence_date, last_value)
  VALUES(normalized_family, local_date, 1)
  ON CONFLICT(code_family, sequence_date)
  DO UPDATE SET last_value = financial_transaction_sequences.last_value + 1,
                updated_at = now()
  RETURNING last_value INTO next_value;

  IF next_value > 999999 THEN
    RAISE EXCEPTION 'Daily financial transaction sequence exhausted for % on %', normalized_family, local_date;
  END IF;

  RETURN format(
    '%s-%s-%s-%s',
    normalized_family,
    to_char(local_date, 'YYYYMMDD'),
    lpad(next_value::text, 6, '0'),
    normalized_purpose
  );
END;
$$;

ALTER TABLE booking_lead_payment_commitments
  ADD COLUMN IF NOT EXISTS transaction_code TEXT;

ALTER TABLE booking_lead_payment_commitment_refunds
  ADD COLUMN IF NOT EXISTS transaction_code TEXT;

ALTER TABLE payment_reversals
  ADD COLUMN IF NOT EXISTS transaction_code TEXT;

ALTER TABLE lease_exit_refunds
  ADD COLUMN IF NOT EXISTS transaction_code TEXT;

ALTER TABLE lease_refund_settlements
  ADD COLUMN IF NOT EXISTS transaction_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_lead_payment_commitments_transaction_code
  ON booking_lead_payment_commitments(transaction_code)
  WHERE transaction_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_lead_payment_commitment_refunds_transaction_code
  ON booking_lead_payment_commitment_refunds(transaction_code)
  WHERE transaction_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_reversals_transaction_code
  ON payment_reversals(transaction_code)
  WHERE transaction_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_exit_refunds_transaction_code
  ON lease_exit_refunds(transaction_code)
  WHERE transaction_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_refund_settlements_transaction_code
  ON lease_refund_settlements(transaction_code)
  WHERE transaction_code IS NOT NULL;
