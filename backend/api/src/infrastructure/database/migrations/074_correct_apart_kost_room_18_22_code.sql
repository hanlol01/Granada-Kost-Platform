BEGIN;

-- Correct the AK-18-22 target to the approved inventory mapping. The room
-- row itself is retained, so all relations and its lifecycle history remain
-- intact; only its public identifiers are corrected.
DO $$
DECLARE
  source_count INTEGER;
  target_count INTEGER;
  updated_count INTEGER;
BEGIN
  IF to_regclass('public.rooms') IS NULL THEN
    RAISE EXCEPTION 'Room inventory authority is unavailable';
  END IF;

  SELECT count(*)
    INTO source_count
  FROM rooms
  WHERE category = 'apartkost'
    AND number = 'AK-18/20-22'
    AND room_code = 'AK-18/20-22';

  SELECT count(*)
    INTO target_count
  FROM rooms
  WHERE category = 'apartkost'
    AND number = 'AK-18/19-22';

  IF source_count = 0 AND target_count = 1 THEN
    IF EXISTS (
      SELECT 1
      FROM rooms
      WHERE category = 'apartkost'
        AND number = 'AK-18/19-22'
        AND room_code <> 'AK-18/19-22'
    ) THEN
      RAISE EXCEPTION 'AK-18/19-22 has an inconsistent room_code value';
    END IF;
    RETURN;
  END IF;

  IF source_count <> 1 OR target_count <> 0 THEN
    RAISE EXCEPTION
      'Unexpected AK-18-22 rename state (source %, target %)',
      source_count,
      target_count;
  END IF;

  UPDATE rooms
  SET number = 'AK-18/19-22',
      room_code = 'AK-18/19-22',
      updated_at = now()
  WHERE category = 'apartkost'
    AND number = 'AK-18/20-22'
    AND room_code = 'AK-18/20-22';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> 1 THEN
    RAISE EXCEPTION 'Expected to correct one AK-18-22 room code, corrected %', updated_count;
  END IF;
END $$;

COMMIT;
