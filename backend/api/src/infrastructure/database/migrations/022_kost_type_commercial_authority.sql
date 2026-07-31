-- KMO-W02B category commercial authority.
-- Forward-only, additive, and safe for the ledger-aware migration runner.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM properties property
    WHERE property.status = 'active'
      AND (
        (
          SELECT COUNT(*)
          FROM kost_types kost_type
          WHERE kost_type.property_id = property.id
            AND kost_type.status = 'active'
            AND kost_type.deleted_at IS NULL
        ) <> 2
        OR EXISTS (
          SELECT 1
          FROM kost_types kost_type
          WHERE kost_type.property_id = property.id
            AND kost_type.status = 'active'
            AND kost_type.deleted_at IS NULL
            AND kost_type.category NOT IN ('rukost', 'apartkost')
        )
      )
  ) THEN
    RAISE EXCEPTION 'W02B_CATEGORY_AUTHORITY_NOT_EXACTLY_TWO'
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS kost_type_commercial_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kost_type_id UUID NOT NULL REFERENCES kost_types(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  monthly_price BIGINT NOT NULL,
  annual_contract_value BIGINT NOT NULL,
  minimum_dp_percent SMALLINT NOT NULL DEFAULT 25,
  security_deposit_months SMALLINT NOT NULL DEFAULT 1,
  payment_schedules TEXT[] NOT NULL DEFAULT ARRAY['annual', 'two_month_installments']::text[],
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kost_type_commercial_versions_price_check CHECK (
    monthly_price > 0 AND annual_contract_value > 0
  ),
  CONSTRAINT kost_type_commercial_versions_dp_check CHECK (
    minimum_dp_percent = 25
  ),
  CONSTRAINT kost_type_commercial_versions_deposit_check CHECK (
    security_deposit_months BETWEEN 1 AND 2
  ),
  CONSTRAINT kost_type_commercial_versions_schedule_check CHECK (
    cardinality(payment_schedules) > 0
    AND payment_schedules <@ ARRAY['annual', 'two_month_installments']::text[]
  ),
  CONSTRAINT kost_type_commercial_versions_unique_effective
    UNIQUE (kost_type_id, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_kost_type_commercial_versions_effective
  ON kost_type_commercial_versions(kost_type_id, effective_date DESC);

INSERT INTO kost_type_commercial_versions (
  kost_type_id,
  effective_date,
  monthly_price,
  annual_contract_value,
  minimum_dp_percent,
  security_deposit_months,
  payment_schedules,
  created_by_user_id,
  updated_by_user_id
)
SELECT
  kost_type.id,
  CURRENT_DATE,
  1800000,
  21600000,
  25,
  1,
  ARRAY['annual', 'two_month_installments']::text[],
  kost_type.created_by_user_id,
  kost_type.updated_by_user_id
FROM kost_types kost_type
WHERE kost_type.status = 'active'
  AND kost_type.deleted_at IS NULL
ON CONFLICT (kost_type_id, effective_date) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM kost_types kost_type
    LEFT JOIN kost_type_commercial_versions version
      ON version.kost_type_id = kost_type.id
    WHERE kost_type.status = 'active'
      AND kost_type.deleted_at IS NULL
    GROUP BY kost_type.id
    HAVING COUNT(version.id) <> 1
  ) THEN
    RAISE EXCEPTION 'W02B_INITIAL_COMMERCIAL_VERSION_MISSING'
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

COMMIT;
