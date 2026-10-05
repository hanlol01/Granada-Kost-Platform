import { ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';

/** Shared effective-dated reference, not a replacement for the pricing calculator. */
export async function readLeaseCommercialReference(client: PoolClient, roomId: string, date: string) {
  const result = await client.query<{
    short_stay_monthly_price: string; medium_stay_monthly_price: string;
    long_stay_monthly_price: string; annual_contract_value: string;
    effective_date: string; management_fee_amount: string;
  }>(`SELECT commercial.short_stay_monthly_price::text,
    commercial.medium_stay_monthly_price::text,commercial.long_stay_monthly_price::text,
    commercial.annual_contract_value::text,commercial.effective_date::text,
    fee.monthly_fee_amount::text AS management_fee_amount
    FROM rooms room JOIN LATERAL (
      SELECT short_stay_monthly_price,medium_stay_monthly_price,long_stay_monthly_price,annual_contract_value,effective_date
      FROM kost_type_commercial_versions WHERE kost_type_id=room.kost_type_id AND effective_date<=$2::date
      ORDER BY effective_date DESC,id DESC LIMIT 1
    ) commercial ON true LEFT JOIN LATERAL (
      SELECT monthly_fee_amount FROM property_management_fee_versions
      WHERE property_id=room.property_id AND effective_date<=$2::date
      ORDER BY effective_date DESC,id DESC LIMIT 1
    ) fee ON true WHERE room.id=$1`, [roomId, date]);
  if (!result.rows[0]) throw new ConflictException({ code: 'LEASE_DATA_CORRECTION_PRICING_MISSING',
    message: 'Tarif yang berlaku pada tanggal tinjauan belum tersedia. Tinjau tarif kamar sebelum melanjutkan.' });
  return result.rows[0];
}
