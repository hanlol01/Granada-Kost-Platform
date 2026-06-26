CREATE TABLE IF NOT EXISTS smart_lock_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  device_name TEXT NOT NULL,
  tuya_device_id TEXT NOT NULL,
  model TEXT DEFAULT 'PALOMA DLP 2131',
  connection_status TEXT NOT NULL DEFAULT 'unknown',
  lock_state TEXT NOT NULL DEFAULT 'unknown',
  device_status TEXT NOT NULL DEFAULT 'provisioned',
  battery_percent SMALLINT,
  auto_lock_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_lock_delay_seconds SMALLINT NOT NULL DEFAULT 5,
  firmware_version TEXT,
  normal_open_mode BOOLEAN NOT NULL DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  commissioned_at TIMESTAMPTZ,
  decommissioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT smart_lock_devices_tuya_device_id_unique UNIQUE (tuya_device_id),
  CONSTRAINT smart_lock_devices_name_required_check CHECK (length(trim(device_name)) > 0),
  CONSTRAINT smart_lock_devices_tuya_device_id_required_check CHECK (length(trim(tuya_device_id)) > 0),
  CONSTRAINT smart_lock_devices_connection_status_check CHECK (connection_status IN ('online', 'offline', 'unknown')),
  CONSTRAINT smart_lock_devices_lock_state_check CHECK (lock_state IN ('locked', 'unlocked', 'unknown')),
  CONSTRAINT smart_lock_devices_device_status_check CHECK (
    device_status IN ('provisioned', 'active', 'maintenance', 'decommissioned')
  ),
  CONSTRAINT smart_lock_devices_battery_check CHECK (
    battery_percent IS NULL OR (battery_percent >= 0 AND battery_percent <= 100)
  ),
  CONSTRAINT smart_lock_devices_auto_lock_delay_check CHECK (auto_lock_delay_seconds >= 0),
  CONSTRAINT smart_lock_devices_decommissioned_at_check CHECK (
    (device_status = 'decommissioned' AND decommissioned_at IS NOT NULL)
    OR (device_status <> 'decommissioned')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sld_room_active_unique
  ON smart_lock_devices(room_id)
  WHERE device_status <> 'decommissioned';

CREATE INDEX IF NOT EXISTS idx_sld_property_status
  ON smart_lock_devices(property_id, device_status);

CREATE INDEX IF NOT EXISTS idx_sld_room
  ON smart_lock_devices(room_id);

CREATE TABLE IF NOT EXISTS smart_lock_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  smart_lock_device_id UUID NOT NULL REFERENCES smart_lock_devices(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  resident_id UUID REFERENCES residents(id) ON DELETE SET NULL ON UPDATE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  grant_type TEXT NOT NULL,
  grant_status TEXT NOT NULL DEFAULT 'active',
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  grant_purpose TEXT,
  source_ref_type TEXT,
  source_ref_id UUID,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  suspended_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT smart_lock_access_grants_type_check CHECK (grant_type IN ('resident', 'technician', 'temporary', 'master')),
  CONSTRAINT smart_lock_access_grants_status_check CHECK (grant_status IN ('active', 'suspended', 'revoked', 'expired')),
  CONSTRAINT smart_lock_access_grants_valid_window_check CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT smart_lock_access_grants_resident_type_check CHECK (
    (grant_type = 'resident' AND resident_id IS NOT NULL)
    OR (grant_type <> 'resident')
  ),
  CONSTRAINT smart_lock_access_grants_suspended_at_check CHECK (
    (grant_status = 'suspended' AND suspended_at IS NOT NULL)
    OR (grant_status <> 'suspended')
  ),
  CONSTRAINT smart_lock_access_grants_revoked_at_check CHECK (
    (grant_status = 'revoked' AND revoked_at IS NOT NULL)
    OR (grant_status <> 'revoked')
  ),
  CONSTRAINT smart_lock_access_grants_revoke_reason_check CHECK (
    revoke_reason IS NULL OR revoke_reason IN ('checkout', 'restriction', 'manual_admin', 'security_incident', 'expired')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_slag_resident_device_active_unique
  ON smart_lock_access_grants(resident_id, smart_lock_device_id)
  WHERE grant_status = 'active' AND grant_type = 'resident';

CREATE INDEX IF NOT EXISTS idx_slag_device_status
  ON smart_lock_access_grants(smart_lock_device_id, grant_status);

CREATE INDEX IF NOT EXISTS idx_slag_resident_active
  ON smart_lock_access_grants(resident_id, grant_status);

CREATE INDEX IF NOT EXISTS idx_slag_expiry
  ON smart_lock_access_grants(valid_until)
  WHERE grant_status = 'active' AND valid_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS smart_lock_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  smart_lock_device_id UUID NOT NULL REFERENCES smart_lock_devices(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  access_grant_id UUID REFERENCES smart_lock_access_grants(id) ON DELETE SET NULL ON UPDATE CASCADE,
  credential_type TEXT NOT NULL,
  credential_status TEXT NOT NULL DEFAULT 'creating',
  tuya_credential_id TEXT,
  credential_label TEXT NOT NULL,
  pin_display_hash TEXT,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  finger_index TEXT,
  card_number_masked TEXT,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  disabled_at TIMESTAMPTZ,
  disabled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  disable_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT smart_lock_credentials_type_check CHECK (credential_type IN ('pin', 'card', 'fingerprint')),
  CONSTRAINT smart_lock_credentials_status_check CHECK (
    credential_status IN ('creating', 'active', 'disabled', 'expired', 'deleted', 'orphaned')
  ),
  CONSTRAINT smart_lock_credentials_label_required_check CHECK (length(trim(credential_label)) > 0),
  CONSTRAINT smart_lock_credentials_valid_window_check CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT smart_lock_credentials_pin_fields_check CHECK (
    (credential_type = 'pin' AND finger_index IS NULL AND card_number_masked IS NULL)
    OR credential_type <> 'pin'
  ),
  CONSTRAINT smart_lock_credentials_card_fields_check CHECK (
    (credential_type = 'card' AND pin_display_hash IS NULL AND finger_index IS NULL)
    OR credential_type <> 'card'
  ),
  CONSTRAINT smart_lock_credentials_fingerprint_fields_check CHECK (
    (credential_type = 'fingerprint' AND pin_display_hash IS NULL AND card_number_masked IS NULL)
    OR credential_type <> 'fingerprint'
  ),
  CONSTRAINT smart_lock_credentials_disabled_at_check CHECK (
    (credential_status = 'disabled' AND disabled_at IS NOT NULL)
    OR (credential_status <> 'disabled')
  ),
  CONSTRAINT smart_lock_credentials_disable_reason_check CHECK (
    disable_reason IS NULL OR disable_reason IN ('restriction', 'manual_admin', 'checkout', 'security_incident', 'replaced')
  )
);

CREATE INDEX IF NOT EXISTS idx_slc_device_status
  ON smart_lock_credentials(smart_lock_device_id, credential_status);

CREATE INDEX IF NOT EXISTS idx_slc_grant
  ON smart_lock_credentials(access_grant_id);

CREATE INDEX IF NOT EXISTS idx_slc_orphaned
  ON smart_lock_credentials(credential_status)
  WHERE credential_status = 'orphaned';

CREATE TABLE IF NOT EXISTS smart_lock_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  smart_lock_device_id UUID NOT NULL REFERENCES smart_lock_devices(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  resident_id UUID REFERENCES residents(id) ON DELETE SET NULL ON UPDATE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  action_type TEXT NOT NULL,
  source TEXT NOT NULL,
  trigger TEXT,
  result_status TEXT NOT NULL,
  failure_reason TEXT,
  credential_type_used TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  correlation_id UUID,
  metadata JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT smart_lock_access_logs_action_type_check CHECK (
    action_type IN (
      'lock',
      'unlock',
      'remote_unlock',
      'emergency_unlock',
      'doorbell_ring',
      'failed_attempt',
      'sync_status',
      'restrict',
      'unrestrict',
      'normal_open_mode',
      'normal_open_mode_on',
      'normal_open_mode_off',
      'credential_created',
      'credential_disabled',
      'credential_deleted',
      'pin_revealed'
    )
  ),
  CONSTRAINT smart_lock_access_logs_source_check CHECK (
    source IN (
      'resident_app',
      'admin_dashboard',
      'auto_lock',
      'device',
      'system',
      'billing_system',
      'checkout_workflow',
      'maintenance',
      'emergency_override'
    )
  ),
  CONSTRAINT smart_lock_access_logs_trigger_check CHECK (
    trigger IS NULL OR trigger IN ('manual', 'doorbell', 'auto_lock', 'schedule', 'checkout_workflow', 'restriction_workflow')
  ),
  CONSTRAINT smart_lock_access_logs_result_status_check CHECK (
    result_status IN ('success', 'failed', 'denied', 'timeout', 'device_offline', 'queued')
  ),
  CONSTRAINT smart_lock_access_logs_credential_type_used_check CHECK (
    credential_type_used IS NULL OR credential_type_used IN ('pin', 'card', 'fingerprint', 'remote', 'auto_lock')
  )
);

CREATE INDEX IF NOT EXISTS idx_slal_device_occurred
  ON smart_lock_access_logs(smart_lock_device_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_slal_property_action_occurred
  ON smart_lock_access_logs(property_id, action_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_slal_room_occurred
  ON smart_lock_access_logs(room_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_slal_correlation
  ON smart_lock_access_logs(correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS smart_lock_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  smart_lock_device_id UUID NOT NULL REFERENCES smart_lock_devices(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  reason_type TEXT NOT NULL,
  reason_description TEXT NOT NULL,
  reason_ref_type TEXT,
  reason_ref_id UUID,
  restriction_status TEXT NOT NULL DEFAULT 'pending_approval',
  requested_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  approved_at TIMESTAMPTZ,
  grace_period_ends_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  lifted_at TIMESTAMPTZ,
  lifted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  lift_reason TEXT,
  lift_suggested_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejected_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  rejection_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT smart_lock_restrictions_reason_type_check CHECK (
    reason_type IN ('billing_overdue', 'manual_admin', 'security_incident', 'checkout_completed')
  ),
  CONSTRAINT smart_lock_restrictions_description_required_check CHECK (length(trim(reason_description)) > 0),
  CONSTRAINT smart_lock_restrictions_status_check CHECK (
    restriction_status IN ('pending_approval', 'approved', 'applied', 'rejected', 'lifted', 'cancelled')
  ),
  CONSTRAINT smart_lock_restrictions_approved_state_check CHECK (
    (restriction_status = 'approved' AND approved_at IS NOT NULL AND approved_by_user_id IS NOT NULL)
    OR (restriction_status <> 'approved')
  ),
  CONSTRAINT smart_lock_restrictions_applied_state_check CHECK (
    (restriction_status = 'applied' AND applied_at IS NOT NULL)
    OR (restriction_status <> 'applied')
  ),
  CONSTRAINT smart_lock_restrictions_lifted_state_check CHECK (
    (restriction_status = 'lifted' AND lifted_at IS NOT NULL AND lifted_by_user_id IS NOT NULL)
    OR (restriction_status <> 'lifted')
  ),
  CONSTRAINT smart_lock_restrictions_rejected_state_check CHECK (
    (restriction_status = 'rejected' AND rejected_at IS NOT NULL AND rejected_by_user_id IS NOT NULL)
    OR (restriction_status <> 'rejected')
  ),
  CONSTRAINT smart_lock_restrictions_cancelled_state_check CHECK (
    (restriction_status = 'cancelled' AND cancelled_at IS NOT NULL)
    OR (restriction_status <> 'cancelled')
  ),
  CONSTRAINT smart_lock_restrictions_lift_reason_check CHECK (
    lift_reason IS NULL OR lift_reason IN ('payment_cleared', 'manual_override', 'checkout')
  ),
  CONSTRAINT smart_lock_restrictions_cancel_reason_check CHECK (
    cancel_reason IS NULL OR cancel_reason IN ('payment_received', 'requestor_cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_slr_device_status
  ON smart_lock_restrictions(smart_lock_device_id, restriction_status);

CREATE INDEX IF NOT EXISTS idx_slr_resident_active
  ON smart_lock_restrictions(resident_id, restriction_status)
  WHERE restriction_status IN ('pending_approval', 'approved', 'applied');

CREATE INDEX IF NOT EXISTS idx_slr_grace_period
  ON smart_lock_restrictions(grace_period_ends_at)
  WHERE restriction_status = 'approved' AND grace_period_ends_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS smart_lock_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  smart_lock_device_id UUID NOT NULL REFERENCES smart_lock_devices(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  alert_status TEXT NOT NULL DEFAULT 'active',
  alert_data JSONB,
  raised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT smart_lock_alerts_type_check CHECK (
    alert_type IN (
      'battery_warning',
      'battery_critical',
      'device_offline',
      'device_online',
      'failed_attempts',
      'normal_open_mode_active',
      'sync_failed'
    )
  ),
  CONSTRAINT smart_lock_alerts_severity_check CHECK (severity IN ('info', 'warning', 'danger')),
  CONSTRAINT smart_lock_alerts_status_check CHECK (alert_status IN ('active', 'acknowledged', 'resolved', 'auto_resolved')),
  CONSTRAINT smart_lock_alerts_title_required_check CHECK (length(trim(title)) > 0),
  CONSTRAINT smart_lock_alerts_acknowledged_state_check CHECK (
    (alert_status = 'acknowledged' AND acknowledged_at IS NOT NULL AND acknowledged_by_user_id IS NOT NULL)
    OR (alert_status <> 'acknowledged')
  ),
  CONSTRAINT smart_lock_alerts_resolved_state_check CHECK (
    (alert_status IN ('resolved', 'auto_resolved') AND resolved_at IS NOT NULL)
    OR (alert_status NOT IN ('resolved', 'auto_resolved'))
  )
);

CREATE INDEX IF NOT EXISTS idx_sla_device_active
  ON smart_lock_alerts(smart_lock_device_id, alert_status)
  WHERE alert_status = 'active';

CREATE INDEX IF NOT EXISTS idx_sla_property_severity
  ON smart_lock_alerts(property_id, severity, raised_at DESC);
