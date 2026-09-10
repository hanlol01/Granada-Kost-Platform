BEGIN;

-- The first permanent ownership assignment must cover the historical
-- commercial period as well. Subsequent ownership changes remain bounded by
-- their preceding assignment because the overlap guard below leaves them
-- untouched.
CREATE OR REPLACE FUNCTION property_owner_initial_assignment_date(p_property_id UUID)
RETURNS DATE
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT MIN(policies.effective_from)
      FROM property_owner_commercial_policies policies
      WHERE policies.property_id = p_property_id
        AND policies.policy_status = 'active'
    ),
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
  );
$$;

WITH candidates AS (
  SELECT assignments.id,
         property_owner_initial_assignment_date(assignments.property_id) AS historical_from
  FROM building_owner_assignments assignments
  WHERE assignments.assignment_status = 'active'
    AND assignments.effective_until IS NULL
)
UPDATE building_owner_assignments assignments
SET effective_from = candidates.historical_from,
    updated_at = now()
FROM candidates
WHERE assignments.id = candidates.id
  AND candidates.historical_from < assignments.effective_from
  AND NOT EXISTS (
    SELECT 1
    FROM building_owner_assignments other
    WHERE other.id <> assignments.id
      AND other.property_id = assignments.property_id
      AND other.building_id = assignments.building_id
      AND daterange(
        other.effective_from,
        COALESCE(other.effective_until, 'infinity'::date),
        '[)'
      ) && daterange(candidates.historical_from, assignments.effective_from, '[)')
  );

WITH candidates AS (
  SELECT assignments.id,
         property_owner_initial_assignment_date(assignments.property_id) AS historical_from
  FROM room_owner_assignments assignments
  WHERE assignments.assignment_status = 'active'
    AND assignments.effective_until IS NULL
)
UPDATE room_owner_assignments assignments
SET effective_from = candidates.historical_from,
    updated_at = now()
FROM candidates
WHERE assignments.id = candidates.id
  AND candidates.historical_from < assignments.effective_from
  AND NOT EXISTS (
    SELECT 1
    FROM room_owner_assignments other
    WHERE other.id <> assignments.id
      AND other.property_id = assignments.property_id
      AND other.room_id = assignments.room_id
      AND daterange(
        other.effective_from,
        COALESCE(other.effective_until, 'infinity'::date),
        '[)'
      ) && daterange(candidates.historical_from, assignments.effective_from, '[)')
  );

COMMIT;
