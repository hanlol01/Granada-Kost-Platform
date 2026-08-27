import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { createBillingReceiptPdf } from '../../src/modules/billing/helpers/billing-document.helper';

void test('branded receipt renderer creates a one-page PDF with the canonical receipt data', async () => {
  const result = await createBillingReceiptPdf({
    receiptCode: 'RCT-TEST-20260827',
    paymentCode: 'PAY-TEST-20260827',
    paymentMethod: 'bank_transfer',
    paymentPurpose: 'rent',
    residentName: 'Siti Penghuni',
    roomNumber: 'A-12',
    amount: 2_800_000,
    paidAt: new Date('2026-08-21T10:30:00+07:00'),
    issuedAt: new Date('2026-08-21T11:00:00+07:00'),
    allocations: [{ invoiceCode: 'INV-202608-A12', amount: 2_800_000 }],
    propertyName: 'Granada Student House',
    propertyAddress: 'Jatinangor, Sumedang, Jawa Barat',
    issuedByName: 'Pengelola Kostation',
    leaseStart: '2026-08-01',
    leaseEnd: '2026-10-31',
  });

  assert.equal(result.filename, 'RCT-TEST-20260827.pdf');
  assert.equal(result.content.subarray(0, 4).toString('latin1'), '%PDF');
  assert.ok(result.content.length > 10_000);
  const loaded = await PDFDocument.load(result.content);
  assert.equal(loaded.getPageCount(), 1);
});
