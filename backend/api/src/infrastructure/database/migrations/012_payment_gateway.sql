CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_order_id TEXT NOT NULL,
  provider_transaction_id TEXT,
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IDR',
  status TEXT NOT NULL DEFAULT 'created',
  payment_method TEXT,
  payment_url TEXT,
  snap_token_ref TEXT,
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  raw_status_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_transactions_provider_check CHECK (provider IN ('midtrans')),
  CONSTRAINT payment_transactions_currency_check CHECK (currency IN ('IDR')),
  CONSTRAINT payment_transactions_status_check CHECK (
    status IN ('created', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'denied', 'challenge', 'requires_review', 'unknown')
  ),
  CONSTRAINT payment_transactions_amount_check CHECK (amount > 0),
  CONSTRAINT payment_transactions_provider_order_unique UNIQUE (provider, provider_order_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_invoice
  ON payment_transactions(invoice_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_property_status_created
  ON payment_transactions(property_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_resident_created
  ON payment_transactions(resident_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_status
  ON payment_transactions(status);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_created
  ON payment_transactions(created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_invoice_active_unique
  ON payment_transactions(invoice_id)
  WHERE status IN ('created', 'pending');

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_invoice_paid_unique
  ON payment_transactions(invoice_id)
  WHERE status = 'paid';

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT,
  provider_order_id TEXT,
  payload_hash TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'received',
  normalized_result JSONB,
  sanitized_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_webhook_events_provider_check CHECK (provider IN ('midtrans')),
  CONSTRAINT payment_webhook_events_status_check CHECK (
    status IN ('received', 'verified', 'duplicate', 'rejected', 'requires_review', 'processed')
  ),
  CONSTRAINT payment_webhook_events_hash_unique UNIQUE (provider, payload_hash)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_provider_order
  ON payment_webhook_events(provider, provider_order_id);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_status_received
  ON payment_webhook_events(status, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_created
  ON payment_webhook_events(created_at DESC);
