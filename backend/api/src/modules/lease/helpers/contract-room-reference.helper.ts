/**
 * A physical addendum changes occupancy, not the full-contract financial room.
 * Legacy successor contracts keep their own room. No transfer => current room.
 * Only trusted SQL aliases are accepted; no request values enter this fragment.
 */
export function contractRoomIdSql(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(alias)) throw new Error('Invalid lease SQL alias');
  return `CASE WHEN ${alias}.contract_rent_amount IS NOT NULL THEN COALESCE((
    SELECT transfer.from_room_id FROM room_transfer_records transfer
     WHERE transfer.property_id = ${alias}.property_id
       AND transfer.from_lease_id = ${alias}.id
       AND transfer.to_lease_id = ${alias}.id
     ORDER BY transfer.created_at, transfer.id LIMIT 1
  ), ${alias}.room_id) ELSE ${alias}.room_id END`;
}
