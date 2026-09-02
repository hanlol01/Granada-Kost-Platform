-- Formal, property-scoped document numbering for every billing and lease-exit
-- issuance authority. Existing issued documents keep their immutable legacy
-- codes; only documents issued after this migration receive the formal format.
BEGIN;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS document_code TEXT;

UPDATE properties
SET document_code = CASE
  WHEN id = '20000000-0000-4000-8000-000000000001'::uuid THEN 'GSH1'
  ELSE 'P' || upper(substr(replace(id::text, '-', ''), 1, 15))
END
WHERE document_code IS NULL OR btrim(document_code) = '';

CREATE OR REPLACE FUNCTION normalize_property_document_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.document_code := upper(regexp_replace(COALESCE(btrim(NEW.document_code), ''), '[^A-Za-z0-9]', '', 'g'));
  IF NEW.document_code = '' THEN
    NEW.document_code := CASE
      WHEN NEW.id = '20000000-0000-4000-8000-000000000001'::uuid THEN 'GSH1'
      ELSE 'P' || upper(substr(replace(NEW.id::text, '-', ''), 1, 15))
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_properties_document_code ON properties;
CREATE TRIGGER trg_properties_document_code
  BEFORE INSERT OR UPDATE OF document_code ON properties
  FOR EACH ROW EXECUTE FUNCTION normalize_property_document_code();

ALTER TABLE properties
  ALTER COLUMN document_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'properties_document_code_check'
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_document_code_check
      CHECK (document_code ~ '^[A-Z0-9]{2,16}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_properties_document_code
  ON properties(document_code);

CREATE TABLE IF NOT EXISTS billing_document_sequences (
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  document_kind TEXT NOT NULL,
  sequence_year SMALLINT NOT NULL,
  last_value BIGINT NOT NULL CHECK (last_value > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, document_kind, sequence_year),
  CONSTRAINT billing_document_sequences_kind_check CHECK (
    document_kind IN (
      'invoice_rent',
      'invoice_other_charge',
      'receipt_booking_fee',
      'receipt_down_payment',
      'receipt_full_settlement',
      'receipt_rent',
      'receipt_final_settlement',
      'receipt_security_deposit',
      'receipt_other_charge',
      'receipt_reversal',
      'receipt_booking_refund',
      'checkout_handover',
      'final_settlement',
      'checkout_refund'
    )
  )
);

CREATE OR REPLACE FUNCTION next_billing_document_number(
  p_property_id UUID,
  p_document_kind TEXT,
  p_issued_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TEXT LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_property_code TEXT;
  v_local_issued_at TIMESTAMP;
  v_year SMALLINT;
  v_month TEXT;
  v_sequence BIGINT;
  v_sequence_kind TEXT;
  v_segment TEXT;
BEGIN
  SELECT document_code
    INTO v_property_code
    FROM properties
   WHERE id = p_property_id;

  IF v_property_code IS NULL THEN
    RAISE EXCEPTION 'BILLING_DOCUMENT_PROPERTY_NOT_FOUND'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_segment := CASE p_document_kind
    WHEN 'invoice_rent' THEN 'SEWA-KOST'
    WHEN 'invoice_other_charge' THEN 'TAGIHAN-LAIN'
    WHEN 'receipt_booking_fee' THEN 'BIAYA-BOOKING'
    WHEN 'receipt_down_payment' THEN 'DP-KOST'
    WHEN 'receipt_full_settlement' THEN 'PELUNASAN-SEWA'
    WHEN 'receipt_rent' THEN 'SEWA-KOST'
    WHEN 'receipt_final_settlement' THEN 'PELUNASAN-SEWA'
    WHEN 'receipt_security_deposit' THEN 'DEPOSIT-JAMINAN'
    WHEN 'receipt_other_charge' THEN 'TAGIHAN-LAIN'
    WHEN 'receipt_reversal' THEN 'PEMBATALAN-REFUND'
    WHEN 'receipt_booking_refund' THEN 'REFUND-MINAT-BOOKING'
    WHEN 'checkout_handover' THEN 'BAST-KELUAR'
    WHEN 'final_settlement' THEN 'RINCIAN-AKHIR'
    WHEN 'checkout_refund' THEN 'REFUND-KELUAR'
    ELSE NULL
  END;

  IF v_segment IS NULL THEN
    RAISE EXCEPTION 'BILLING_DOCUMENT_KIND_INVALID: %', p_document_kind
      USING ERRCODE = 'check_violation';
  END IF;

  -- Both booking-stage and active-lease final settlements share one visible
  -- document family. They must therefore consume the same sequence to keep
  -- every formal number globally unambiguous inside a property.
  v_sequence_kind := CASE
    WHEN p_document_kind = 'receipt_final_settlement' THEN 'receipt_full_settlement'
    ELSE p_document_kind
  END;

  v_local_issued_at := COALESCE(p_issued_at, now()) AT TIME ZONE 'Asia/Jakarta';
  v_year := extract(year FROM v_local_issued_at)::smallint;
  v_month := to_char(v_local_issued_at, 'MM');

  INSERT INTO billing_document_sequences(
    property_id, document_kind, sequence_year, last_value
  ) VALUES (
    p_property_id, v_sequence_kind, v_year, 1
  )
  ON CONFLICT(property_id, document_kind, sequence_year)
  DO UPDATE SET
    last_value = billing_document_sequences.last_value + 1,
    updated_at = now()
  RETURNING last_value INTO v_sequence;

  IF p_document_kind IN ('invoice_rent', 'invoice_other_charge') THEN
    RETURN format(
      'INV-%s-%s/%s/%s/%s',
      lpad(v_sequence::text, 3, '0'),
      v_month,
      v_segment,
      v_property_code,
      v_year
    );
  END IF;

  RETURN format(
    '%s-%s/%s/%s/%s',
    lpad(v_sequence::text, 3, '0'),
    v_month,
    v_segment,
    v_property_code,
    v_year
  );
END;
$$;

-- Booking-stage receipts previously derived their stable number from the UUID.
-- Persist those legacy values before requiring a stored code for new records.
ALTER TABLE booking_lead_payment_commitments
  ADD COLUMN IF NOT EXISTS receipt_code TEXT;

UPDATE booking_lead_payment_commitments
SET receipt_code = 'RCT-BKG-' || upper(substr(replace(id::text, '-', ''), 1, 16))
WHERE receipt_code IS NULL;

ALTER TABLE booking_lead_payment_commitments
  ALTER COLUMN receipt_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_lead_commitment_receipt_code
  ON booking_lead_payment_commitments(property_id, receipt_code);

ALTER TABLE booking_lead_payment_commitment_refunds
  ADD COLUMN IF NOT EXISTS receipt_code TEXT;

UPDATE booking_lead_payment_commitment_refunds
SET receipt_code = 'RCT-CNL-' || upper(substr(replace(id::text, '-', ''), 1, 16))
WHERE receipt_code IS NULL;

ALTER TABLE booking_lead_payment_commitment_refunds
  ALTER COLUMN receipt_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_lead_refund_receipt_code
  ON booking_lead_payment_commitment_refunds(property_id, receipt_code);

-- Draft invoices retain their provisional internal code. The formal number is
-- assigned only when the invoice is first issued, so its month matches issuance.
CREATE OR REPLACE FUNCTION assign_formal_invoice_number()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_should_assign BOOLEAN;
  v_document_kind TEXT;
BEGIN
  v_should_assign := (
    TG_OP = 'INSERT' AND NEW.invoice_status NOT IN ('draft', 'void')
  ) OR (
    TG_OP = 'UPDATE' AND OLD.invoice_status = 'draft'
      AND NEW.invoice_status NOT IN ('draft', 'void')
  );

  IF v_should_assign THEN
    v_document_kind := CASE
      WHEN COALESCE(NEW.invoice_purpose, 'rent') = 'other_charge'
        THEN 'invoice_other_charge'
      ELSE 'invoice_rent'
    END;
    NEW.invoice_code := next_billing_document_number(
      NEW.property_id,
      v_document_kind,
      COALESCE(NEW.issued_at, now())
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_formal_number ON invoices;
CREATE TRIGGER trg_invoices_formal_number
  BEFORE INSERT OR UPDATE OF invoice_status ON invoices
  FOR EACH ROW EXECUTE FUNCTION assign_formal_invoice_number();

COMMIT;
