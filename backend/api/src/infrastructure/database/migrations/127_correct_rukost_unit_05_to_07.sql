BEGIN;

-- Correct the Rumah Kost building label and unit metadata without rewriting
-- room numbers/codes. Room identifiers remain available for Admin to correct
-- manually after the unit label has been repaired.
DO $$
DECLARE
  building_row RECORD;
BEGIN
  IF to_regclass('public.room_buildings') IS NULL OR to_regclass('public.rooms') IS NULL THEN
    RAISE EXCEPTION 'Room inventory authority is unavailable';
  END IF;

  FOR building_row IN
    SELECT id, property_id
    FROM room_buildings
    WHERE category = 'rukost'
      AND building_code = 'RK-05'
      AND building_name = 'Rumah Kost Unit 05'
  LOOP
    IF EXISTS (
      SELECT 1
      FROM room_buildings
      WHERE property_id = building_row.property_id
        AND category = 'rukost'
        AND building_code = 'RK-07'
        AND id <> building_row.id
    ) THEN
      RAISE EXCEPTION
        'Cannot correct Rumah Kost Unit 05 for property % because RK-07 already exists',
        building_row.property_id;
    END IF;

    UPDATE room_buildings
    SET building_code = 'RK-07',
        building_name = 'Rumah Kost Unit 07',
        updated_at = now()
    WHERE id = building_row.id;

    UPDATE rooms
    SET unit_code = 'RK-07'
    WHERE building_id = building_row.id;
  END LOOP;
END $$;

COMMIT;
