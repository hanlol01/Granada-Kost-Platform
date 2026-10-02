const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createBillingInvoicePdf,
  createBillingReceiptPdf,
  createContractPaidDocumentPdf,
  createOwnerSponsoredManagementFeeDocumentPdf,
} = require('../../.checkin-proof-build/modules/billing/helpers/billing-document.helper');

async function textOf(document) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(document.content), useSystemFonts: true });
  const pdf = await task.promise;
  let text = '';
  for (let index = 1; index <= pdf.numPages; index++) {
    const page = await pdf.getPage(index);
    text += (await page.getTextContent()).items.map((item) => item.str || '').join(' ') + ' ';
  }
  await task.destroy();
  return text;
}

const shared = {
  residentName: 'CHECK-IN TEST',
  roomNumber: 'RK-01-01',
  buildingCode: 'RK-01',
  propertyName: 'Granada Student House 1 Jatinangor',
  propertyAddress: 'Jatinangor',
  issuedByName: 'Pengelola',
  leaseStart: '2026-10-01',
  leaseEnd: '2027-10-01',
  leaseTermMonths: 12,
  contractRentAmount: 21600000,
  agreedMonthlyPrice: 1800000,
};

test('pre-check-in invoice hides the final range and deadline without losing the obligation', async () => {
  const text = await textOf(
    await createBillingInvoicePdf({
      ...shared,
      servicePeriodPending: true,
      invoiceCode: 'INV-CHECKIN-01',
      invoicePurpose: 'rent',
      invoiceStatus: 'issued',
      coverageStart: '2026-08-01',
      coverageEnd: '2027-07-31',
      contractStart: '2026-08-01',
      contractEnd: '2027-08-01',
      dueDate: '2026-08-15',
      totalAmount: 21600000,
      outstandingAmount: 20600000,
      issuedAt: new Date('2026-09-05T03:00:00Z'),
    }),
  );
  assert.match(text, /12 bulan/);
  assert.match(text, /menunggu check-in/i);
  assert.match(text, /Ditentukan setelah check-in/);
  assert.doesNotMatch(text, /Agustus 2026|Agustus 2027|Juli 2027/);
  assert.match(text, /21\.600\.000/);
});

test('current receipt uses check-in dates but retains the true advance-payment date and amount', async () => {
  const data = {
    ...shared,
    receiptCode: 'RCT-CHECKIN-01',
    paymentCode: 'PAY-CHECKIN-01',
    paymentMethod: 'bank_transfer',
    paymentPurpose: 'booking_fee',
    amount: 1000000,
    paidAt: '2026-09-05T03:00:00Z',
    issuedAt: new Date('2026-09-05T03:00:00Z'),
    allocations: [],
  };
  const pending = await textOf(
    await createBillingReceiptPdf({ ...data, servicePeriodPending: true }),
  );
  assert.match(pending, /menunggu check-in/i);
  assert.doesNotMatch(pending, /Oktober 2026|Oktober 2027/);
  const current = await textOf(await createBillingReceiptPdf(data));
  assert.match(current, /Oktober 2026/);
  assert.match(current, /Oktober 2027|September 2027/);
  for (const text of [pending, current]) {
    assert.match(text, /05 September 2026|5 September 2026/);
    assert.match(text, /1\.000\.000/);
    assert.match(text, /PAY-CHECKIN-01/);
  }
});

test('full prepayment proof does not assert occupied service before check-in', async () => {
  const text = await textOf(
    await createContractPaidDocumentPdf({
      ...shared,
      servicePeriodPending: true,
      documentCode: 'KONTRAK-LUNAS-CHECKIN',
      initialRentCredit: 1000000,
      additionalRentPayments: 20600000,
      contractAdjustmentAmount: 0,
      totalRentReceived: 21600000,
      totalSettledAmount: 21600000,
      outstandingAmount: 0,
      settledAt: '2026-09-05T03:00:00Z',
      issuedAt: '2026-09-05T03:00:00Z',
      transactionCodes: ['PAY-CHECKIN-01'],
    }),
  );
  assert.match(text, /menunggu check-in/i);
  assert.doesNotMatch(text, /Oktober 2026|Oktober 2027/);
  assert.match(text, /21\.600\.000/);
});

test('Owner-sponsored fee document keeps advance payment separate from pending service', async () => {
  const text = await textOf(
    await createOwnerSponsoredManagementFeeDocumentPdf({
      ...shared,
      servicePeriodPending: true,
      documentCode: 'INV-SPONSORED-CHECKIN',
      ownerName: 'OWNER TEST',
      managementFeeMode: 'charged',
      managementFeePayer: 'resident',
      managementFeePayerName: null,
      monthlyManagementFee: 300000,
      projectedManagementFee: 3600000,
      verifiedPaid: 300000,
      pending: 0,
      remaining: 3300000,
      printedAt: new Date('2026-09-05T03:00:00Z'),
    }),
  );
  assert.match(text, /menunggu check-in/i);
  assert.doesNotMatch(text, /Oktober 2026|Oktober 2027/);
  assert.match(text, /3\.600\.000/);
});

test('superseding-period notice is visible without changing payment identity', async () => {
  const text = await textOf(
    await createBillingReceiptPdf({
      ...shared,
      receiptCode: 'RCT-AMENDMENT',
      paymentCode: 'PAY-AMENDMENT',
      paymentMethod: 'bank_transfer',
      paymentPurpose: 'rent',
      amount: 1800000,
      paidAt: '2026-09-05T03:00:00Z',
      issuedAt: new Date('2026-09-05T03:00:00Z'),
      allocations: [],
      periodAuthorityNote:
        'Periode mengikuti catatan check-in versi 1. Transaksi asli tetap dipertahankan.',
    }),
  );
  assert.match(text, /Catatan periode/);
  assert.match(text, /versi 1/);
  assert.match(text, /PAY-AMENDMENT/);
  assert.match(text, /September 2026/);
});
