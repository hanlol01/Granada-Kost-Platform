import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import {
  createBillingInvoicePdf,
  createBillingReceiptPdf,
  createContractPaidDocumentPdf,
} from '../../src/modules/billing/helpers/billing-document.helper';

void test('invoice renderer uses the same branded PDF authority as payment receipts', async () => {
  const result = await createBillingInvoicePdf({
    invoiceCode: 'INV-TEST-20260831',
    invoiceStatus: 'partially_paid',
    invoicePurpose: 'rent',
    residentName: 'Siti Penghuni',
    roomNumber: 'RK-03-01',
    buildingCode: 'RK-03',
    coverageStart: '2026-08-01',
    coverageEnd: '2026-10-31',
    dueDate: '2026-08-28',
    totalAmount: 5_400_000,
    outstandingAmount: 3_600_000,
    issuedAt: new Date('2026-08-21T11:00:00+07:00'),
  });

  assert.equal(result.filename, 'INV-TEST-20260831.pdf');
  assert.equal(result.content.subarray(0, 4).toString('latin1'), '%PDF');
  assert.ok(result.content.length > 10_000);
  const loaded = await PDFDocument.load(result.content);
  assert.equal(loaded.getPageCount(), 1);
});

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

void test('contract-paid proof is a distinct one-page document for the full lease obligation', async () => {
  const result = await createContractPaidDocumentPdf({
    documentCode: '001-09/KONTRAK-LUNAS/GSH1/2026',
    residentName: 'Rehan',
    roomNumber: 'AK-18-17',
    buildingCode: 'AK-18',
    leaseStart: '2026-08-01',
    leaseEnd: '2026-11-01',
    contractRentAmount: 5_400_000,
    initialRentCredit: 1_800_000,
    additionalRentPayments: 3_600_000,
    contractAdjustmentAmount: 0,
    totalRentReceived: 5_400_000,
    totalSettledAmount: 5_400_000,
    outstandingAmount: 0,
    settledAt: '2026-09-03T03:00:00.000Z',
    issuedAt: '2026-09-03T03:00:00.000Z',
    transactionCodes: ['TRX-20260801-000001-DP', 'TRX-20260903-000004-LUNAS'],
    propertyName: 'Granada Student House by Kostation',
    propertyAddress: 'Jatinangor, Sumedang',
    issuedByName: 'Diki Karya Permana',
  });

  assert.equal(result.filename, '001-09-KONTRAK-LUNAS-GSH1-2026.pdf');
  assert.equal(result.content.subarray(0, 4).toString('latin1'), '%PDF');
  assert.ok(result.content.length > 10_000);
  const loaded = await PDFDocument.load(result.content);
  assert.equal(loaded.getPageCount(), 1);

  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const parsed = await getDocument({ data: new Uint8Array(result.content) }).promise;
  const content = await (await parsed.getPage(1)).getTextContent();
  const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
  assert.match(text, /BUKTI PELUNASAN KONTRAK SEWA/);
  assert.match(text, /Apart Kost · Kamar No\.18, Unit 17/);
  assert.match(text, /seluruh kewajiban pembayaran sewa kontrak/);
  assert.match(text, /Total kewajiban lunas/);
});
