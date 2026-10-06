BEGIN;

-- Technician records are maintained by operators and do not require login accounts.
ALTER TABLE technician_profiles
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE technician_profiles
  ADD COLUMN created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE technician_profiles
  ADD CONSTRAINT technician_profiles_property_id_id_unique UNIQUE (property_id, id);

-- Keep legacy account assignments intact while new dispatches reference a
-- durable property-scoped technician profile instead.
ALTER TABLE complaints
  ADD COLUMN assigned_technician_profile_id UUID;

ALTER TABLE complaints
  ADD CONSTRAINT complaints_assigned_technician_profile_fk
  FOREIGN KEY (property_id, assigned_technician_profile_id)
  REFERENCES technician_profiles(property_id, id)
  ON DELETE RESTRICT;

ALTER TABLE maintenance_work_orders
  ADD COLUMN assigned_technician_profile_id UUID;

ALTER TABLE maintenance_work_orders
  ADD CONSTRAINT work_orders_assigned_technician_profile_fk
  FOREIGN KEY (property_id, assigned_technician_profile_id)
  REFERENCES technician_profiles(property_id, id)
  ON DELETE RESTRICT;

CREATE INDEX idx_complaints_assigned_technician_profile
  ON complaints(assigned_technician_profile_id, complaint_status)
  WHERE assigned_technician_profile_id IS NOT NULL;

CREATE INDEX idx_work_orders_assigned_technician_profile
  ON maintenance_work_orders(assigned_technician_profile_id, work_order_status)
  WHERE assigned_technician_profile_id IS NOT NULL;

COMMENT ON COLUMN technician_profiles.user_id IS
  'Optional legacy account link; internal directory technicians do not receive login accounts.';
COMMENT ON COLUMN technician_profiles.is_active IS
  'Inactive technicians are hidden from new assignment choices; linked work-order history is retained.';
COMMENT ON COLUMN complaints.assigned_technician_profile_id IS
  'Property-scoped internal technician assignment; legacy user assignment remains in assigned_to_user_id.';
COMMENT ON COLUMN maintenance_work_orders.assigned_technician_profile_id IS
  'Property-scoped internal technician assignment; legacy user assignment remains in assigned_to_user_id.';

COMMIT;
