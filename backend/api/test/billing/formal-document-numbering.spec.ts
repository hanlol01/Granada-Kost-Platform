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
const contractPaidActualDateMigrationPath = new URL(
  '../../src/infrastructure/database/migrations/065_contract_paid_actual_settlement_date.sql',
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

void test('contract-paid proof uses the actual final payment date for historical entry', async () => {
  const [migration, manifest] = await Promise.all([
    readFile(contractPaidActualDateMigrationPath, 'utf8'),
    readFile(manifestPath, 'utf8'),
  ]);
  const checksum = createHash('sha256')
    .update(await readFile(contractPaidActualDateMigrationPath))
    .digest('hex');

  assert.match(migration, /align_contract_paid_actual_settlement_date/);
  assert.match(migration, /SELECT payment\.paid_at/);
  assert.match(migration, /'\{settledAt\}'/);
  assert.match(migration, /trg_lease_contract_paid_documents_actual_settled_at/);
  assert.match(migration, /UPDATE lease_contract_paid_documents document/);
  assert.ok(manifest.includes("version: '065_contract_paid_actual_settlement_date.sql'"));
  assert.ok(manifest.includes(`checksumSha256: '${checksum}'`));
});

void test('contract-paid download renders the settling payment date instead of its issuance date', async () => {
  const queries: string[] = [];
  const database = {
    client: {
      query: (sql: string) => {
        queries.push(sql);
        return Promise.resolve({
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              document_code: '021-09/KONTRAK-LUNAS/GSH1/2026',
              issued_at: new Date('2026-09-05T08:10:00.000Z'),
              invalidated_at: null,
              invalidation_reason: null,
              settling_paid_at: new Date('2026-08-01T05:00:00.000Z'),
              safe_snapshot: {
                documentCode: '021-09/KONTRAK-LUNAS/GSH1/2026',
                residentName: 'Jokowi',
                roomNumber: 'RK-06-05',
                buildingCode: 'RK-06',
                leaseStart: '2026-08-01',
                leaseEnd: '2026-11-01',
                contractRentAmount: 5_400_000,
                initialRentCredit: 5_400_000,
                additionalRentPayments: 0,
                contractAdjustmentAmount: 0,
                totalRentReceived: 5_400_000,
                totalSettledAmount: 5_400_000,
                outstandingAmount: 0,
                settledAt: '2026-09-05T08:10:00.000Z',
                issuedAt: '2026-09-05T08:10:00.000Z',
                transactionCodes: ['TRX-20260801-000003-LUNAS'],
                propertyName: 'Granada Student House Jatinangor',
                propertyAddress:
                  'Jl. Kiara Beres, Desa Cipacing, Kec. Jatinangor, Kab. Sumedang 45363',
                issuedByName: 'Diki Karya Permana',
              },
            },
          ],
        });
      },
    },
  };
  const properties = { assertCanReadProperty: () => Promise.resolve() };
  const service = new W06BillingService(database as never, properties as never, {} as never);

  const result = await service.contractPaidDocument(
    {} as never,
    '20000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
  );
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const parsed = await getDocument({ data: new Uint8Array(result.content) }).promise;
  const content = await (await parsed.getPage(1)).getTextContent();
  const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');

  assert.match(queries[0] ?? '', /settling_payment\.paid_at AS settling_paid_at/);
  assert.match(text, /Kontrak dinyatakan lunas\s+:\s+1 Agustus 2026 pukul 12\.00/);
  assert.doesNotMatch(text, /Kontrak dinyatakan lunas\s+:\s+5 September 2026/);
});
