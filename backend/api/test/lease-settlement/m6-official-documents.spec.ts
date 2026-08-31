import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import {
  createLeaseExitOfficialDocumentPdf,
  type LeaseExitOfficialDocumentSnapshot,
} from '../../src/modules/billing/helpers/billing-document.helper';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';

const migrationPath = new URL(
  '../../src/infrastructure/database/migrations/054_lease_exit_official_documents_m6.sql',
  import.meta.url,
);
const migration = readFileSync(migrationPath, 'utf8');
const checkoutService = readFileSync(
  new URL('../../src/modules/lease/lease-checkout.service.ts', import.meta.url),
  'utf8',
);
const myController = readFileSync(
  new URL('../../src/modules/lease/my-lease-exit-document.controller.ts', import.meta.url),
  'utf8',
);
const billingService = readFileSync(
  new URL('../../src/modules/billing/services/w06-billing.service.ts', import.meta.url),
  'utf8',
);

function snapshot(
  kind: LeaseExitOfficialDocumentSnapshot['document_kind'],
): LeaseExitOfficialDocumentSnapshot {
  return {
    document_code: `${kind === 'checkout_handover' ? 'CHK' : kind === 'final_settlement' ? 'FST' : 'RFD'}-TEST-20260829`,
    document_kind: kind,
    issued_at: '2026-08-29T03:00:00.000Z',
    property: { name: 'Granada Student House', address: 'Jatinangor, Sumedang' },
    resident: { name: 'Fahmi Penghuni' },
    room: {
      number: 'AK-18-01',
      building_code: 'AK',
      category_name: 'Kost Eksklusif',
      checkout_result: 'inspection_required',
    },
    lease: {
      start_date: '2026-08-28',
      planned_end_date: '2027-02-28',
      actual_checkout_date: '2026-10-01',
      contract_rent_amount: 10_800_000,
      monthly_rate_amount: 1_800_000,
      policy_version: 'lease_settlement_v2',
      exit_type: 'resident_early_termination',
    },
    authority: {
      checkout_confirmed_by: 'Diki Karya Permana',
      checkout_confirmed_at: '2026-10-01T01:00:00.000Z',
      inspection_recorded_by: 'Diki Karya Permana',
      inspection_recorded_at: '2026-10-01T02:00:00.000Z',
    },
    notice: {
      recorded_date: '2026-09-20',
      effective_date: '2026-10-01',
      required_days: 14,
      actual_days: 11,
      missing_days: 3,
      reason: 'Pindah kota',
      approved_short_notice_charge: 174_195,
      waiver_reason: null,
    },
    handover: {
      keys_access_confirmed: true,
      inventory_confirmed: true,
      parking_confirmed: true,
      inspection_confirmed: true,
      key_access_items: [
        {
          name: 'Kunci kamar',
          expected_quantity: 1,
          returned_quantity: 1,
          status: 'returned',
        },
      ],
      inventory_items: [
        {
          name: 'Lemari',
          expected_quantity: 1,
          returned_quantity: 1,
          condition: 'complete',
        },
      ],
      utility_readings: [
        {
          utility_type: 'Listrik',
          meter_number: 'PLN-001',
          checkout_reading: '1234.5',
          unit: 'kWh',
          outstanding_usage_notes: 'Tidak ada tagihan tersisa',
        },
      ],
      notes: 'Serah-terima disaksikan oleh pengelola.',
    },
    payments: [
      {
        payment_code: 'PAY-TEST-001',
        payment_purpose: 'rent',
        amount: 1_800_000,
        paid_at: '2026-08-27T03:00:00.000Z',
        payment_method: 'bank_transfer',
        payment_status: 'verified',
        receipt_code: 'RCT-TEST-001',
      },
    ],
    damages: [{ reference: 'EV-DMG-01', reason: 'Kunci lemari rusak', amount: 150_000 }],
    settlement: {
      verified_rent_payment_amount: 1_800_000,
      existing_invoice_credit_amount: 0,
      recognized_rent_credit_amount: 1_800_000,
      earned_rent_amount: 1_800_000,
      unearned_invoice_credit_amount: 9_000_000,
      contract_outstanding_amount: 0,
      rent_refundable_amount: 0,
      rent_amount_due_before_deposit_offset: 174_195,
      deposit_liability_amount: 1_800_000,
      deposit_deduction_amount: 150_000,
      deposit_rent_offset_amount: 174_195,
      refundable_deposit_amount: 1_475_805,
      recommended_refund_amount: 1_475_805,
      final_refund_amount: 1_475_805,
      final_rent_refund_amount: 0,
      final_deposit_refund_amount: 1_475_805,
      refund_adjustment_amount: 0,
      refund_adjustment_reason: null,
      amount_due: 0,
      decision_status: kind === 'refund_receipt' ? 'closed' : 'refund_pending',
    },
    refund: {
      status: kind === 'refund_receipt' ? 'settled' : 'pending',
      due_date: '2026-10-12',
      payment_method: kind === 'refund_receipt' ? 'bank_transfer' : null,
      external_reference: kind === 'refund_receipt' ? 'TRX-REFUND-001' : null,
      settled_at: kind === 'refund_receipt' ? '2026-10-03T03:00:00.000Z' : null,
    },
  };
}

void test('M6 migration is manifest-bound and makes issued PDF bytes immutable', () => {
  const entry = MIGRATION_MANIFEST.find(
    (candidate) => candidate.version === '054_lease_exit_official_documents_m6.sql',
  );
  assert.ok(entry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), entry.checksumSha256);
  assert.match(migration, /document_content BYTEA NOT NULL/);
  assert.match(migration, /content_sha256/);
  assert.match(migration, /planned_lease_end_date/);
  assert.match(migration, /'deposit_offset','settlement','utilities'/);
  assert.match(migration, /'utilities'/);
  assert.match(migration, /ALTER TABLE payment_receipts/);
  assert.match(migration, /payment_receipts_document_content_check/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON lease_exit_documents/);
  assert.match(migration, /LEASE_EXIT_DOCUMENT_HISTORY_IMMUTABLE/);
  assert.match(migration, /lease_exit_documents_checkout_kind_unique/);
});

void test('M6 checkout and final-settlement PDFs reuse the official branded document authority', async () => {
  for (const kind of ['checkout_handover', 'final_settlement'] as const) {
    const result = await createLeaseExitOfficialDocumentPdf(kind, snapshot(kind));
    assert.match(result.filename, new RegExp(`^${kind === 'checkout_handover' ? 'CHK' : 'FST'}-`));
    assert.equal(result.content.subarray(0, 4).toString('latin1'), '%PDF');
    assert.ok(result.content.length > 10_000);
    const parsed = await PDFDocument.load(result.content);
    assert.ok(parsed.getPageCount() >= 1);
    const source = result.content.toString('latin1');
    assert.doesNotMatch(source, /file_id|content_path|storage_path/i);
  }
});

void test('M6 refund receipt is issued only as a paid outgoing document variant', async () => {
  const result = await createLeaseExitOfficialDocumentPdf(
    'refund_receipt',
    snapshot('refund_receipt'),
  );
  const parsed = await PDFDocument.load(result.content);
  assert.equal(parsed.getPageCount(), 1);
  assert.match(result.filename, /^RFD-/);
  assert.ok(result.content.length > 10_000);
});

void test('M6 stores the rendered PDF and checksum while keeping resident access owner-denied', () => {
  assert.match(checkoutService, /createLeaseExitOfficialDocumentPdf/);
  assert.match(checkoutService, /document_content,content_sha256/);
  assert.match(checkoutService, /resident\.user_id=\$2/);
  assert.match(checkoutService, /kind === 'refund_receipt' \? refundId : null/);
  assert.match(myController, /@RequireRoles\('resident'\)/);
  assert.match(myController, /@RequirePermissions\('billing\.self\.read'\)/);
  assert.doesNotMatch(myController, /property_owner/);
  assert.match(billingService, /document_content,content_sha256/);
  assert.match(billingService, /stored\.rows\[0\]\.document_content/);
  assert.match(billingService, /const document = await this\.createReceiptDocument/);
  assert.match(billingService, /sourcePaymentId = paymentId/);
});
