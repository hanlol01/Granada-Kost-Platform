import { Pool } from 'pg';
import {
  assertDisposableDatabaseConnection,
  disposableDatabasePoolConfig,
  disposableDatabaseTargetFromEnv,
  sanitizedDisposableTarget,
} from './admin-ux-m1/disposable-database';
import {
  defaultEvidencePath,
  safeErrorMessage,
  writeSanitizedEvidence,
} from './admin-ux-m1/sanitized-evidence';

type Check = {
  id: string;
  sql: string;
};

const checks: Check[] = [
  {
    id: 'room_category_building_mismatch',
    sql: `SELECT count(*)::int AS total
          FROM rooms r
          LEFT JOIN room_buildings b ON b.id = r.building_id
          WHERE r.room_status <> 'inactive'
            AND (
              r.category IS NULL
              OR r.category NOT IN ('rukost', 'apartkost')
              OR (r.building_id IS NOT NULL AND (b.id IS NULL OR b.property_id <> r.property_id OR b.category <> r.category))
            )`,
  },
  {
    id: 'non_uniform_commercial_facts',
    sql: `SELECT count(*)::int AS total
          FROM (
            SELECT r.property_id, r.category
            FROM rooms r
            WHERE r.room_status <> 'inactive' AND r.category IN ('rukost', 'apartkost')
            GROUP BY r.property_id, r.category
            HAVING count(DISTINCT r.monthly_price) > 1
                OR count(DISTINCT r.deposit_amount) > 1
                OR count(DISTINCT r.yearly_price) > 1
                OR (bool_or(r.yearly_price IS NULL) AND bool_or(r.yearly_price IS NOT NULL))
          ) inconsistent`,
  },
  {
    id: 'non_uniform_facility_sets',
    sql: `WITH room_sets AS (
            SELECT r.id, r.property_id, r.category,
                   coalesce(array_agg(a.facility_id ORDER BY a.facility_id) FILTER (WHERE a.facility_id IS NOT NULL), ARRAY[]::uuid[]) AS ids
            FROM rooms r
            LEFT JOIN room_facility_assignments a ON a.room_id = r.id
            WHERE r.room_status <> 'inactive' AND r.category IN ('rukost', 'apartkost')
            GROUP BY r.id, r.property_id, r.category
          )
          SELECT count(*)::int AS total
          FROM (
            SELECT property_id, category
            FROM room_sets
            GROUP BY property_id, category
            HAVING count(DISTINCT array_to_string(ids, ',')) > 1
          ) inconsistent`,
  },
  {
    id: 'active_occupancy_invariant',
    sql: `SELECT (
            (SELECT count(*)
             FROM occupancies o
             JOIN rooms r ON r.id = o.room_id
             JOIN residents resident ON resident.id = o.resident_id
             WHERE o.occupancy_status = 'active'
               AND (o.property_id <> r.property_id OR o.property_id <> resident.property_id OR r.room_status <> 'occupied'))
            +
            (SELECT count(*)
             FROM rooms r
             WHERE r.room_status = 'occupied'
               AND NOT EXISTS (
                 SELECT 1 FROM occupancies o WHERE o.room_id = r.id AND o.occupancy_status = 'active'
               ))
          )::int AS total`,
  },
  {
    id: 'noninactive_room_without_kost_type',
    sql: `SELECT count(*)::int AS total
          FROM rooms
          WHERE room_status <> 'inactive' AND kost_type_id IS NULL`,
  },
  {
    id: 'resident_file_property_or_purpose_mismatch',
    sql: `SELECT count(*)::int AS total
          FROM residents resident
          LEFT JOIN files ktp_file ON ktp_file.id = resident.ktp_file_id
          LEFT JOIN files profile_file ON profile_file.id = resident.profile_photo_file_id
          WHERE (resident.ktp_file_id IS NOT NULL AND (
                   ktp_file.id IS NULL OR ktp_file.is_deleted OR ktp_file.property_id <> resident.property_id OR ktp_file.file_purpose <> 'ktp'
                 ))
             OR (resident.profile_photo_file_id IS NOT NULL AND (
                   profile_file.id IS NULL OR profile_file.is_deleted OR profile_file.property_id <> resident.property_id
                   OR profile_file.file_purpose <> 'profile_photo'
                   OR profile_file.mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
                 ))`,
  },
  {
    id: 'legacy_gallery_target_mutated',
    sql: `SELECT count(*)::int AS total
          FROM hunian_gallery_images
          WHERE target_type IS NULL
            AND (catalog_slug IS NULL OR public_group_key IS NULL OR category IS NULL OR gender IS NULL)`,
  },
  {
    id: 'invalid_lease_read_grant',
    sql: `SELECT count(*)::int AS total
          FROM role_permissions role_permission
          JOIN permissions permission ON permission.id = role_permission.permission_id
          JOIN roles role ON role.id = role_permission.role_id
          WHERE permission.code = 'lease.read'
            AND role.code NOT IN ('owner', 'manager', 'admin')`,
  },
  {
    id: 'admin_billing_manage_grant',
    sql: `SELECT count(*)::int AS total
          FROM role_permissions role_permission
          JOIN permissions permission ON permission.id = role_permission.permission_id
          JOIN roles role ON role.id = role_permission.role_id
          WHERE permission.code = 'billing.manage' AND role.code = 'admin'`,
  },
];

async function main(): Promise<void> {
  const target = disposableDatabaseTargetFromEnv();
  const pool = new Pool(disposableDatabasePoolConfig(target));
  try {
    await assertDisposableDatabaseConnection(pool, target);
    const results: Array<{ id: string; violations: number }> = [];
    for (const check of checks) {
      const result = await pool.query<{ total: number }>(check.sql);
      const violations = Number(result.rows[0]?.total ?? 0);
      results.push({ id: check.id, violations });
    }
    const failed = results.filter((result) => result.violations !== 0);
    if (failed.length) {
      throw new Error(
        `M2 preflight invariants failed: ${failed.map((result) => result.id).join(', ')}`,
      );
    }
    const reportPath = await writeSanitizedEvidence(defaultEvidencePath('m2-preflight.json'), {
      gate: 'admin-ux-m2-preflight',
      passed: true,
      target: sanitizedDisposableTarget(target),
      checks: results,
    });
    console.log(
      JSON.stringify({ gate: 'admin-ux-m2-preflight', passed: true, report_path: reportPath }),
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(`Admin UX M2 preflight failed: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
