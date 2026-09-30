BEGIN;

ALTER TABLE rooms
  ADD COLUMN manager_room_label VARCHAR(160),
  ADD COLUMN owner_room_number VARCHAR(80),
  ADD COLUMN plot_number VARCHAR(80);

UPDATE rooms
SET manager_room_label =
  CASE category WHEN 'rukost' THEN 'Rumah Kost' WHEN 'apartkost' THEN 'Apart Kost' ELSE 'Kamar' END
  || ' · Unit ' || COALESCE(NULLIF(regexp_replace(split_part(COALESCE(
    (SELECT building_code FROM room_buildings WHERE id=rooms.building_id), room_code, number), '-', 2), '^0+', ''), ''), '0')
  || ', Kamar ' || COALESCE(NULLIF(regexp_replace(substring(COALESCE(room_code, number) FROM '^[^-]+-[^-]+-(.+)$'), '^0+', ''), ''), '0')
WHERE COALESCE(room_code, number) ~ '^[^-]+-[^-]+-.+$';

COMMIT;
