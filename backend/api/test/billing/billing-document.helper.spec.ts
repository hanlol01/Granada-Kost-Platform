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
    printedAt: new Date('2026-09-17T11:00:00+07:00'),
  });

  assert.equal(result.filename, 'INV-TEST-20260831.pdf');
  assert.equal(result.content.subarray(0, 4).toString('latin1'), '%PDF');
  assert.ok(result.content.length > 10_000);
  const loaded = await PDFDocument.load(result.content);
  assert.equal(loaded.getPageCount(), 1);

  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const parsed = await getDocument({ data: new Uint8Array(result.content) }).promise;
  const content = await (await parsed.getPage(1)).getTextContent();
  const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
  assert.match(text, /Diterbitkan\s*:\s*Kamis, 17 September 2026/);
  assert.doesNotMatch(text, /Dicetak pada/);
});

void test('invoice renderer emphasizes the current outstanding balance in the invoice and terbilang', async () => {
  const result = await createBillingInvoicePdf({
    invoiceCode: 'INV-OUTSTANDING-20260914',
    invoiceStatus: 'partially_paid',
    invoicePurpose: 'rent',
    residentName: 'Siti Penghuni',
    roomNumber: 'RK-03-01',
    buildingCode: 'RK-03',
    coverageStart: '2026-08-01',
    coverageEnd: '2027-07-31',
    dueDate: '2026-08-28',
    totalAmount: 21_600_000,
    outstandingAmount: 15_800_000,
    issuedAt: new Date('2026-09-14T11:00:00+07:00'),
  });

  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const parsed = await getDocument({ data: new Uint8Array(result.content) }).promise;
  const content = await (await parsed.getPage(1)).getTextContent();
  const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');

  assert.match(text, /Tagihan yang perlu dibayar\s*:\s*Rp\. 15\.800\.000,-/);
  assert.match(text, /Nilai tagihan awal\s*:\s*Rp\. 21\.600\.000,-/);
  assert.match(text, /Sudah dibayarkan\s*:\s*Rp\. 5\.800\.000,-/);
  assert.match(text, /Sisa tagihan\s*:\s*Rp\. 15\.800\.000,-/);
  assert.match(text, /Lima Belas Juta Delapan Ratus Ribu Rupiah/);
  assert.doesNotMatch(text, /Dua Puluh Satu Juta Enam Ratus Ribu Rupiah/);
});

void test('rent invoice preserves the contractual period after an early checkout and uses settlement deadlines', async () => {
  const result = await createBillingInvoicePdf({
    invoiceCode: 'INV-CONTRACT-PERIOD-20260917',
    invoiceStatus: 'partially_paid',
    invoicePurpose: 'rent',
    residentName: 'Deyaa',
    roomNumber: 'RK-01-06',
    buildingCode: 'RK-01',
    coverageStart: '2026-08-01',
    coverageEnd: '2027-07-31',
    dueDate: '2026-08-01',
    contractStart: '2026-08-01',
    // The effective lease end may be shortened by check-out; the service must
    // provide the planned contract end before calling this renderer.
    contractEnd: '2027-07-31',
    leaseTermMonths: 12,
    currentSettlementDueAt: '2026-11-01T16:59:59.999Z',
    finalSettlementDueAt: '2026-11-01T16:59:59.999Z',
    totalAmount: 21_600_000,
    outstandingAmount: 2_300_000,
    issuedAt: new Date('2026-08-01T01:00:00.000Z'),
  });

  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const parsed = await getDocument({ data: new Uint8Array(result.content) }).promise;
  const content = await (await parsed.getPage(1)).getTextContent();
  const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');

  assert.match(text, /Periode\s*:\s*1 Tahun \/ 1 Agustus 2026 s\.d\. 31 Juli 2027/);
  assert.doesNotMatch(text, /Cakupan tagihan/);
  assert.match(text, /Jatuh Tempo Tagihan\s*:\s*Minggu, 1 November 2026/);
  assert.match(text, /Batas Pelunasan Kontrak\s*:\s*Minggu, 1 November 2026/);
  assert.doesNotMatch(text, /Sabtu, 1 Agustus 2026/);
});

void test('invoice renderer moves the balance summary to a continuation page when rows exceed the page', async () => {
  const result = await createBillingInvoicePdf({
    invoiceCode: 'INV-CONTINUATION-20260917',
    invoiceStatus: 'partially_paid',
    invoicePurpose: 'rent',
    residentName: 'Nama Penghuni Dengan Nama Panjang Untuk Memastikan Ruang Dokumen Tetap Aman',
    roomNumber: 'RK-01-06',
    buildingCode: 'RK-01',
    coverageStart: '2026-08-01',
    coverageEnd: '2027-07-31',
    dueDate: '2026-08-01',
    contractStart: '2026-08-01',
    contractEnd: '2027-07-31',
    leaseTermMonths: 12,
    currentSettlementDueAt: '2026-11-01T16:59:59.999Z',
    finalSettlementDueAt: '2026-11-01T16:59:59.999Z',
    agreedMonthlyPrice: 1_800_000,
    contractRentAmount: 21_600_000,
    cumulativeRentPaid: 5_800_000,
    contractRemainingAmount: 15_800_000,
    pricingSource: 'negotiated',
    totalAmount: 21_600_000,
    outstandingAmount: 15_800_000,
    issuedAt: new Date('2026-08-01T01:00:00.000Z'),
    propertyName: 'Granada Student House Jatinangor Dengan Nama Pengelola Properti Yang Panjang',
    propertyAddress:
      'Jalan Kiara Beres, Desa Cipacing, Kecamatan Jatinangor, Kabupaten Sumedang, Jawa Barat 45363',
    issuedByName: 'Admin Pengelola Dengan Nama Panjang Untuk Pengujian Tata Letak Dokumen',
  });

  const parsed = await PDFDocument.load(result.content);
  assert.equal(parsed.getPageCount(), 2);
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

void test('receipt renderer presents the building unit before the room number', async () => {
  const result = await createBillingReceiptPdf({
    receiptCode: '033-09/DP-KOST/GSH1/2026',
    paymentCode: 'TRX-20260808-000005-DP',
    paymentMethod: 'bank_transfer',
    paymentPurpose: 'down_payment',
    residentName: 'jianaha',
    roomNumber: 'RK-02-05',
    buildingCode: 'RK-02',
    amount: 5_400_000,
    paidAt: new Date('2026-08-08T10:30:00+07:00'),
    issuedAt: new Date('2026-08-08T10:31:00+07:00'),
    allocations: [],
  });

  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const parsed = await getDocument({ data: new Uint8Array(result.content) }).promise;
  const content = await (await parsed.getPage(1)).getTextContent();
  const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');

  assert.match(text, /Rumah Kost · Unit 2, Kamar 5/);
  assert.doesNotMatch(text, /Kamar No\.02, Unit 05/);
});

void test('receipt renderer supports revised Apart Kost room codes', async () => {
  const result = await createBillingReceiptPdf({
    receiptCode: '054-09/DP-KOST/GSH1/2026',
    paymentCode: 'TRX-20260705-000006-BOOKING',
    paymentMethod: 'bank_transfer',
    paymentPurpose: 'booking_fee',
    residentName: 'Fathan Abyan A',
    roomNumber: 'AK-18/18-07',
    buildingCode: 'AK-18',
    amount: 10_800_000,
    paidAt: new Date('2026-07-05T10:30:00+07:00'),
    issuedAt: new Date('2026-07-05T10:31:00+07:00'),
    allocations: [],
  });

  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const parsed = await getDocument({ data: new Uint8Array(result.content) }).promise;
  const content = await (await parsed.getPage(1)).getTextContent();
  const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');

  assert.match(text, /Apart Kost · Unit 18, Kamar 7/);
  assert.doesNotMatch(text, /AK-18\/18-07/);
});

void test('rent installment receipt states its sequence, contract, period, balance, and deadline', async () => {
  const result = await createBillingReceiptPdf({
    receiptCode: '004-09/SEWA-KOST/GSH1/2026',
    paymentCode: 'TRX-20260822-000001-SEWA',
    paymentMethod: 'bank_transfer',
    paymentPurpose: 'rent',
    residentName: 'Deyaa',
    roomNumber: 'AK-05-02',
    buildingCode: 'AK-05',
    amount: 2_000_000,
    paidAt: new Date('2026-08-22T10:30:00+07:00'),
    issuedAt: new Date('2026-08-22T10:31:00+07:00'),
    allocations: [],
    propertyName: 'Granada Student House Jatinangor',
    propertyAddress: 'Jl. Kiara Beres, Desa Cipacing, Kec. Jatinangor, Kab. Sumedang 45363',
    issuedByName: 'Diki Karya Permana',
    leaseStart: '2026-08-01',
    leaseEnd: '2027-08-01',
    leaseTermMonths: 12,
    contractRentAmount: 21_600_000,
    rentPaymentSequence: 2,
    totalRentReceived: 18_300_000,
    remainingRentAmount: 3_300_000,
    finalSettlementDueAt: new Date('2026-11-01T16:59:59.999Z'),
    showSettlementSummary: true,
  });

  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const parsed = await getDocument({ data: new Uint8Array(result.content) }).promise;
  const content = await (await parsed.getPage(1)).getTextContent();
  const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');

  assert.match(text, /Pembayaran Angsuran Sewa ke-2/);
  assert.match(text, /dari total kontrak Rp\. 21\.600\.000,-/);
  assert.match(text, /1 tahun \/ 1 Agustus 2026 s\.d\. 1 Agustus 2027/);
  assert.match(text, /Uang sejumlah\s+:\s+Rp\. 2\.000\.000,-/);
  assert.match(text, /Sisa pelunasan\s+:\s+Rp\. 3\.300\.000,-/);
  assert.match(text, /Batas akhir pelunasan\s+:\s+1 November 2026/);
  assert.match(text, /Kab\. Sumedang 45363/);
});

void test('contract-paid proof is a distinct one-page document for the full lease obligation', async () => {
  const result = await createContractPaidDocumentPdf({
    documentCode: '001-09/KONTRAK-LUNAS/GSH1/2026',
    residentName: 'Rehan',
    roomNumber: 'AK-18-17',
    buildingCode: 'AK-18',
    leaseStart: '2026-08-01',
    leaseEnd: '2026-11-01',
    leaseTermMonths: 3,
    referenceMonthlyPrice: 1_900_000,
    agreedMonthlyPrice: 1_800_000,
    pricingSource: 'negotiated',
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
    transactionReferences: [
      { code: 'TRX-20260801-000001-DP', amount: 1_800_000 },
      { code: 'TRX-20260903-000004-LUNAS', amount: 3_600_000 },
    ],
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
  assert.match(text, /Apart Kost · Unit 18, Kamar 17/);
  assert.match(text, /seluruh kewajiban pembayaran sewa kontrak/);
  assert.match(text, /Total kewajiban lunas/);
  assert.match(text, /Durasi kontrak\s+:\s+3 bulan/);
  assert.match(text, /Tarif per bulan\s+:\s+Rp\. 1\.800\.000,-/);
  assert.match(text, /Sumber tarif\s+:\s+Kesepakatan khusus/);
  assert.match(text, /TRX-20260801-000001-DP \( Rp\. 1\.800\.000,- \)/);
  assert.match(text, /TRX-20260903-000004-LUNAS \( Rp\. 3\.600\.000,- \)/);
  assert.doesNotMatch(text, /Pembayaran awal/);
  assert.doesNotMatch(text, /Pembayaran berikutnya/);
});
