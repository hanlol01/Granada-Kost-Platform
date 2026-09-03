import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { W06BillingService } from '../../src/modules/billing/services/w06-billing.service';

const migrationPath = new URL(
  '../../src/infrastructure/database/migrations/058_formal_billing_document_numbers.sql',
  import.meta.url,
);
const manifestPath = new URL(
  '../../src/infrastructure/database/scripts/migration-manifest.ts',
  import.meta.url,
);
const contractPaidMigrationPath = new URL(
  '../../src/infrastructure/database/migrations/061_contract_paid_official_document.sql',
  import.meta.url,
);

void test('formal document migration is canonical and covers every issuance family', async () => {
  const [migration, manifest] = await Promise.all([
    readFile(migrationPath, 'utf8'),
    readFile(manifestPath, 'utf8'),
  ]);
  const checksum = createHash('sha256')
    .update(await readFile(migrationPath))
    .digest('hex');

  assert.match(migration, /next_billing_document_number/);
  assert.match(migration, /INV-%s-%s\/%s\/%s\/%s/);
  for (const segment of [
    'SEWA-KOST',
    'TAGIHAN-LAIN',
    'BIAYA-BOOKING',
    'DP-KOST',
    'PELUNASAN-SEWA',
    'DEPOSIT-JAMINAN',
    'PEMBATALAN-REFUND',
    'REFUND-MINAT-BOOKING',
    'BAST-KELUAR',
    'RINCIAN-AKHIR',
    'REFUND-KELUAR',
  ])
    assert.ok(migration.includes(`'${segment}'`), `missing formal segment ${segment}`);
  assert.match(migration, /receipt_final_settlement' THEN 'receipt_full_settlement'/);
  assert.match(migration, /trg_invoices_formal_number/);
  assert.match(migration, /RCT-BKG-/);
  assert.match(migration, /RCT-CNL-/);
  assert.ok(manifest.includes("version: '058_formal_billing_document_numbers.sql'"));
  assert.ok(manifest.includes(`checksumSha256: '${checksum}'`));
});

void test('global document search is property-scoped and maps monetary values', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const database = {
    client: {
      query: async (sql: string, values: unknown[]) => {
        calls.push({ sql, values });
        return {
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              document_type: 'invoice',
              document_code: 'INV-001-09/SEWA-KOST/GSH1/2026',
              title: 'Invoice tagihan sewa kost',
              resident_name: 'Farhan',
              room_number: 'RK-03-01',
              issued_at: new Date('2026-09-02T01:00:00.000Z'),
              amount: '1800000',
              status: 'issued',
              booking_lead_id: null,
              lease_id: '22222222-2222-4222-8222-222222222222',
              checkout_command_id: null,
              total: '1',
            },
          ],
        };
      },
    },
  };
  const propertyChecks: string[] = [];
  const properties = {
    assertCanReadProperty: async (_user: unknown, propertyId: string) => {
      propertyChecks.push(propertyId);
    },
  };
  const service = new W06BillingService(database as never, properties as never, {} as never);

  const result = await service.searchDocuments({} as never, {
    property_id: '20000000-0000-4000-8000-000000000001',
    q: 'INV00109',
    limit: 20,
    offset: 0,
  });

  assert.deepEqual(propertyChecks, ['20000000-0000-4000-8000-000000000001']);
  assert.deepEqual(calls[0]?.values, ['20000000-0000-4000-8000-000000000001', 'INV00109', 20, 0]);
  assert.match(calls[0]?.sql ?? '', /FROM invoices/);
  assert.match(calls[0]?.sql ?? '', /FROM payment_receipts/);
  assert.match(calls[0]?.sql ?? '', /FROM booking_lead_payment_commitments/);
  assert.match(calls[0]?.sql ?? '', /FROM booking_lead_payment_commitment_refunds/);
  assert.match(calls[0]?.sql ?? '', /FROM lease_contract_paid_documents/);
  assert.match(calls[0]?.sql ?? '', /FROM lease_exit_documents/);
  assert.equal(result.data[0]?.amount, 1_800_000);
  assert.equal(result.meta.total, 1);
});

void test('contract-paid proof has formal numbering, immutable snapshot, and reversal invalidation', async () => {
  const [migration, manifest] = await Promise.all([
    readFile(contractPaidMigrationPath, 'utf8'),
    readFile(manifestPath, 'utf8'),
  ]);
  const checksum = createHash('sha256')
    .update(await readFile(contractPaidMigrationPath))
    .digest('hex');

  assert.match(migration, /'contract_paid_confirmation'/);
  assert.match(migration, /'KONTRAK-LUNAS'/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS lease_contract_paid_documents/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION issue_contract_paid_document/);
  assert.match(migration, /CONTRACT_PAID_DOCUMENT_IMMUTABLE/);
  assert.match(migration, /invalidated_by_reversal_id/);
  assert.ok(manifest.includes("version: '061_contract_paid_official_document.sql'"));
  assert.ok(manifest.includes(`checksumSha256: '${checksum}'`));
});
