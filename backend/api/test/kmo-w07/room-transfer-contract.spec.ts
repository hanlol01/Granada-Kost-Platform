import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';
import { LeaseTransferScheduler } from '../../src/modules/lease/lease-transfer.scheduler';
import { LeaseTransferService } from '../../src/modules/lease/lease-transfer.service';

const root = resolve(__dirname, '../..');

async function source(path: string): Promise<string> {
  return readFile(resolve(root, path), 'utf8');
}

test('W07B wiring exports the transfer service and scheduler', () => {
  assert.equal(typeof LeaseTransferService, 'function');
  assert.equal(typeof LeaseTransferScheduler, 'function');
});

test('W07B migration adds inspection_required without lifecycle backfills', async () => {
  const migration = await source(
    'src/infrastructure/database/migrations/038_room_transfer_w07b.sql',
  );
  assert.match(migration, /'inspection_required'/);
  assert.match(migration, /ADD CONSTRAINT rooms_status_check/);
  // Legacy rows are only annotated, never financially rewritten.
  assert.match(migration, /WHERE transfer_path IS NULL/);
  assert.match(migration, /legacy M6 same-day transfer/);
  assert.doesNotMatch(migration, /UPDATE\s+leases/i);
  assert.doesNotMatch(migration, /UPDATE\s+occupancies/i);
  assert.doesNotMatch(migration, /UPDATE\s+invoices/i);
  assert.doesNotMatch(migration, /UPDATE\s+lease_deposit_transactions/i);
  assert.doesNotMatch(migration, /property_owner_earnings/i);
});

test('W07B migration registers the scheduled command state machine', async () => {
  const migration = await source(
    'src/infrastructure/database/migrations/038_room_transfer_w07b.sql',
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS lease_transfer_commands/);
  assert.match(migration, /state IN \('scheduled', 'executed', 'cancelled', 'failed'\)/);
  assert.match(migration, /transfer_path IN \('end_period', 'same_day_exception'\)/);
  assert.match(
    migration,
    /reason_code IN \(\s*'resident_request', 'room_issue', 'property_operation',\s*'eligibility_correction', 'commercial_adjustment', 'other'\s*\)/,
  );
  assert.match(migration, /reason_code <> 'other' OR reason_detail IS NOT NULL/);
  assert.match(migration, /transfer_path <> 'same_day_exception' OR exception_reason IS NOT NULL/);
  assert.match(migration, /state <> 'cancelled' OR cancel_reason IS NOT NULL/);
  assert.match(migration, /state <> 'failed' OR failure_code IS NOT NULL/);
  assert.match(
    migration,
    /state <> 'executed' OR \(executed_at IS NOT NULL AND transfer_record_id IS NOT NULL\)/,
  );
  // Single-winner concurrency guards for scheduled commands.
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_transfer_commands_scheduled_lease[\s\S]*?WHERE state = 'scheduled'/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_transfer_commands_scheduled_room[\s\S]*?WHERE state = 'scheduled'/,
  );
});

test('W07B migration extends lease history vocabulary and transfer revocation reasons', async () => {
  const migration = await source(
    'src/infrastructure/database/migrations/038_room_transfer_w07b.sql',
  );
  assert.match(migration, /'transfer_scheduled', 'transfer_cancelled', 'transfer_failed'/);
  assert.match(
    migration,
    /revoke_reason IN \('checkout', 'restriction', 'manual_admin', 'security_incident', 'expired', 'transfer'\)/,
  );
});

test('W07B migration is registered in the manifest with sentinels', () => {
  const entry = MIGRATION_MANIFEST.find((item) => item.version === '038_room_transfer_w07b.sql');
  assert.ok(entry, 'migration 038 must be registered');
  assert.ok(entry.checksumSha256.length === 64);
  assert.ok(entry.sentinels.some((sentinel) => sentinel.includes('lease_transfer_commands')));
  assert.ok(entry.sentinels.some((sentinel) => sentinel.includes('inspection_required')));
});

test('W07B transfer mutations are Admin-only with lease.manage (decision 3)', async () => {
  const controller = await source('src/modules/lease/lease.controller.ts');
  for (const route of [
    "@Post(':leaseId/transfer/preview')",
    "@Post(':leaseId/transfer')",
    "@Post(':leaseId/transfer/schedule')",
    "@Get(':leaseId/transfers')",
    "@Post(':leaseId/transfers/:commandId/cancel')",
  ]) {
    const region = controller.slice(controller.indexOf(route));
    assert.notEqual(region.length, 0, `route ${route} must exist`);
    assert.match(region.slice(0, 260), /@RequireRoles\('admin'\)/, `${route} must be admin-only`);
    assert.match(
      region.slice(0, 260),
      /@RequirePermissions\('lease.manage'\)/,
      `${route} must require lease.manage`,
    );
  }
});

test('W07B DTOs enforce the fixed reason taxonomy and same-day exception reason (decision 4)', async () => {
  const dto = await source('src/modules/lease/lease.dto.ts');
  assert.match(
    dto,
    /TRANSFER_REASON_CODES = \[\s*'resident_request',\s*'room_issue',\s*'property_operation',\s*'eligibility_correction',\s*'commercial_adjustment',\s*'other',\s*\]/,
  );
  assert.match(
    dto,
    /@ValidateIf\(\(dto: TransferReasonFieldsDto\) => dto\.reason_code === 'other'\)/,
  );
  assert.match(
    dto,
    /export class TransferLeaseDto extends TransferReasonFieldsDto[\s\S]*?exception_reason!: string/,
  );
  assert.match(dto, /export class ScheduleTransferLeaseDto extends TransferReasonFieldsDto/);
  const scheduleRegion = dto.slice(
    dto.indexOf('export class ScheduleTransferLeaseDto'),
    dto.indexOf('export class TransferLeaseDto'),
  );
  assert.doesNotMatch(scheduleRegion, /top_up\?/);
  assert.match(dto, /export class CancelScheduledTransferDto[\s\S]*?reason!: string/);
});

test('W07B splits scheduled boundary execution from the same-day exception path (decision 2)', async () => {
  const transfer = await source('src/modules/lease/lease-transfer.service.ts');
  // Same-day path stays effective-today only.
  assert.match(transfer, /assertSameDayExceptionDate\(dto\.effective_date, today\)/);
  // Normal path validates strictly future billing boundaries.
  assert.match(transfer, /assertFutureBoundaryDate\(dto\.effective_date, today, source\)/);
  assert.match(transfer, /TRANSFER_EFFECTIVE_DATE_MUST_BE_FUTURE/);
  assert.match(transfer, /TRANSFER_EFFECTIVE_DATE_NOT_BOUNDARY/);
  assert.match(transfer, /BOUNDARY_SEARCH_HORIZON/);
  // Scheduling never mutates lifecycle state in the same transaction.
  const scheduleRegion = transfer.slice(
    transfer.indexOf('async schedule('),
    transfer.indexOf('async cancelScheduledTransfer('),
  );
  assert.doesNotMatch(scheduleRegion, /UPDATE\s+rooms/i);
  assert.doesNotMatch(scheduleRegion, /UPDATE\s+leases/i);
  assert.doesNotMatch(scheduleRegion, /UPDATE\s+occupancies/i);
  assert.doesNotMatch(scheduleRegion, /INSERT INTO leases/i);
  assert.match(scheduleRegion, /INSERT INTO lease_transfer_commands/);
  assert.match(scheduleRegion, /'transfer_scheduled'/);
});

test('W07B cutover sends the old room to inspection_required and revokes old-room grants (decisions 5-6)', async () => {
  const transfer = await source('src/modules/lease/lease-transfer.service.ts');
  assert.match(transfer, /CASE WHEN id = \$1 THEN 'inspection_required' ELSE 'occupied' END/);
  assert.doesNotMatch(transfer, /THEN 'vacant' ELSE 'occupied'/);
  assert.match(transfer, /revoke_reason = 'transfer'/);
  assert.match(
    transfer,
    /smart_lock_device_id IN \(SELECT id FROM smart_lock_devices WHERE room_id = \$2\)/,
  );
  assert.match(transfer, /smart_lock\.grants_revoked_for_transfer/);
  assert.match(transfer, /smart_lock\.grant_revoke/);
  // Gender eligibility mirrors W05 activation semantics.
  assert.match(transfer, /TRANSFER_TARGET_ROOM_GENDER_INCOMPATIBLE/);
  assert.match(transfer, /building_gender_policy/);
  // Audit trail markers for path and late execution.
  assert.match(transfer, /late_execution: input\.lateExecution/);
  assert.match(transfer, /transfer_path: input\.transferPath/);
});

test('W07B scheduler execution is gated by the process env gate plus property flags only (B3, revision 1)', async () => {
  const scheduler = await source('src/modules/lease/lease-transfer.scheduler.ts');
  assert.match(scheduler, /granada-lease-transfer-v1/);
  assert.match(scheduler, /pg_try_advisory_lock\(hashtext\(\$1\)\)/);
  assert.match(scheduler, /LEASE_TRANSFER_TEST_DATE_OVERRIDE_FORBIDDEN/);
  assert.match(scheduler, /transferSchedulerEnabledPropertyIds/);
  assert.match(scheduler, /executeScheduledTransfer\(commandId, runId\)/);
  // Activation depends only on the explicit process env gate; no environment
  // based block remains, and the per-property feature flag is enforced inside
  // runOnce and again inside every cutover transaction.
  assert.match(
    scheduler,
    /return this\.config\.get<boolean>\('lease\.transferSchedulerProcessEnabled'\) === true/,
  );
  assert.doesNotMatch(scheduler, /blocked outside disposable environments/);
  assert.doesNotMatch(scheduler, /environment === 'staging' \|\| environment === 'production'/);

  const configuration = await source('src/infrastructure/config/configuration.ts');
  assert.match(configuration, /LEASE_TRANSFER_SCHEDULER_PROCESS_ENABLED/);

  const transfer = await source('src/modules/lease/lease-transfer.service.ts');
  assert.match(transfer, /late = command\.effective_date < today/);
  assert.match(transfer, /executed_late/);
  // Failed is terminal and audited; it never silently retries.
  assert.match(transfer, /state = 'failed', failure_code = \$2/);
  assert.match(transfer, /lease\.transfer_failed/);
  assert.match(transfer, /WHERE id = \$1 AND state = 'scheduled'/);
  // Revision 5 + final correction: infrastructure/unknown errors stay scheduled
  // for retry while integrity conflicts (23505) become terminal via the shared
  // conflict translator, so a broken connection cannot produce a partial
  // transfer and a deterministic conflict cannot loop forever.
  assert.match(transfer, /classifyTerminalFailure/);
  assert.match(transfer, /translateKnownDatabaseConflict/);
  assert.match(transfer, /this\.rethrowKnownDatabaseConflict\(error\)/);
  assert.match(transfer, /sqlState\.startsWith\('23'\)/);
  assert.match(transfer, /TRANSFER_CONSTRAINT_CONFLICT/);
});

test('W07B top-up authority is admin-only with lease.manage and billing.manage (B1)', async () => {
  const transfer = await source('src/modules/lease/lease-transfer.service.ts');
  assert.match(transfer, /user\.roles\.includes\('admin'\)/);
  assert.match(transfer, /user\.permissions\.includes\('lease\.manage'\)/);
  assert.match(transfer, /user\.permissions\.includes\('billing\.manage'\)/);
  assert.match(
    transfer,
    /Only an admin with lease\.manage and billing\.manage may perform a W07B transfer deposit top-up/,
  );
  assert.doesNotMatch(
    transfer,
    /Only an owner or manager with billing\.manage may perform a financial transfer top-up/,
  );
});

test('W07B cancellation never touches lifecycle state', async () => {
  const transfer = await source('src/modules/lease/lease-transfer.service.ts');
  const cancelRegion = transfer.slice(
    transfer.indexOf('async cancelScheduledTransfer('),
    transfer.indexOf('async listTransferCommands('),
  );
  assert.match(cancelRegion, /state = 'cancelled'/);
  assert.match(cancelRegion, /cancel_reason/);
  assert.match(cancelRegion, /'transfer_cancelled'/);
  assert.doesNotMatch(cancelRegion, /UPDATE\s+rooms/i);
  assert.doesNotMatch(cancelRegion, /UPDATE\s+leases/i);
  assert.doesNotMatch(cancelRegion, /UPDATE\s+occupancies/i);
});

test('W07B closes direct status bypasses around inspection_required (decision 5)', async () => {
  const roomService = await source('src/modules/room/room.service.ts');
  assert.match(roomService, /ROOM_INSPECTION_LOCKED/);
  assert.match(roomService, /if \(before\.roomStatus === 'inspection_required'\)/);
  assert.match(roomService, /resolveRoomInspection/);
  assert.match(roomService, /ROOM_INSPECTION_NOT_PENDING/);
  assert.match(roomService, /outcome === 'pass' \? 'vacant' : 'maintenance'/);

  const roomController = await source('src/modules/room/room.controller.ts');
  assert.match(roomController, /@Post\(':roomId\/inspection-resolution'\)/);
  const region = roomController.slice(
    roomController.indexOf("@Post(':roomId/inspection-resolution')"),
  );
  assert.match(region.slice(0, 240), /@RequireRoles\('admin'\)/);
  assert.match(region.slice(0, 240), /@RequirePermissions\('room.manage'\)/);

  const v2Service = await source('src/modules/admin-ux-master/admin-ux-room-v2.service.ts');
  assert.match(v2Service, /ROOM_INSPECTION_LOCKED/);

  const dto = await source('src/modules/room/dto/update-room.dto.ts');
  assert.doesNotMatch(dto, /'inspection_required'/);

  const types = await source('src/modules/room/types/room.types.ts');
  assert.match(types, /\| 'inspection_required'/);
});

test('W07B read-side maps inspection_required into requires_review without owner writes (decision 7, B4)', async () => {
  const portal = await source(
    'src/modules/property-owner-management/property-owner-portal.service.ts',
  );
  assert.match(portal, /IN \('maintenance', 'requires_review', 'inspection_required'\)/);
  assert.match(
    portal,
    /CASE WHEN rooms\.room_status = 'inspection_required' THEN 'requires_review' ELSE rooms\.room_status END/,
  );
  // The portal stays read-only: no owner-finance mutation surfaces were added.
  assert.doesNotMatch(portal, /INSERT INTO property_owner_earnings/i);
  assert.doesNotMatch(portal, /INSERT INTO property_owner_payouts/i);

  const dashboard = await source('src/modules/dashboard/dashboard.repository.ts');
  assert.match(dashboard, /IN \('maintenance', 'requires_review', 'inspection_required'\)/);
});

test('W07B keeps predecessor-successor linkage on leases and room_transfer_records (decision 1)', async () => {
  const transfer = await source('src/modules/lease/lease-transfer.service.ts');
  assert.match(transfer, /transferred_from_lease_id/);
  assert.match(transfer, /INSERT INTO room_transfer_records/);
  assert.match(transfer, /transfer_command_id, transfer_path, reason_code/);
  assert.doesNotMatch(transfer, /lease_addenda/i);
  const migration = await source(
    'src/infrastructure/database/migrations/038_room_transfer_w07b.sql',
  );
  assert.doesNotMatch(migration, /lease_addenda/i);
});

test('W07B revision 2 preserves the contractual end date on the successor lease', async () => {
  const transfer = await source('src/modules/lease/lease-transfer.service.ts');
  // The original end date travels inside the scheduled commercial snapshot.
  const scheduleRegion = transfer.slice(
    transfer.indexOf('async schedule('),
    transfer.indexOf('async cancelScheduledTransfer('),
  );
  assert.match(scheduleRegion, /source_end_date: source\.end_date/);
  // Cutover validates the snapshotted end date again before mutating state.
  assert.match(transfer, /TRANSFER_SOURCE_END_DATE_CHANGED/);
  assert.match(transfer, /input\.expectedSourceEndDate !== source\.end_date/);
  // The successor INSERT carries the source contractual end date.
  const insertRegion = transfer.slice(
    transfer.indexOf('const targetLeaseResult'),
    transfer.indexOf('const transferRecordResult'),
  );
  assert.match(insertRegion, /start_date, end_date, billing_cycle/);
  assert.match(insertRegion, /\$7::date, \$8::date, \$9, \$10, \$11::date/);
  // Preview exposes the surviving contractual term.
  assert.match(transfer, /contractual_end_date: source\.end_date/);
  assert.match(transfer, /source_end_date: 'source_end_date' in snapshot/);
});

test('W07B revision 3 rejects scheduled transfers that would need a deposit top-up', async () => {
  const transfer = await source('src/modules/lease/lease-transfer.service.ts');
  const scheduleRegion = transfer.slice(
    transfer.indexOf('async schedule('),
    transfer.indexOf('async cancelScheduledTransfer('),
  );
  assert.match(scheduleRegion, /TRANSFER_SCHEDULE_TOP_UP_REQUIRED/);
  assert.match(scheduleRegion, /Scheduled transfers cannot collect a deposit top-up/);
  assert.match(scheduleRegion, /requiredTargetDeposit > carriedDeposit/);
  // Same-day cutover keeps the top-up guard as defense in depth.
  assert.match(transfer, /TRANSFER_DEPOSIT_TOP_UP_REQUIRED/);
  // Scheduling still never mutates lifecycle state.
  assert.doesNotMatch(scheduleRegion, /UPDATE\s+rooms/i);
  assert.doesNotMatch(scheduleRegion, /INSERT INTO leases/i);
});

test('W07B revision 4 makes inspection resolution idempotent, audited, and outbox-backed', async () => {
  const roomService = await source('src/modules/room/room.service.ts');
  assert.match(roomService, /IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(roomService, /IDEMPOTENCY_KEY_REUSED/);
  assert.match(roomService, /INSERT INTO idempotency_commands/);
  assert.match(roomService, /request_fingerprint/);
  assert.match(roomService, /ON CONFLICT \(actor_user_id, route, idempotency_key\) DO NOTHING/);
  assert.match(roomService, /UPDATE idempotency_commands/);
  assert.match(roomService, /room\.inspection_resolved/);
  assert.match(roomService, /room\.inspection_resolution/);

  const roomController = await source('src/modules/room/room.controller.ts');
  const region = roomController.slice(
    roomController.indexOf("@Post(':roomId/inspection-resolution')"),
  );
  assert.match(region, /idempotencyKeyFromRequest\(request\)/);
  assert.match(region, /Idempotency-Replayed/);
});
