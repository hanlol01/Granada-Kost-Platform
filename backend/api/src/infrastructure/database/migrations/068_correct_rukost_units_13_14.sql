BEGIN;

-- Correct the Rumah Kost Unit 13/14 assignment without deleting room rows.
-- Unit 13 keeps rooms 01-06 (Putra); rooms 07-11 move to Unit 14 (Putri).
-- The migration is fail-closed when any affected room has lifecycle history.
DO $$
DECLARE
  property_row RECORD;
  unit13_id UUID;
  unit14_id UUID;
  moved_count INTEGER;
  unit13_rooms INTEGER;
  unit14_rooms INTEGER;
  unit13_gender TEXT;
  unit14_gender TEXT;
BEGIN
  IF to_regclass('public.room_buildings') IS NULL OR to_regclass('public.rooms') IS NULL THEN
    RAISE EXCEPTION 'Room inventory authority is unavailable';
  END IF;

  FOR property_row IN
    SELECT DISTINCT property_id
    FROM room_buildings
    WHERE category = 'rukost'
      AND building_code IN ('RK-13', 'RK-14')
  LOOP
    SELECT id, total_rooms, gender_policy
      INTO unit13_id, unit13_rooms, unit13_gender
    FROM room_buildings
    WHERE property_id = property_row.property_id
      AND category = 'rukost'
      AND building_code = 'RK-13';

    SELECT id, total_rooms, gender_policy
      INTO unit14_id, unit14_rooms, unit14_gender
    FROM room_buildings
    WHERE property_id = property_row.property_id
      AND category = 'rukost'
      AND building_code = 'RK-14';

    IF unit13_id IS NULL OR unit14_id IS NULL THEN
      RAISE EXCEPTION 'Both RK-13 and RK-14 are required for property %', property_row.property_id;
    END IF;

    -- Safe to re-run after a completed deployment.
    IF unit13_rooms = 6
       AND unit13_gender = 'male'
       AND unit14_rooms = 11
       AND unit14_gender = 'female'
       AND (SELECT count(*) FROM rooms WHERE building_id = unit13_id) = 6
       AND (SELECT count(*) FROM rooms WHERE building_id = unit14_id) = 11
       AND NOT EXISTS (
         SELECT 1
         FROM rooms
         WHERE building_id = unit13_id
           AND gender_policy <> 'male'
       )
       AND NOT EXISTS (
         SELECT 1
         FROM rooms
         WHERE building_id = unit14_id
           AND gender_policy <> 'female'
       ) THEN
      CONTINUE;
    END IF;

    IF unit13_rooms <> 11 OR unit13_gender <> 'female'
       OR unit14_rooms <> 6 OR unit14_gender <> 'male' THEN
      RAISE EXCEPTION
        'Unexpected RK-13/RK-14 source state for property % (RK-13 %, %; RK-14 %, %)',
        property_row.property_id, unit13_rooms, unit13_gender, unit14_rooms, unit14_gender;
    END IF;

    IF (SELECT count(*) FROM rooms WHERE building_id = unit13_id) <> 11
       OR (SELECT count(*) FROM rooms WHERE building_id = unit14_id) <> 6 THEN
      RAISE EXCEPTION 'Room rows do not match RK-13/RK-14 source counts for property %', property_row.property_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM rooms
      WHERE building_id IN (unit13_id, unit14_id)
        AND room_status <> 'vacant'
    ) THEN
      RAISE EXCEPTION 'RK-13/RK-14 contains a non-vacant room for property %; migration aborted', property_row.property_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM leases
      WHERE room_id IN (SELECT id FROM rooms WHERE building_id IN (unit13_id, unit14_id))
    ) OR EXISTS (
      SELECT 1
      FROM occupancies
      WHERE room_id IN (SELECT id FROM rooms WHERE building_id IN (unit13_id, unit14_id))
    ) OR EXISTS (
      SELECT 1
      FROM booking_lead_holds
      WHERE room_id IN (SELECT id FROM rooms WHERE building_id IN (unit13_id, unit14_id))
    ) OR EXISTS (
      SELECT 1
      FROM onboarding_commitments
      WHERE room_id IN (SELECT id FROM rooms WHERE building_id IN (unit13_id, unit14_id))
    ) OR EXISTS (
      SELECT 1
      FROM room_owner_assignments
      WHERE room_id IN (SELECT id FROM rooms WHERE building_id IN (unit13_id, unit14_id))
    ) THEN
      RAISE EXCEPTION 'RK-13/RK-14 has lifecycle history; migration aborted for property %', property_row.property_id;
    END IF;

    IF (SELECT count(*)
        FROM rooms
        WHERE building_id = unit13_id
          AND room_code IN ('RK-13-07', 'RK-13-08', 'RK-13-09', 'RK-13-10', 'RK-13-11')) <> 5 THEN
      RAISE EXCEPTION 'RK-13 rooms 07-11 are not present for property %', property_row.property_id;
    END IF;

    UPDATE rooms
    SET gender_policy = 'male', updated_at = now()
    WHERE building_id = unit13_id;

    UPDATE rooms
    SET gender_policy = 'female', updated_at = now()
    WHERE building_id = unit14_id;

    UPDATE rooms
    SET building_id = unit14_id,
        number = replace(number, 'RK-13-', 'RK-14-'),
        unit_code = 'RK-14',
        room_code = replace(room_code, 'RK-13-', 'RK-14-'),
        gender_policy = 'female',
        updated_at = now()
    WHERE building_id = unit13_id
      AND room_code IN ('RK-13-07', 'RK-13-08', 'RK-13-09', 'RK-13-10', 'RK-13-11');

    GET DIAGNOSTICS moved_count = ROW_COUNT;
    IF moved_count <> 5 THEN
      RAISE EXCEPTION 'Expected to move 5 rooms from RK-13 to RK-14 for property %, moved %',
        property_row.property_id, moved_count;
    END IF;

    UPDATE room_buildings
    SET gender_policy = 'male',
        total_rooms = counts.total_rooms,
        floor_a_count = counts.floor_a_count,
        floor_b_count = counts.floor_b_count,
        updated_at = now()
    FROM (
      SELECT count(*)::INTEGER AS total_rooms,
             count(*) FILTER (WHERE floor_code = 'A')::INTEGER AS floor_a_count,
             count(*) FILTER (WHERE floor_code = 'B')::INTEGER AS floor_b_count
      FROM rooms
      WHERE building_id = unit13_id
    ) counts
    WHERE room_buildings.id = unit13_id;

    UPDATE room_buildings
    SET gender_policy = 'female',
        total_rooms = counts.total_rooms,
        floor_a_count = counts.floor_a_count,
        floor_b_count = counts.floor_b_count,
        updated_at = now()
    FROM (
      SELECT count(*)::INTEGER AS total_rooms,
             count(*) FILTER (WHERE floor_code = 'A')::INTEGER AS floor_a_count,
             count(*) FILTER (WHERE floor_code = 'B')::INTEGER AS floor_b_count
      FROM rooms
      WHERE building_id = unit14_id
    ) counts
    WHERE room_buildings.id = unit14_id;

    IF (SELECT count(*) FROM rooms WHERE building_id = unit13_id) <> 6
       OR (SELECT count(*) FROM rooms WHERE building_id = unit14_id) <> 11
       OR EXISTS (SELECT 1 FROM rooms WHERE building_id = unit13_id AND gender_policy <> 'male')
       OR EXISTS (SELECT 1 FROM rooms WHERE building_id = unit14_id AND gender_policy <> 'female') THEN
      RAISE EXCEPTION 'RK-13/RK-14 correction verification failed for property %', property_row.property_id;
    END IF;
  END LOOP;
END $$;

COMMIT;
