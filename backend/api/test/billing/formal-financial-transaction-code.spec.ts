import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { nextFinancialTransactionCode } from '../../src/modules/billing/helpers/financial-transaction-code.helper';

const migrationPath = new URL(
  '../../src/infrastructure/database/migrations/059_formal_financial_transaction_codes.sql',
  import.meta.url,
);
const manifestPath = new URL(
  '../../src/infrastructure/database/scripts/migration-manifest.ts',
  import.meta.url,
);
const sourcePath = (relativePath: string) => new URL(`../../src/${relativePath}`, import.meta.url);

void test('formal transaction migration uses daily TRX, REF, and BTL sequences', async () => {
  const [migration, manifest, migrationBytes] = await Promise.all([
    readFile(migrationPath, 'utf8'),
    readFile(manifestPath, 'utf8'),
    readFile(migrationPath),
  ]);
  const checksum = createHash('sha256').update(migrationBytes).digest('hex');

  assert.match(migration, /PRIMARY KEY \(code_family, sequence_date\)/);
  assert.match(migration, /'TRX', 'REF', 'BTL'/);
  assert.match(migration, /AT TIME ZONE 'Asia\/Jakarta'/);
  assert.match(migration, /'%s-%s-%s-%s'/);
  assert.match(migration, /to_char\(local_date, 'YYYYMMDD'\)/);
  assert.match(migration, /lpad\(next_value::text, 6, '0'\)/);
  for (const purpose of ['BOOKING', 'DP', 'SEWA', 'LUNAS', 'DEPOSIT', 'CHECKOUT', 'CANCEL']) {
    assert.ok(migration.includes(`'${purpose}'`), `missing transaction purpose ${purpose}`);
  }
  assert.ok(manifest.includes("version: '059_formal_financial_transaction_codes.sql'"));
  assert.ok(manifest.includes(`checksumSha256: '${checksum}'`));
});

void test('transaction-code helper delegates formatting and occurrence time to the database', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: async (sql: string, values: unknown[]) => {
      calls.push({ sql, values });
      return { rows: [{ code: 'TRX-20260902-000001-BOOKING' }] };
    },
  };
  const occurredAt = new Date('2026-09-01T17:30:00.000Z');

  const code = await nextFinancialTransactionCode(client as never, 'TRX', 'BOOKING', occurredAt);

  assert.equal(code, 'TRX-20260902-000001-BOOKING');
  assert.match(calls[0]?.sql ?? '', /next_financial_transaction_code/);
  assert.deepEqual(calls[0]?.values, ['TRX', 'BOOKING', occurredAt]);
});

void test('financial write paths use formal transaction families and keep legacy generators retired', async () => {
  const [booking, billing, lease, transfer, checkout, gateway, repository] = await Promise.all([
    readFile(sourcePath('modules/booking-lead/booking-lead-completion.service.ts'), 'utf8'),
    readFile(sourcePath('modules/billing/services/w06-billing.service.ts'), 'utf8'),
    readFile(sourcePath('modules/lease/lease.service.ts'), 'utf8'),
    readFile(sourcePath('modules/lease/lease-transfer.service.ts'), 'utf8'),
    readFile(sourcePath('modules/lease/lease-checkout.service.ts'), 'utf8'),
    readFile(sourcePath('modules/payment-gateway/payment-gateway.repository.ts'), 'utf8'),
    readFile(sourcePath('modules/billing/repositories/payment.repository.ts'), 'utf8'),
  ]);
  const productionSources = [booking, billing, lease, transfer, checkout, gateway, repository].join(
    '\n',
  );

  assert.match(booking, /WHEN 'booking_fee' THEN 'BOOKING'/);
  assert.match(booking, /refundAmount > 0 \? 'REF' : 'BTL'/);
  assert.match(billing, /item\.classification === 'booking_fee'[\s\S]*\? 'BOOKING'/);
  assert.match(billing, /item\.classification === 'full_settlement'[\s\S]*\? 'LUNAS'/);
  assert.match(billing, /item\.classification === 'security_deposit'[\s\S]*\? 'DEPOSIT'/);
  assert.match(billing, /'BTL',[\s\S]*'CANCEL'/);
  assert.match(lease, /'TRX',[\s\S]*'DEPOSIT'/);
  assert.match(transfer, /'TRX',[\s\S]*'TAMBAH-DEPOSIT'/);
  assert.match(checkout, /'REF', 'CHECKOUT'/);
  assert.match(gateway, /isOtherCharge \? 'TAGIHAN-LAIN' : 'SEWA'/);
  assert.match(repository, /next_financial_transaction_code\('TRX','SEWA'/);
  assert.doesNotMatch(productionSources, /PAY-ONB-|DPT-|TRF-|GW-/);
});
