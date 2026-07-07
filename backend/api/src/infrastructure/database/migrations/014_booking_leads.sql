CREATE TABLE IF NOT EXISTS booking_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  gender TEXT NOT NULL,
  building_code TEXT,
  floor_code TEXT,
  public_group_key TEXT,
  visitor_name TEXT NOT NULL,
  visitor_phone TEXT NOT NULL,
  visitor_message TEXT,
  preferred_move_in_date DATE,
  status TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL DEFAULT 'public_kamar',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT booking_leads_category_check CHECK (category IN ('rukost', 'apartkost')),
  CONSTRAINT booking_leads_gender_check CHECK (gender IN ('male', 'female')),
  CONSTRAINT booking_leads_floor_code_check CHECK (floor_code IS NULL OR floor_code IN ('A', 'B')),
  CONSTRAINT booking_leads_status_check CHECK (
    status IN ('new', 'contacted', 'visit_scheduled', 'converted', 'rejected', 'expired')
  ),
  CONSTRAINT booking_leads_source_check CHECK (source IN ('public_kamar')),
  CONSTRAINT booking_leads_visitor_name_length_check CHECK (char_length(trim(visitor_name)) BETWEEN 2 AND 120),
  CONSTRAINT booking_leads_visitor_phone_length_check CHECK (char_length(visitor_phone) BETWEEN 10 AND 16),
  CONSTRAINT booking_leads_visitor_message_length_check CHECK (
    visitor_message IS NULL OR char_length(visitor_message) <= 1000
  ),
  CONSTRAINT booking_leads_public_group_key_length_check CHECK (
    public_group_key IS NULL OR char_length(public_group_key) <= 80
  )
);

CREATE INDEX IF NOT EXISTS idx_booking_leads_property_status_created
  ON booking_leads(property_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_leads_property_category_gender
  ON booking_leads(property_id, category, gender);

CREATE INDEX IF NOT EXISTS idx_booking_leads_visitor_phone_created
  ON booking_leads(visitor_phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_leads_public_group_key
  ON booking_leads(public_group_key)
  WHERE public_group_key IS NOT NULL;
