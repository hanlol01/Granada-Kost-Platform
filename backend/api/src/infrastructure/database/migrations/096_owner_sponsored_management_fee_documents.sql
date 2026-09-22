-- Give owner-sponsored management-fee receipts their own official family.
-- Historical TAGIHAN-LAIN documents remain immutable; only future issuance uses
-- the dedicated BIAYA-PENGELOLAAN sequence.
BEGIN;

ALTER TABLE billing_document_sequences
  DROP CONSTRAINT IF EXISTS billing_document_sequences_kind_check;

ALTER TABLE billing_document_sequences
  ADD CONSTRAINT billing_document_sequences_kind_check CHECK (
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
      'receipt_management_fee',
      'receipt_reversal',
      'receipt_booking_refund',
      'checkout_handover',
      'final_settlement',
      'checkout_refund',
      'contract_paid_confirmation'
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
  SELECT document_code INTO v_property_code FROM properties WHERE id=p_property_id;
  IF v_property_code IS NULL THEN
    RAISE EXCEPTION 'BILLING_DOCUMENT_PROPERTY_NOT_FOUND' USING ERRCODE='foreign_key_violation';
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
    WHEN 'receipt_management_fee' THEN 'BIAYA-PENGELOLAAN'
    WHEN 'receipt_reversal' THEN 'PEMBATALAN-REFUND'
    WHEN 'receipt_booking_refund' THEN 'REFUND-MINAT-BOOKING'
    WHEN 'checkout_handover' THEN 'BAST-KELUAR'
    WHEN 'final_settlement' THEN 'RINCIAN-AKHIR'
    WHEN 'checkout_refund' THEN 'REFUND-KELUAR'
    WHEN 'contract_paid_confirmation' THEN 'KONTRAK-LUNAS'
    ELSE NULL
  END;
  IF v_segment IS NULL THEN
    RAISE EXCEPTION 'BILLING_DOCUMENT_KIND_INVALID: %', p_document_kind USING ERRCODE='check_violation';
  END IF;

  v_sequence_kind := CASE
    WHEN p_document_kind='receipt_final_settlement' THEN 'receipt_full_settlement'
    ELSE p_document_kind
  END;
  v_local_issued_at := COALESCE(p_issued_at,now()) AT TIME ZONE 'Asia/Jakarta';
  v_year := extract(year FROM v_local_issued_at)::smallint;
  v_month := to_char(v_local_issued_at,'MM');
  INSERT INTO billing_document_sequences(property_id,document_kind,sequence_year,last_value)
  VALUES(p_property_id,v_sequence_kind,v_year,1)
  ON CONFLICT(property_id,document_kind,sequence_year)
  DO UPDATE SET last_value=billing_document_sequences.last_value+1,updated_at=now()
  RETURNING last_value INTO v_sequence;

  IF p_document_kind IN ('invoice_rent','invoice_other_charge') THEN
    RETURN format('INV-%s-%s/%s/%s/%s',lpad(v_sequence::text,3,'0'),v_month,v_segment,v_property_code,v_year);
  END IF;
  RETURN format('%s-%s/%s/%s/%s',lpad(v_sequence::text,3,'0'),v_month,v_segment,v_property_code,v_year);
END;
$$;

COMMIT;
