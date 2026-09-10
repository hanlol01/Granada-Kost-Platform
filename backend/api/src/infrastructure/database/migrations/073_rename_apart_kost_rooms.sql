BEGIN;

-- Rename the Apart Kost room codes according to the approved 10 September
-- 2026 inventory mapping. Only the human-facing room identifiers change:
-- room IDs, unit/building links, availability status, and all financial or
-- occupancy history remain attached to the original room row.
CREATE TEMP TABLE apart_kost_room_code_rename (
  old_code TEXT PRIMARY KEY,
  new_code TEXT NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO apart_kost_room_code_rename (old_code, new_code)
VALUES
  ('AK-05-01', 'AK-6B-01'),
  ('AK-05-02', 'AK-6B-02'),
  ('AK-05-03', 'AK-06A-03'),
  ('AK-05-04', 'AK-06A-04'),
  ('AK-05-05', 'AK-05B-05'),
  ('AK-05-06', 'AK-05B-06'),
  ('AK-05-07', 'AK-05A-07'),
  ('AK-05-08', 'AK-05A-08'),
  ('AK-05-09', 'AK-6B-09'),
  ('AK-05-10', 'AK-6B-10'),
  ('AK-05-11', 'AK-06A-11'),
  ('AK-05-12', 'AK-06A-12'),
  ('AK-05-13', 'AK-05B-13'),
  ('AK-05-14', 'AK-05B-14'),
  ('AK-05-15', 'AK-05A-15'),
  ('AK-05-16', 'AK-05A-16'),
  ('AK-18-01', 'AK-18/15-01'),
  ('AK-18-02', 'AK-18/15-02'),
  ('AK-18-03', 'AK-18/16-03'),
  ('AK-18-04', 'AK-18/16-04'),
  ('AK-18-05', 'AK-18/17-05'),
  ('AK-18-06', 'AK-18/17-06'),
  ('AK-18-07', 'AK-18/18-07'),
  ('AK-18-08', 'AK-18/18-08'),
  ('AK-18-09', 'AK-18/19-09'),
  ('AK-18-10', 'AK-18/19-10'),
  ('AK-18-11', 'AK-18/20-11'),
  ('AK-18-12', 'AK-18/20-12'),
  ('AK-18-13', 'AK-18/15-13'),
  ('AK-18-14', 'AK-18/15-14'),
  ('AK-18-15', 'AK-18/16-15'),
  ('AK-18-16', 'AK-18/16-16'),
  ('AK-18-17', 'AK-18/17-17'),
  ('AK-18-18', 'AK-18/17-18'),
  ('AK-18-19', 'AK-18/18-19'),
  ('AK-18-20', 'AK-18/18-20'),
  ('AK-18-21', 'AK-18/19-21'),
  ('AK-18-22', 'AK-18/20-22'),
  ('AK-18-23', 'AK-18/20-23'),
  ('AK-18-24', 'AK-18/20-24');

DO $$
DECLARE
  expected_count CONSTANT INTEGER := 40;
  source_count INTEGER;
  target_count INTEGER;
  affected_property_count INTEGER;
  updated_count INTEGER;
BEGIN
  IF to_regclass('public.rooms') IS NULL THEN
    RAISE EXCEPTION 'Room inventory authority is unavailable';
  END IF;

  SELECT count(*)
    INTO source_count
  FROM rooms rooms
  JOIN apart_kost_room_code_rename mapping ON mapping.old_code = rooms.number
  WHERE rooms.category = 'apartkost';

  SELECT count(*)
    INTO target_count
  FROM rooms rooms
  JOIN apart_kost_room_code_rename mapping ON mapping.new_code = rooms.number
  WHERE rooms.category = 'apartkost';

  -- A completed rename may be retried safely if the source names are gone and
  -- all 40 target rows carry the same value in both public room-code fields.
  IF source_count = 0 AND target_count = expected_count THEN
    IF EXISTS (
      SELECT 1
      FROM rooms rooms
      JOIN apart_kost_room_code_rename mapping ON mapping.new_code = rooms.number
      WHERE rooms.category = 'apartkost'
        AND rooms.room_code IS DISTINCT FROM mapping.new_code
    ) THEN
      RAISE EXCEPTION 'Apart Kost rename target state has inconsistent room_code values';
    END IF;
    RETURN;
  END IF;

  IF source_count <> expected_count THEN
    RAISE EXCEPTION
      'Expected % Apart Kost source rooms for rename, found %',
      expected_count,
      source_count;
  END IF;

  IF target_count <> 0 THEN
    RAISE EXCEPTION 'Apart Kost rename target codes already exist (% collision(s))', target_count;
  END IF;

  SELECT count(DISTINCT rooms.property_id)
    INTO affected_property_count
  FROM rooms rooms
  JOIN apart_kost_room_code_rename mapping ON mapping.old_code = rooms.number
  WHERE rooms.category = 'apartkost';

  IF affected_property_count <> 1 THEN
    RAISE EXCEPTION
      'Expected one property for Apart Kost room rename, found %',
      affected_property_count;
  END IF;

  UPDATE rooms rooms
  SET number = mapping.new_code,
      room_code = mapping.new_code,
      updated_at = now()
  FROM apart_kost_room_code_rename mapping
  WHERE rooms.category = 'apartkost'
    AND rooms.number = mapping.old_code;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> expected_count THEN
    RAISE EXCEPTION
      'Expected to rename % Apart Kost rooms, renamed %',
      expected_count,
      updated_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM rooms rooms
    JOIN apart_kost_room_code_rename mapping ON mapping.new_code = rooms.number
    WHERE rooms.category = 'apartkost'
      AND rooms.room_code IS DISTINCT FROM mapping.new_code
  ) THEN
    RAISE EXCEPTION 'Apart Kost room-code rename verification failed';
  END IF;
END $$;

DROP TABLE apart_kost_room_code_rename;

COMMIT;
