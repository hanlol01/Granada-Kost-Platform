import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Pool, type PoolClient } from 'pg';
import { explicitDatabaseConfigFromEnv } from './database-url';

export type ReconciliationOutcome =
  | 'matched'
  | 'legacy_compatible'
  | 'unresolved'
  | 'blocking'
  | 'not_yet_representable';

export type ReconciliationResult = {
  check: string;
  outcome: ReconciliationOutcome;
  count: number;
};

export const RECONCILIATION_CHECKS: readonly {
  check: string;
  cleanOutcome: ReconciliationOutcome;
  findingOutcome: ReconciliationOutcome;
  expectedFindingCount?: number;
  unexpectedOutcome?: ReconciliationOutcome;
  sql: string;
}[] = [
  {
    check: 'room.building_scope',
    cleanOutcome: 'matched',
    findingOutcome: 'blocking',
    sql: `SELECT count(*)::int AS count FROM rooms r LEFT JOIN room_buildings b ON b.id = r.building_id
          WHERE b.id IS NULL OR b.property_id <> r.property_id OR b.category <> r.category
             OR b.gender_policy <> r.gender_policy`,
  },
  {
    check: 'room.lifecycle_authority',
    cleanOutcome: 'matched',
    findingOutcome: 'unresolved',
    sql: `SELECT count(*)::int AS count FROM rooms r
          WHERE (r.room_status = 'occupied') <> (
            EXISTS (SELECT 1 FROM occupancies o WHERE o.room_id = r.id AND o.occupancy_status = 'active')
            OR EXISTS (SELECT 1 FROM leases l WHERE l.room_id = r.id AND l.lease_status = 'active')
          ) OR (r.room_status = 'reserved') <> EXISTS (
            SELECT 1 FROM booking_lead_holds h
            WHERE h.room_id = r.id AND h.hold_status IN ('active', 'committed')
          ) OR EXISTS (
            SELECT 1 FROM occupancies o WHERE o.room_id = r.id AND o.property_id <> r.property_id
          ) OR EXISTS (
            SELECT 1 FROM leases l WHERE l.room_id = r.id AND l.property_id <> r.property_id
          ) OR EXISTS (
            SELECT 1 FROM booking_lead_holds h WHERE h.room_id = r.id AND h.property_id <> r.property_id
          )`,
  },
  {
    check: 'occupancy.active_lease_link',
    cleanOutcome: 'matched',
    findingOutcome: 'legacy_compatible',
    expectedFindingCount: 8,
    unexpectedOutcome: 'blocking',
    sql: `SELECT count(*)::int AS count FROM occupancies o
          WHERE o.occupancy_status = 'active' AND NOT EXISTS (
            SELECT 1 FROM leases l
            WHERE l.occupancy_id = o.id AND l.lease_status = 'active'
              AND l.property_id = o.property_id
              AND l.room_id = o.room_id
              AND l.resident_id = o.resident_id
          )`,
  },
  {
    check: 'resident.user_role',
    cleanOutcome: 'matched',
    findingOutcome: 'unresolved',
    sql: `SELECT count(*)::int AS count FROM residents r
          WHERE r.resident_status = 'active' AND (
            r.user_id IS NULL OR NOT EXISTS (
              SELECT 1 FROM user_property_roles ur JOIN roles role ON role.id = ur.role_id
              WHERE ur.user_id = r.user_id AND role.code = 'resident'
                AND ur.revoked_at IS NULL AND ur.property_id = r.property_id
            )
          )`,
  },
  {
    check: 'invoice.line_total',
    cleanOutcome: 'matched',
    findingOutcome: 'blocking',
    sql: `SELECT count(*)::int AS count FROM invoices i
          LEFT JOIN LATERAL (
            SELECT COALESCE(sum(li.total_amount), 0)::bigint AS total
            FROM invoice_line_items li WHERE li.invoice_id = i.id
          ) lines ON true
          WHERE i.total_amount <> lines.total + i.late_fee_amount`,
  },
  {
    check: 'invoice.verified_allocations',
    cleanOutcome: 'matched',
    findingOutcome: 'unresolved',
    sql: `SELECT count(*)::int AS count FROM invoices i
          LEFT JOIN LATERAL (
            SELECT COALESCE(sum(pa.allocated_amount), 0)::bigint AS total
            FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
            WHERE pa.invoice_id = i.id AND pa.allocation_status = 'active'
              AND p.payment_status = 'verified'
          ) allocations ON true
          WHERE (i.invoice_status = 'paid' AND allocations.total <> i.total_amount)
             OR (i.invoice_status = 'partially_paid' AND (allocations.total <= 0 OR allocations.total >= i.total_amount))
             OR EXISTS (
               SELECT 1 FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
               WHERE pa.invoice_id = i.id AND pa.allocation_status = 'active'
                 AND (p.property_id <> i.property_id OR p.resident_id IS DISTINCT FROM i.resident_id)
             )`,
  },
  {
    check: 'payment.allocation_total',
    cleanOutcome: 'matched',
    findingOutcome: 'unresolved',
    sql: `SELECT count(*)::int AS count FROM payments p
          LEFT JOIN LATERAL (
            SELECT COALESCE(sum(pa.allocated_amount), 0)::bigint AS total
            FROM payment_allocations pa
            WHERE pa.payment_id = p.id AND pa.allocation_status = 'active'
          ) allocations ON true
          WHERE (p.payment_status = 'verified' AND allocations.total <> p.amount)
             OR EXISTS (
               SELECT 1 FROM payment_allocations pa JOIN invoices i ON i.id = pa.invoice_id
               WHERE pa.payment_id = p.id AND pa.allocation_status = 'active'
                 AND pa.target_type = 'invoice'
                 AND (i.property_id <> p.property_id OR i.resident_id IS DISTINCT FROM p.resident_id)
             )`,
  },
  {
    check: 'lease.deposit_aggregate',
    cleanOutcome: 'matched',
    findingOutcome: 'blocking',
    sql: `SELECT count(*)::int AS count FROM leases l
          LEFT JOIN LATERAL (
            SELECT
              COALESCE(sum(t.amount) FILTER (WHERE t.transaction_type IN ('collection','top_up')), 0)::bigint AS collected,
              COALESCE(sum(t.amount) FILTER (WHERE t.transaction_type = 'deduction'), 0)::bigint AS deducted,
              COALESCE(sum(t.amount) FILTER (WHERE t.transaction_type = 'refund'), 0)::bigint AS refunded
            FROM lease_deposit_transactions t
            WHERE t.lease_id = l.id AND t.settlement_status = 'settled'
          ) ledger ON true
          WHERE l.deposit_collected_amount <> ledger.collected
             OR l.deposit_deduction_amount <> ledger.deducted
             OR l.deposit_refunded_amount <> ledger.refunded
             OR EXISTS (
               SELECT 1 FROM lease_deposit_transactions t
               LEFT JOIN payments p ON p.id = t.payment_id
               WHERE t.lease_id = l.id AND (
                 t.property_id <> l.property_id
                 OR (t.payment_id IS NOT NULL AND (
                   p.property_id <> l.property_id OR p.resident_id IS DISTINCT FROM l.resident_id
                 ))
               )
             )`,
  },
  {
    check: 'category.exactly_two',
    cleanOutcome: 'matched',
    findingOutcome: 'blocking',
    sql: `SELECT count(*)::int AS count FROM (
            SELECT property_id
            FROM kost_types
            WHERE deleted_at IS NULL
            GROUP BY property_id
            HAVING count(*) <> 2
               OR count(*) FILTER (WHERE category = 'rukost') <> 1
               OR count(*) FILTER (WHERE category = 'apartkost') <> 1
          ) finding`,
  },
  {
    check: 'category.facility_authority',
    cleanOutcome: 'matched',
    findingOutcome: 'blocking',
    sql: `SELECT count(*)::int AS count
          FROM kost_type_content_facilities facility
          LEFT JOIN kost_types type ON type.id = facility.kost_type_id
          WHERE type.id IS NULL
             OR type.property_id <> facility.property_id
             OR facility.normalized_label <> lower(btrim(facility.label))
             OR EXISTS (
               SELECT 1
               FROM kost_type_content_facilities duplicate
               WHERE duplicate.kost_type_id = facility.kost_type_id
                 AND duplicate.normalized_label = facility.normalized_label
                 AND duplicate.archived_at IS NULL
                 AND facility.archived_at IS NULL
                 AND duplicate.id <> facility.id
             )`,
  },
  {
    check: 'category.gallery_authority',
    cleanOutcome: 'matched',
    findingOutcome: 'blocking',
    sql: `SELECT count(*)::int AS count
          FROM hunian_gallery_images image
          LEFT JOIN kost_types type ON type.id = image.kost_type_id
          WHERE image.deleted_at IS NULL AND (
            (image.target_type = 'common_area' AND image.content_state <> 'archived')
            OR (image.target_type = 'kost_type' AND (
              type.id IS NULL OR type.property_id <> image.property_id
              OR (image.content_state = 'draft' AND image.public_derivative_file_id IS NULL)
            ))
            OR (
              image.target_type = 'kost_type' AND image.content_state = 'draft'
              AND image.is_cover = true
              AND EXISTS (
                SELECT 1 FROM hunian_gallery_images duplicate
                WHERE duplicate.property_id = image.property_id
                  AND duplicate.kost_type_id = image.kost_type_id
                  AND duplicate.content_state = 'draft'
                  AND duplicate.deleted_at IS NULL
                  AND duplicate.is_cover = true
                  AND duplicate.id <> image.id
              )
            )
          )`,
  },
  {
    check: 'category.publication_authority',
    cleanOutcome: 'matched',
    findingOutcome: 'blocking',
    sql: `SELECT count(*)::int AS count FROM (
            SELECT kost_type_id, content_type, effective_date
            FROM kost_type_content_versions
            WHERE publication_status = 'published'
            GROUP BY kost_type_id, content_type, effective_date
            HAVING count(*) <> 1
          ) finding`,
  },
  {
    check: 'property.policy_publication_authority',
    cleanOutcome: 'matched',
    findingOutcome: 'blocking',
    sql: `SELECT count(*)::int AS count FROM (
            SELECT property_id, document_type, effective_date
            FROM property_policy_documents
            WHERE publication_status = 'published'
            GROUP BY property_id, document_type, effective_date
            HAVING count(*) <> 1
          ) finding`,
  },
  {
    check: 'building.ownership_authority',
    cleanOutcome: 'not_yet_representable',
    findingOutcome: 'not_yet_representable',
    expectedFindingCount: 26,
    unexpectedOutcome: 'blocking',
    sql: `SELECT count(*)::int AS count FROM room_buildings`,
  },
] as const;

export async function reconcileKmoDomain(
  client: Pick<PoolClient, 'query'>,
): Promise<ReconciliationResult[]> {
  const results: ReconciliationResult[] = [];
  for (const definition of RECONCILIATION_CHECKS) {
    const query = await client.query<{ count: number }>(definition.sql);
    const count = Number(query.rows[0]?.count ?? 0);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid reconciliation count');
    const outcome =
      count === 0
        ? definition.cleanOutcome
        : definition.expectedFindingCount === undefined || count === definition.expectedFindingCount
          ? definition.findingOutcome
          : (definition.unexpectedOutcome ?? definition.findingOutcome);
    results.push({
      check: definition.check,
      outcome,
      count,
    });
  }
  return results;
}

export async function main(): Promise<void> {
  loadEnv({
    path: resolve(__dirname, '../../../../.env'),
  });
  const pool = new Pool(explicitDatabaseConfigFromEnv());
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const results = await reconcileKmoDomain(client);
    await client.query('ROLLBACK');
    process.stdout.write(
      `${JSON.stringify({ schema_version: 1, gate: 'kmo-domain-reconciliation', results })}\n`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  void main().catch(() => {
    process.stderr.write(
      `${JSON.stringify({ schema_version: 1, gate: 'kmo-domain-reconciliation', status: 'failed' })}\n`,
    );
    process.exitCode = 1;
  });
}
