ALTER TABLE property_settings
  ADD COLUMN IF NOT EXISTS notification_email_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_push_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_digest_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_digest_hour INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS notification_retention_days INTEGER NOT NULL DEFAULT 90;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'property_settings_notification_digest_hour_check'
  ) THEN
    ALTER TABLE property_settings
      ADD CONSTRAINT property_settings_notification_digest_hour_check
      CHECK (notification_digest_hour BETWEEN 0 AND 23);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'property_settings_notification_retention_days_check'
  ) THEN
    ALTER TABLE property_settings
      ADD CONSTRAINT property_settings_notification_retention_days_check
      CHECK (notification_retention_days BETWEEN 1 AND 3650);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  digest_mode BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_preferences_unique_user UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  notification_type TEXT NOT NULL,
  notification_status TEXT NOT NULL DEFAULT 'unread',
  priority TEXT NOT NULL DEFAULT 'normal',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB,
  source_event_type TEXT,
  source_resource_id UUID,
  correlation_id UUID,
  read_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '90 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notifications_status_check CHECK (notification_status IN ('unread', 'read', 'archived')),
  CONSTRAINT notifications_priority_check CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  CONSTRAINT notifications_type_required_check CHECK (length(trim(notification_type)) > 0),
  CONSTRAINT notifications_title_required_check CHECK (length(trim(title)) > 0),
  CONSTRAINT notifications_body_required_check CHECK (length(trim(body)) > 0),
  CONSTRAINT notifications_read_at_check CHECK (
    (notification_status = 'read' AND read_at IS NOT NULL)
    OR (notification_status <> 'read')
  )
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE ON UPDATE CASCADE,
  channel TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  recipient_address TEXT NOT NULL,
  subject TEXT,
  content_snapshot TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error_code TEXT,
  last_error_message TEXT,
  provider_message_id TEXT,
  skip_reason TEXT,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_deliveries_channel_check CHECK (channel IN ('email', 'whatsapp', 'push')),
  CONSTRAINT notification_deliveries_provider_check CHECK (provider_name IN ('brevo', 'fonnte', 'web_push')),
  CONSTRAINT notification_deliveries_status_check CHECK (
    delivery_status IN ('pending', 'sending', 'delivered', 'failed', 'dead_lettered', 'skipped')
  ),
  CONSTRAINT notification_deliveries_attempt_count_check CHECK (
    attempt_count >= 0 AND attempt_count <= max_attempts
  ),
  CONSTRAINT notification_deliveries_max_attempts_check CHECK (max_attempts BETWEEN 1 AND 10),
  CONSTRAINT notification_deliveries_recipient_required_check CHECK (length(trim(recipient_address)) > 0),
  CONSTRAINT notification_deliveries_delivered_at_check CHECK (
    (delivery_status = 'delivered' AND delivered_at IS NOT NULL)
    OR (delivery_status <> 'delivered')
  ),
  CONSTRAINT notification_deliveries_skip_reason_check CHECK (
    skip_reason IS NULL
    OR skip_reason IN (
      'quota_exhausted',
      'preference_disabled',
      'invalid_recipient',
      'channel_disabled',
      'deferred_to_digest',
      'provider_disabled',
      'user_inactive'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user
  ON notification_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_status
  ON notifications(recipient_user_id, notification_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON notifications(recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_property_type
  ON notifications(property_id, notification_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_expires
  ON notifications(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_source
  ON notifications(source_event_type, source_resource_id)
  WHERE source_event_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deliveries_status_retry
  ON notification_deliveries(delivery_status, next_retry_at)
  WHERE delivery_status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_deliveries_notification
  ON notification_deliveries(notification_id);

CREATE INDEX IF NOT EXISTS idx_deliveries_dead_letter
  ON notification_deliveries(created_at DESC)
  WHERE delivery_status = 'dead_lettered';
