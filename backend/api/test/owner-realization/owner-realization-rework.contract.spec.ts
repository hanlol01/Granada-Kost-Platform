import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function source(...segments: string[]): string {
  return readFileSync(resolve(HERE, '../../src', ...segments), 'utf8');
}

function between(content: string, startText: string, endText: string): string {
  const start = content.indexOf(startText);
  const end = content.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, `Expected ${startText} before ${endText}.`);
  return content.slice(start, end);
}

test('Owner Realization schema preserves snapshots, lease locks, recovery disposition, and transfer uniqueness', () => {
  const schema = source('infrastructure/database/migrations/101_owner_realization_rework.sql');
  const recovery = source(
    'infrastructure/database/migrations/102_owner_realization_recovery_disposition.sql',
  );
  const transferGuard = source(
    'infrastructure/database/migrations/103_owner_realization_transfer_reference_guard.sql',
  );
  const manifest = source('infrastructure/database/scripts/migration-manifest.ts');

  assert.match(schema, /CREATE TABLE IF NOT EXISTS property_owner_realizations/);
  assert.match(schema, /owner_snapshot JSONB NOT NULL/);
  assert.match(schema, /scope_snapshot JSONB NOT NULL/);
  assert.match(schema, /tariff_snapshot JSONB NOT NULL/);
  assert.match(schema, /property_owner_realization_lease_locks/);
  assert.match(schema, /uq_property_owner_realization_active_lease_lock/);
  assert.match(schema, /next_owner_realization_receipt_number/);
  assert.match(schema, /property_owner\.realization\.manage/);
  assert.match(recovery, /recovery_disposition/);
  assert.match(recovery, /net_against_future_realization/);
  assert.match(transferGuard, /uq_owner_realization_transfer_reference/);
  assert.match(transferGuard, /transfer_status = 'succeeded'/);
  assert.match(manifest, /101_owner_realization_rework\.sql/);
  assert.match(manifest, /102_owner_realization_recovery_disposition\.sql/);
  assert.match(manifest, /103_owner_realization_transfer_reference_guard\.sql/);
});

test('eligibility accepts only fully verified normal rent and transactionally excludes locked leases', () => {
  const service = source('modules/property-owner-management/property-owner-realization.service.ts');
  const candidates = between(
    service,
    'private async eligibleCandidates',
    'private async notEligibleRows',
  );

  assert.match(candidates, /lease\.commercial_mode='rent'/);
  assert.match(candidates, /lease\.contract_rent_amount>0/);
  assert.match(candidates, /ledger\.verified_rent_credit>=lease\.contract_rent_amount/);
  assert.match(candidates, /ledger\.paid_in_full_at IS NOT NULL/);
  assert.match(candidates, /payment\.payment_status='verified'/);
  assert.match(candidates, /invoice\.invoice_purpose='rent'/);
  assert.match(candidates, /LEFT JOIN property_owner_realization_lease_locks lock/);
  assert.match(candidates, /WHERE lock\.id IS NULL/);
  assert.match(candidates, /lease\.snapshot_monthly_price/);
  assert.match(candidates, /monthly_management_fee/);
  assert.doesNotMatch(candidates, /security_deposit/);
});

test('realization queues use stable registration order and hide archived Owners by default', () => {
  const service = source('modules/property-owner-management/property-owner-realization.service.ts');
  const dto = source('modules/property-owner-management/dto/property-owner-management.dto.ts');
  const list = between(service, 'async list(actor', 'async listNotEligible');

  assert.match(dto, /owner_profile_status\?: 'active' \| 'archived' \| 'all'/);
  assert.match(list, /const ownerProfileStatus = query\.owner_profile_status \?\? 'active'/);
  assert.match(list, /profile_status=\$2/);
  assert.match(list, /ORDER BY created_at,id/);
  assert.match(list, /owner_asset_summary/);
  assert.match(list, /plot_number: null/);
  assert.doesNotMatch(list, /ORDER BY full_name/);
});

test('realization queue groups eligible rooms by asset and loads in-progress/history rooms from snapshots', () => {
  const service = source('modules/property-owner-management/property-owner-realization.service.ts');
  const list = between(service, 'async list(actor', 'async listNotEligible');
  const candidates = between(
    service,
    'private async eligibleCandidates',
    'private async notEligibleRows',
  );
  const historicalQueue = between(service, 'const realizationIds = page', 'const pageWithAssets');
  const historicalInput = between(service, 'async createHistorical', 'async export(');

  assert.match(list, /assetsByOwner/);
  assert.match(list, /assets: ownerAssets/);
  assert.match(list, /realization_id=ANY\(\$1::uuid\[\]\)/);
  assert.match(candidates, /COALESCE\(room\.building_id,room\.id\)::text AS asset_id/);
  assert.match(candidates, /lease\.commercial_mode='rent'/);
  assert.match(candidates, /ledger\.verified_rent_credit>=lease\.contract_rent_amount/);
  assert.match(historicalQueue, /FROM property_owner_realization_lines/);
  assert.match(historicalQueue, /building_name_snapshot/);
  assert.match(historicalQueue, /snapshot/);
  assert.doesNotMatch(historicalQueue, /JOIN rooms/);
  assert.match(historicalInput, /building_name_snapshot/);
  assert.match(historicalInput, /asset_id: assetSnapshot\?\.asset_id/);
});

test('transfer, correction, and historical import preserve a typed audit trail instead of allowing silent duplication', () => {
  const service = source('modules/property-owner-management/property-owner-realization.service.ts');
  const correction = between(service, 'async addCorrection', 'async recordTransfer');
  const transfer = between(service, 'async recordTransfer', 'async createHistorical');
  const historical = between(service, 'async createHistorical', 'async export(');

  assert.match(correction, /transfer_recovery/);
  assert.match(correction, /recovery_disposition/);
  assert.match(correction, /amount >= 0/);
  assert.match(transfer, /pg_advisory_xact_lock/);
  assert.match(transfer, /OWNER_REALIZATION_TRANSFER_REFERENCE_DUPLICATE/);
  assert.match(transfer, /OWNER_REALIZATION_TRANSFER_EXCEEDS_REMAINING/);
  assert.match(transfer, /next_owner_realization_receipt_number/);
  assert.match(historical, /allowArchived: true/);
  assert.match(historical, /historical_unlinked/);
  assert.match(historical, /OWNER_REALIZATION_HISTORICAL_LEASE_ALREADY_ALLOCATED/);
  assert.match(historical, /property_owner_realization_lease_locks/);
  assert.match(historical, /pg_advisory_xact_lock/);
  assert.match(historical, /transfer_evidence_reference/);
});

test('Owner realization endpoint is Admin-only and the Owner portal is explicit-publication scoped', () => {
  const controller = source(
    'modules/property-owner-management/property-owner-realization.controller.ts',
  );
  const portal = source('modules/property-owner-management/property-owner-realization.service.ts');
  const ownerPublished = between(portal, 'async listPublishedForOwner', 'async ownerReceipt');
  const ownerReceipt = between(portal, 'async ownerReceipt', 'private async transition');

  assert.match(controller, /@RequireRoles\('admin'\)/);
  assert.doesNotMatch(controller, /@RequireRoles\('manager', 'admin'\)/);
  assert.match(ownerPublished, /owner\.user_id=\$1/);
  assert.match(ownerPublished, /realization\.realization_status='published_to_owner'/);
  assert.match(ownerReceipt, /owner\.user_id=\$1/);
  assert.match(ownerReceipt, /OWNER_REALIZATION_DOCUMENT_SCOPE_DENIED/);
});

test('erroneous draft cancellation is audited, releases lease locks, and frees its Owner-period slot', () => {
  const migration = source(
    'infrastructure/database/migrations/104_owner_realization_voided_period_replacement.sql',
  );
  const manifest = source('infrastructure/database/scripts/migration-manifest.ts');
  const service = source('modules/property-owner-management/property-owner-realization.service.ts');
  const controller = source(
    'modules/property-owner-management/property-owner-realization.controller.ts',
  );
  const dto = source('modules/property-owner-management/dto/property-owner-management.dto.ts');
  const historical = between(service, 'async createHistorical', 'async export(');
  const prepare = between(service, 'async prepare', 'async submitForReview');
  const cancel = between(service, 'async voidDraft', 'async approve');

  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS property_owner_realizations_owner_period_unique/,
  );
  assert.match(migration, /WHERE realization_status <> 'void'/);
  assert.match(manifest, /104_owner_realization_voided_period_replacement\.sql/);
  assert.match(dto, /class VoidOwnerRealizationDraftDto/);
  assert.match(controller, /@Post\(':realizationId\/void-draft'\)/);
  assert.match(cancel, /realization\.realization_status !== 'draft'/);
  assert.match(cancel, /property_owner_realization_transfers/);
  assert.match(cancel, /lock_status='released'/);
  assert.match(cancel, /realization_status='void'/);
  assert.match(cancel, /property_owner\.realization\.voided/);
  assert.doesNotMatch(prepare, /OWNER_REALIZATION_ALREADY_PREPARED/);
  assert.doesNotMatch(historical, /OWNER_REALIZATION_ALREADY_PREPARED/);
});

test('one Owner may have multiple non-void batches in one period while each lease remains locked once', () => {
  const migration = source(
    'infrastructure/database/migrations/105_owner_realization_multiple_batches.sql',
  );
  const manifest = source('infrastructure/database/scripts/migration-manifest.ts');
  const service = source('modules/property-owner-management/property-owner-realization.service.ts');
  const dto = source('modules/property-owner-management/dto/property-owner-management.dto.ts');
  const list = between(service, 'async list(actor', 'async listNotEligible');
  const prepare = between(service, 'async prepare', 'async submitForReview');
  const historical = between(service, 'async createHistorical', 'async export(');

  assert.match(
    migration,
    /DROP INDEX IF EXISTS uq_property_owner_realization_non_void_owner_period/,
  );
  assert.match(migration, /idx_property_owner_realization_batches/);
  assert.match(manifest, /105_owner_realization_multiple_batches\.sql/);
  assert.match(dto, /selected_lease_ids\?: string\[\]/);
  assert.match(prepare, /selectedLeaseIds/);
  assert.match(prepare, /OWNER_REALIZATION_SELECTION_STALE/);
  assert.match(prepare, /property_owner_realization_lease_locks/);
  assert.doesNotMatch(prepare, /OWNER_REALIZATION_ALREADY_PREPARED/);
  assert.doesNotMatch(historical, /OWNER_REALIZATION_ALREADY_PREPARED/);
  assert.match(list, /realizationsByOwner/);
  assert.match(list, /historyRows/);
});

test('wide realization exports use a paginated landscape table rather than flattening every cell into one line', () => {
  const exporter = source('modules/report/report-export.util.ts');
  const reportPdf = between(exporter, 'export async function reportToPdf', '/**\n * A dedicated');
  const receiptPdf = exporter.slice(
    exporter.indexOf('export async function ownerRealizationReceiptToPdf'),
  );

  assert.match(reportPdf, /const pageWidth = 1190/);
  assert.match(reportPdf, /const pageHeight = 842/);
  assert.match(reportPdf, /renderHeader\(\)/);
  assert.match(reportPdf, /section\('Rincian \(lanjutan\)'\)/);
  assert.match(reportPdf, /displayValue/);
  assert.match(receiptPdf, /KUITANSI/);
  assert.match(receiptPdf, /KWT-RLS|receiptNumber/);
  assert.match(receiptPdf, /ownerSignatureLines/);
  assert.match(receiptPdf, /renderHeader\(\)/);
});
