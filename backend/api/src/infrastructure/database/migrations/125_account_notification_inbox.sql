BEGIN;

-- State belongs to a viewing account, never to all recipients of a property.
CREATE TABLE IF NOT EXISTS notification_account_states (
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  notification_status TEXT NOT NULL DEFAULT 'unread'
    CHECK (notification_status IN ('unread', 'read', 'archived')),
  read_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_notification_account_states_user_status
  ON notification_account_states(user_id, notification_status, notification_id);

-- The only account to which a legacy row can be attributed is its recipient.
-- Property-wide Admin actions cannot be reconstructed or assigned to others.
INSERT INTO notification_account_states(notification_id, user_id, notification_status, read_at, archived_at)
SELECT id, recipient_user_id, notification_status, read_at,
       CASE WHEN notification_status='archived' THEN COALESCE(read_at, created_at) END
FROM notifications
ON CONFLICT (notification_id, user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS notification_event_projection_state (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO notification_event_projection_state(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS notification_event_projections (
  event_id UUID PRIMARY KEY REFERENCES business_events(id) ON DELETE RESTRICT,
  projected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE notification_account_states IS 'Account-scoped notification read and archive state; no business workflow mutation or permanent deletion.';

COMMIT;
