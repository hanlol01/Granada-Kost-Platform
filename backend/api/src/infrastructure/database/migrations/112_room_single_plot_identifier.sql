BEGIN;

UPDATE rooms
   SET plot_number = COALESCE(NULLIF(BTRIM(plot_number), ''), NULLIF(BTRIM(owner_room_number), ''))
 WHERE NULLIF(BTRIM(plot_number), '') IS NULL
   AND NULLIF(BTRIM(owner_room_number), '') IS NOT NULL;

ALTER TABLE rooms DROP COLUMN owner_room_number;

COMMIT;
