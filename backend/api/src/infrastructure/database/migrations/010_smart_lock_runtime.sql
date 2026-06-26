CREATE TABLE IF NOT EXISTS smart_lock_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  provider_type TEXT NOT NULL,
  gateway_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  gateway_status TEXT NOT NULL DEFAULT 'active',
  priority INTEGER NOT NULL DEFAULT 100,
  weight INTEGER NOT NULL DEFAULT 1,
  capacity_limit INTEGER NOT NULL DEFAULT 0,
  capacity_used INTEGER NOT NULL DEFAULT 0,
  region TEXT,
  credential_ref TEXT NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT smart_lock_gateways_provider_type_check CHECK (provider_type IN ('tuya')),
  CONSTRAINT smart_lock_gateways_status_check CHECK (
    gateway_status IN ('active', 'degraded', 'maintenance', 'draining', 'disabled')
  ),
  CONSTRAINT smart_lock_gateways_code_required_check CHECK (length(trim(gateway_code)) > 0),
  CONSTRAINT smart_lock_gateways_display_name_required_check CHECK (length(trim(display_name)) > 0),
  CONSTRAINT smart_lock_gateways_credential_ref_required_check CHECK (length(trim(credential_ref)) > 0),
  CONSTRAINT smart_lock_gateways_priority_check CHECK (priority >= 0),
  CONSTRAINT smart_lock_gateways_weight_check CHECK (weight > 0),
  CONSTRAINT smart_lock_gateways_capacity_check CHECK (capacity_limit >= 0 AND capacity_used >= 0 AND capacity_used <= capacity_limit),
  CONSTRAINT smart_lock_gateways_disabled_state_check CHECK (
    (gateway_status = 'disabled' AND disabled_at IS NOT NULL)
    OR (gateway_status <> 'disabled')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_slg_property_code_unique
  ON smart_lock_gateways(property_id, gateway_code);

CREATE INDEX IF NOT EXISTS idx_slg_property_status
  ON smart_lock_gateways(property_id, gateway_status);

CREATE INDEX IF NOT EXISTS idx_slg_provider_status
  ON smart_lock_gateways(provider_type, gateway_status);

CREATE TABLE IF NOT EXISTS smart_lock_gateway_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id UUID NOT NULL REFERENCES smart_lock_gateways(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  credential_ref TEXT NOT NULL,
  credential_status TEXT NOT NULL DEFAULT 'active',
  key_id TEXT,
  version TEXT NOT NULL DEFAULT 'v1',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT smart_lock_gateway_credentials_ref_required_check CHECK (length(trim(credential_ref)) > 0),
  CONSTRAINT smart_lock_gateway_credentials_version_required_check CHECK (length(trim(version)) > 0),
  CONSTRAINT smart_lock_gateway_credentials_status_check CHECK (credential_status IN ('active', 'rotating', 'revoked')),
  CONSTRAINT smart_lock_gateway_credentials_rotating_state_check CHECK (
    (credential_status = 'rotating' AND rotated_at IS NOT NULL)
    OR (credential_status <> 'rotating')
  ),
  CONSTRAINT smart_lock_gateway_credentials_revoked_state_check CHECK (
    (credential_status = 'revoked' AND revoked_at IS NOT NULL)
    OR (credential_status <> 'revoked')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_slgc_gateway_ref_version_unique
  ON smart_lock_gateway_credentials(gateway_id, credential_ref, version);

CREATE INDEX IF NOT EXISTS idx_slgc_gateway_status
  ON smart_lock_gateway_credentials(gateway_id, credential_status);

CREATE TABLE IF NOT EXISTS smart_lock_device_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  smart_lock_device_id UUID NOT NULL REFERENCES smart_lock_devices(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  gateway_id UUID NOT NULL REFERENCES smart_lock_gateways(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  provider_device_id TEXT NOT NULL,
  mapping_status TEXT NOT NULL DEFAULT 'active',
  bound_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT smart_lock_device_gateways_provider_device_required_check CHECK (length(trim(provider_device_id)) > 0),
  CONSTRAINT smart_lock_device_gateways_status_check CHECK (mapping_status IN ('active', 'migrating', 'retired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sldg_device_active_unique
  ON smart_lock_device_gateways(smart_lock_device_id)
  WHERE mapping_status = 'active';

CREATE INDEX IF NOT EXISTS idx_sldg_gateway_status
  ON smart_lock_device_gateways(gateway_id, mapping_status);

CREATE INDEX IF NOT EXISTS idx_sldg_device_status
  ON smart_lock_device_gateways(smart_lock_device_id, mapping_status);

CREATE TABLE IF NOT EXISTS smart_lock_gateway_health (
  gateway_id UUID PRIMARY KEY REFERENCES smart_lock_gateways(id) ON DELETE CASCADE ON UPDATE CASCADE,
  health_status TEXT NOT NULL DEFAULT 'unknown',
  last_checked_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  latency_ms INTEGER,
  error_code TEXT,
  error_message TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT smart_lock_gateway_health_status_check CHECK (
    health_status IN ('healthy', 'degraded', 'unhealthy', 'unknown')
  ),
  CONSTRAINT smart_lock_gateway_health_latency_check CHECK (latency_ms IS NULL OR latency_ms >= 0),
  CONSTRAINT smart_lock_gateway_health_failures_check CHECK (consecutive_failures >= 0)
);

CREATE INDEX IF NOT EXISTS idx_slgh_status_checked
  ON smart_lock_gateway_health(health_status, last_checked_at DESC);
