BEGIN;

-- Keep the room location label aligned with the corrected Rumah Kost unit.
-- Room numbers and room codes remain unchanged for the Admin's manual review.
UPDATE rooms
SET floor_label = 'Unit 07'
WHERE building_id IN (
  SELECT id
  FROM room_buildings
  WHERE category = 'rukost'
    AND building_code = 'RK-07'
    AND building_name = 'Rumah Kost Unit 07'
)
  AND floor_label = 'Unit 05';

COMMIT;
