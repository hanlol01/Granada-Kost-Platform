BEGIN;

ALTER TABLE kost_type_commercial_versions
  ADD COLUMN IF NOT EXISTS short_stay_monthly_price BIGINT,
  ADD COLUMN IF NOT EXISTS medium_stay_monthly_price BIGINT,
  ADD COLUMN IF NOT EXISTS long_stay_monthly_price BIGINT;

UPDATE kost_type_commercial_versions
SET short_stay_monthly_price = COALESCE(short_stay_monthly_price, monthly_price),
    medium_stay_monthly_price = COALESCE(medium_stay_monthly_price, monthly_price),
    long_stay_monthly_price = COALESCE(
      long_stay_monthly_price,
      LEAST(monthly_price, GREATEST(1, annual_contract_value / 12))
    );

INSERT INTO kost_type_commercial_versions (
  kost_type_id, effective_date, monthly_price, annual_contract_value,
  short_stay_monthly_price, medium_stay_monthly_price, long_stay_monthly_price,
  minimum_dp_percent, security_deposit_months, payment_schedules,
  created_by_user_id, updated_by_user_id
)
SELECT
  kost_type.id, DATE '2026-06-01', 1900000, 21600000,
  1900000, 1850000, 1800000,
  COALESCE(source.minimum_dp_percent, 25),
  COALESCE(source.security_deposit_months, 1),
  COALESCE(source.payment_schedules, ARRAY['annual','two_month_installments']::text[]),
  kost_type.created_by_user_id, kost_type.updated_by_user_id
FROM kost_types kost_type
LEFT JOIN LATERAL (
  SELECT minimum_dp_percent, security_deposit_months, payment_schedules
  FROM kost_type_commercial_versions version
  WHERE version.kost_type_id = kost_type.id
  ORDER BY CASE WHEN version.effective_date <= DATE '2026-06-01' THEN 0 ELSE 1 END,
           CASE WHEN version.effective_date <= DATE '2026-06-01' THEN version.effective_date END DESC,
           version.effective_date ASC, version.id
  LIMIT 1
) source ON true
WHERE kost_type.status = 'active' AND kost_type.deleted_at IS NULL
ON CONFLICT (kost_type_id, effective_date) DO UPDATE
SET monthly_price = EXCLUDED.monthly_price,
    annual_contract_value = EXCLUDED.annual_contract_value,
    short_stay_monthly_price = EXCLUDED.short_stay_monthly_price,
    medium_stay_monthly_price = EXCLUDED.medium_stay_monthly_price,
    long_stay_monthly_price = EXCLUDED.long_stay_monthly_price,
    updated_at = now();

-- The June policy is the historical authority. Later scheduled versions must not
-- accidentally reintroduce the former single-rate model.
UPDATE kost_type_commercial_versions
SET monthly_price = 1900000,
    annual_contract_value = 21600000,
    short_stay_monthly_price = 1900000,
    medium_stay_monthly_price = 1850000,
    long_stay_monthly_price = 1800000,
    updated_at = now()
WHERE effective_date >= DATE '2026-06-01';

ALTER TABLE kost_type_commercial_versions
  ALTER COLUMN short_stay_monthly_price SET NOT NULL,
  ALTER COLUMN medium_stay_monthly_price SET NOT NULL,
  ALTER COLUMN long_stay_monthly_price SET NOT NULL;

ALTER TABLE kost_type_commercial_versions
  ADD CONSTRAINT kost_type_commercial_versions_duration_rates_check CHECK (
    short_stay_monthly_price > 0
    AND medium_stay_monthly_price > 0
    AND long_stay_monthly_price > 0
    AND short_stay_monthly_price >= medium_stay_monthly_price
    AND medium_stay_monthly_price >= long_stay_monthly_price
  );

CREATE TABLE IF NOT EXISTS property_management_fee_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  effective_date DATE NOT NULL,
  monthly_fee_amount BIGINT NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_management_fee_versions_amount_check CHECK (monthly_fee_amount >= 0),
  CONSTRAINT property_management_fee_versions_unique_effective UNIQUE(property_id, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_property_management_fee_versions_effective
  ON property_management_fee_versions(property_id, effective_date DESC);

INSERT INTO property_management_fee_versions(property_id, effective_date, monthly_fee_amount)
SELECT property.id, DATE '2026-06-01', 300000
FROM properties property
WHERE property.status = 'active'
ON CONFLICT(property_id, effective_date) DO UPDATE
SET monthly_fee_amount = EXCLUDED.monthly_fee_amount, updated_at = now();

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS snapshot_pricing_tier TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_commercial_effective_date DATE;

ALTER TABLE leases
  ADD CONSTRAINT leases_snapshot_pricing_tier_check CHECK (
    snapshot_pricing_tier IS NULL OR snapshot_pricing_tier IN ('short_stay','medium_stay','long_stay')
  );

COMMIT;
