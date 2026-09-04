import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';

export type BillingInvoiceDocumentData = {
  invoiceCode: string;
  invoiceStatus: string;
  invoicePurpose: 'rent' | 'other_charge';
  residentName: string;
  roomNumber: string;
  buildingCode: string;
  coverageStart: string;
  coverageEnd: string;
  dueDate: string;
  totalAmount: number;
  outstandingAmount: number;
  issuedAt: Date | null;
  propertyName?: string;
  propertyAddress?: string | null;
  issuedByName?: string | null;
};

export type BillingInvoiceDocument = {
  filename: string;
  content: Buffer;
};

export type BillingReceiptDocumentData = {
  receiptCode: string;
  paymentCode: string;
  paymentMethod: string;
  paymentPurpose: string;
  residentName: string;
  roomNumber: string;
  amount: number;
  paidAt: Date | string | null;
  issuedAt: Date;
  allocations: Array<{ invoiceCode: string; amount: number }>;
  contractSettled?: boolean;
  /** Optional domain-specific wording while retaining the standard receipt layout. */
  documentTitle?: string;
  documentFootnote?: string;
  propertyName?: string;
  propertyAddress?: string | null;
  buildingCode?: string | null;
  issuedByName?: string | null;
  leaseStart?: string | Date | null;
  leaseEnd?: string | Date | null;
  leaseTermMonths?: number | null;
  periodLabel?: string;
  contractRentAmount?: number | null;
  rentPaymentSequence?: number | null;
  totalRentReceived?: number | null;
  remainingRentAmount?: number | null;
  finalSettlementDueAt?: string | Date | null;
  showSettlementSummary?: boolean;
  transactionDirection?: 'incoming' | 'outgoing' | 'correction';
  paymentDescription?: string;
  /** Overrides the standard receipt number caption for non-transaction documents. */
  documentNumberLabel?: string;
  /** Replaces the standard receipt rows while retaining the canonical visual layout. */
  detailRows?: Array<[string, string]>;
  /** Displays a prominent state immediately below the document number. */
  documentStatusNote?: string;
};

export type BillingReceiptDocument = {
  filename: string;
  content: Buffer;
};

export type ContractPaidDocumentSnapshot = {
  documentCode: string;
  residentName: string;
  roomNumber: string;
  buildingCode: string | null;
  leaseStart: string;
  leaseEnd: string;
  contractRentAmount: number;
  initialRentCredit: number;
  additionalRentPayments: number;
  contractAdjustmentAmount: number;
  totalRentReceived: number;
  totalSettledAmount: number;
  outstandingAmount: number;
  settledAt: string;
  issuedAt: string;
  transactionCodes: string[];
  propertyName: string;
  propertyAddress: string | null;
  issuedByName: string | null;
};

export type LeaseExitOfficialDocumentKind =
  | 'checkout_handover'
  | 'final_settlement'
  | 'refund_receipt';

export type LeaseExitOfficialDocumentSnapshot = {
  document_code: string;
  document_kind: LeaseExitOfficialDocumentKind;
  issued_at: string;
  property: { name: string; address: string | null };
  resident: { name: string };
  room: {
    number: string;
    building_code: string;
    category_name: string;
    checkout_result: string;
  };
  lease: {
    start_date: string;
    planned_end_date: string;
    actual_checkout_date: string;
    contract_rent_amount: number;
    monthly_rate_amount: number;
    policy_version: string;
    exit_type: 'resident_early_termination' | 'normal_expiry';
  };
  authority: {
    checkout_confirmed_by: string;
    checkout_confirmed_at: string;
    inspection_recorded_by: string;
    inspection_recorded_at: string;
  };
  notice: {
    recorded_date: string;
    effective_date: string;
    required_days: number;
    actual_days: number;
    missing_days: number;
    reason: string;
    approved_short_notice_charge: number;
    waiver_reason: string | null;
  };
  handover: {
    keys_access_confirmed: boolean;
    inventory_confirmed: boolean;
    parking_confirmed: boolean;
    inspection_confirmed: boolean;
    key_access_items: Array<{
      name: string;
      expected_quantity: number;
      returned_quantity: number;
      status: 'returned' | 'partial' | 'damaged' | 'missing' | 'not_applicable';
      notes?: string;
    }>;
    inventory_items: Array<{
      name: string;
      expected_quantity: number;
      returned_quantity: number;
      condition: 'complete' | 'partial' | 'damaged' | 'missing' | 'not_applicable';
      notes?: string;
    }>;
    utility_readings: Array<{
      utility_type: string;
      meter_number?: string;
      checkout_reading: string;
      unit: string;
      outstanding_usage_notes?: string;
    }>;
    notes: string | null;
  };
  payments: Array<{
    payment_code: string;
    payment_purpose: string;
    amount: number;
    paid_at: string | null;
    payment_method: string;
    payment_status: string;
    receipt_code: string | null;
  }>;
  damages: Array<{
    reference: string;
    reason: string;
    amount: number;
  }>;
  settlement: {
    verified_rent_payment_amount: number;
    existing_invoice_credit_amount: number;
    recognized_rent_credit_amount: number;
    earned_rent_amount: number;
    unearned_invoice_credit_amount: number;
    contract_outstanding_amount: number;
    rent_refundable_amount: number;
    rent_amount_due_before_deposit_offset: number;
    deposit_liability_amount: number;
    deposit_deduction_amount: number;
    deposit_rent_offset_amount: number;
    refundable_deposit_amount: number;
    recommended_refund_amount: number;
    final_refund_amount: number;
    final_rent_refund_amount: number;
    final_deposit_refund_amount: number;
    refund_adjustment_amount: number;
    refund_adjustment_reason: string | null;
    amount_due: number;
    decision_status: string;
  };
  refund: {
    status: string | null;
    due_date: string | null;
    payment_method: string | null;
    external_reference: string | null;
    transaction_code: string | null;
    settled_at: string | null;
  };
};

function idr(value: number): string {
  const amount = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(
    Math.abs(value),
  );
  return `${value < 0 ? '-' : ''}Rp. ${amount},-`;
}

function label(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function propertyAddressText(
  propertyName: string | null | undefined,
  propertyAddress: string | null | undefined,
  separator: string,
): string {
  const name = propertyName?.trim() || '';
  let address = propertyAddress?.trim() || '';
  if (
    /granada student house jatinangor/i.test(name) &&
    /kab\.\s*sumedang\s*$/i.test(address) &&
    !/\b45363\b/.test(address)
  ) {
    address = `${address} 45363`;
  }
  return [name, address].filter(Boolean).join(separator);
}

export async function createBillingInvoicePdf(
  data: BillingInvoiceDocumentData,
): Promise<BillingInvoiceDocument> {
  const paidAmount = data.totalAmount - data.outstandingAmount;
  const document = await PDFDocument.create();
  const page = document.addPage([595.28, 841.89]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const italic = await document.embedFont(StandardFonts.HelveticaBoldOblique);
  const [granada, kostation, ptSonSmart, tandatangan] = await Promise.all([
    document.embedPng(receiptAsset('granada.png')),
    document.embedPng(receiptAsset('kostation.png')),
    document.embedPng(receiptAsset('pt-son-smart.png')),
    document.embedPng(receiptAsset('tandatangan.png')),
  ]);
  const black = rgb(0, 0, 0);
  const navy = black;
  const softNavy = black;
  const muted = black;
  const terbilangRed = rgb(0.78, 0.08, 0.08);
  const border = rgb(0.79, 0.82, 0.86);
  const pageWidth = page.getWidth();

  drawContainedImage(page, granada, 34, 708, 150, 116);
  drawContainedImage(page, kostation, 214, 758, 168, 34);
  drawContainedImage(page, ptSonSmart, 465, 740, 78, 52);

  const addressLines = wrapText(
    regular,
    propertyAddressText(data.propertyName ?? 'Granada Student House', data.propertyAddress, ' - '),
    8,
    285,
  ).slice(0, 2);
  addressLines.forEach((line, index) => {
    const width = regular.widthOfTextAtSize(line, 8);
    page.drawText(line, {
      x: (pageWidth - width) / 2,
      y: 748 - index * 10,
      size: 8,
      font: regular,
      color: muted,
    });
  });

  page.drawLine({ start: { x: 52, y: 720 }, end: { x: 543, y: 720 }, thickness: 1.5, color: navy });
  const title =
    data.invoicePurpose === 'rent' ? 'INVOICE TAGIHAN SEWA KOST' : 'INVOICE TAGIHAN LAINNYA';
  const titleWidth = bold.widthOfTextAtSize(title, 14);
  page.drawText(title, {
    x: (pageWidth - titleWidth) / 2,
    y: 692,
    size: 14,
    font: bold,
    color: navy,
  });
  const invoiceCode = `Nomor Invoice: ${data.invoiceCode}`;
  const invoiceCodeWidth = bold.widthOfTextAtSize(invoiceCode, 9);
  page.drawText(invoiceCode, {
    x: (pageWidth - invoiceCodeWidth) / 2,
    y: 676,
    size: 9,
    font: bold,
    color: navy,
  });

  const statusLabels: Record<string, string> = {
    draft: 'Draf',
    issued: 'Diterbitkan',
    partially_paid: 'Dibayar Sebagian',
    paid: 'Lunas',
    overdue: 'Tunggakan',
    void: 'Dibatalkan',
  };
  const rows: Array<[string, string]> = [
    ['Ditagihkan kepada', data.residentName],
    ['Total tagihan', idr(data.totalAmount)],
    ['Untuk pembayaran', data.invoicePurpose === 'rent' ? 'Sewa kamar' : 'Tagihan lainnya'],
    ['Periode', `${receiptDate(data.coverageStart)} s.d. ${receiptDate(data.coverageEnd)}`],
    ['Kamar No.', formatRoomDescription(data.roomNumber, data.buildingCode)],
    ['Jatuh tempo', receiptDate(data.dueDate, true)],
    ['Status invoice', statusLabels[data.invoiceStatus] ?? label(data.invoiceStatus)],
    ['Sudah dibayarkan', idr(Math.max(0, paidAmount))],
    ['Sisa tagihan', idr(data.outstandingAmount)],
    ['Diterbitkan', receiptDate(data.issuedAt, true)],
  ];
  let y = 642;
  for (const [labelText, value] of rows) {
    const valueLines = wrapText(regular, value, 10, 258);
    const rowHeight = Math.max(22, valueLines.length * 13 + 6);
    page.drawCircle({ x: 69, y: y - 7, size: 2.5, color: softNavy });
    page.drawText(labelText, { x: 83, y: y - 10, size: 10, font: bold, color: navy });
    page.drawText(':', { x: 223, y: y - 10, size: 10, font: regular, color: muted });
    valueLines.forEach((line, index) => {
      page.drawText(line, {
        x: 238,
        y: y - 10 - index * 13,
        size: 10,
        font: regular,
        color: navy,
      });
    });
    y -= rowHeight;
  }

  const terbilangLines = wrapText(italic, terbilang(data.totalAmount), 10, 422);
  const terbilangHeight = 34 + terbilangLines.length * 13;
  y -= 8;
  page.drawRectangle({
    x: 82,
    y: y - terbilangHeight,
    width: 432,
    height: terbilangHeight,
    borderColor: border,
    borderWidth: 1,
    color: rgb(0.98, 0.985, 0.99),
  });
  page.drawText('Terbilang:', { x: 96, y: y - 18, size: 10, font: bold, color: navy });
  terbilangLines.forEach((line, index) => {
    page.drawText(line, {
      x: 96,
      y: y - 34 - index * 13,
      size: 10,
      font: italic,
      color: terbilangRed,
    });
  });

  const footerY = Math.max(120, y - terbilangHeight - 90);
  const issuer = data.issuedByName?.trim() || `Pengelola ${data.propertyName ?? 'Kostation'}`;
  page.drawText('Jatinangor Sumedang,', {
    x: 52,
    y: footerY + 42,
    size: 9,
    font: regular,
    color: navy,
  });
  page.drawText('Pengelola Granada Student House by Kostation,', {
    x: 52,
    y: footerY + 28,
    size: 9,
    font: regular,
    color: navy,
  });
  drawContainedImage(page, tandatangan, 52, footerY - 72, 101, 88);
  page.drawText(issuer, { x: 52, y: footerY - 88, size: 9, font: bold, color: navy });

  const safeCode = data.invoiceCode.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80) || 'invoice';
  return { filename: `${safeCode}.pdf`, content: Buffer.from(await document.save()) };
}

const receiptPurpose: Record<string, string> = {
  rent: 'Pembayaran sewa',
  dp: 'DP / uang muka sewa',
  down_payment: 'DP / uang muka sewa',
  full_settlement: 'Pelunasan sewa penuh',
  security_deposit: 'Security deposit',
  other_charge: 'Tagihan lainnya',
  booking_fee: 'Booking fee / tahan kamar',
  booking_fee_refund: 'Refund booking fee',
  payment_commitment_refund: 'Refund pembayaran awal',
  active_lease_refund: 'Pengembalian dana penghentian sewa',
};

const paymentMethodLabel: Record<string, string> = {
  cash: 'Tunai',
  bank_transfer: 'Transfer bank',
  qris: 'QRIS',
  ewallet: 'Dompet digital',
  other: 'Metode lainnya',
};

const receiptAsset = (name: string) => readFileSync(join(__dirname, '..', 'assets', name));

function receiptDate(value: Date | string | null | undefined, withWeekday = false): string {
  if (!value) return 'Tidak tersedia';
  const date =
    value instanceof Date
      ? value
      : new Date(value.includes('T') ? value : `${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return 'Tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    ...(withWeekday ? { weekday: 'long' as const } : {}),
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function receiptPeriod(
  start: BillingReceiptDocumentData['leaseStart'],
  end: BillingReceiptDocumentData['leaseEnd'],
  termMonths?: number | null,
) {
  if (!start) return 'Sesuai alokasi tagihan';
  const duration = leaseDuration(termMonths ?? inferLeaseTermMonths(start, end));
  const dates = `${receiptDate(start)} s.d. ${end ? receiptDate(end) : 'berjalan'}`;
  return duration ? `${duration} / ${dates}` : dates;
}

function inferLeaseTermMonths(
  start: BillingReceiptDocumentData['leaseStart'],
  end: BillingReceiptDocumentData['leaseEnd'],
): number | null {
  if (!start || !end) return null;
  const startDate =
    start instanceof Date ? start : new Date(`${String(start).slice(0, 10)}T00:00:00Z`);
  const endDate = end instanceof Date ? end : new Date(`${String(end).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  const months =
    (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
    endDate.getUTCMonth() -
    startDate.getUTCMonth();
  return months > 0 ? months : null;
}

function leaseDuration(termMonths?: number | null): string | null {
  if (!termMonths || termMonths < 1) return null;
  const years = Math.floor(termMonths / 12);
  const months = termMonths % 12;
  return [years ? `${years} tahun` : '', months ? `${months} bulan` : ''].filter(Boolean).join(' ');
}

function formatRoomDescription(roomNumber: string, buildingCode?: string | null): string {
  const normalizedRoom = roomNumber.trim();
  const fullMatch = normalizedRoom.match(/^(RK|AK)[-_](\d{1,3})[-_](\d{1,3})$/i);
  const building = (fullMatch?.[1] ?? buildingCode ?? '').trim().toUpperCase();
  const segments = fullMatch
    ? [fullMatch[2], fullMatch[3]]
    : normalizedRoom.split(/[-_\s]+/).filter(Boolean);

  if (/^(RK|AK)$/.test(building) && segments.length >= 2) {
    const room = segments[segments.length - 2];
    const unit = segments[segments.length - 1];
    const propertyType = building === 'RK' ? 'Rumah Kost' : 'Apart Kost';
    return `${propertyType} · Kamar No.${room}, Unit ${unit}`;
  }

  return normalizedRoom || '-';
}

function terbilang(value: number): string {
  const words = [
    '',
    'satu',
    'dua',
    'tiga',
    'empat',
    'lima',
    'enam',
    'tujuh',
    'delapan',
    'sembilan',
    'sepuluh',
    'sebelas',
  ];
  const spell = (number: number): string => {
    if (number < 12) return words[number];
    if (number < 20) return `${spell(number - 10)} belas`;
    if (number < 100) return `${spell(Math.floor(number / 10))} puluh ${spell(number % 10)}`.trim();
    if (number < 200) return `seratus ${spell(number - 100)}`.trim();
    if (number < 1_000)
      return `${spell(Math.floor(number / 100))} ratus ${spell(number % 100)}`.trim();
    if (number < 2_000) return `seribu ${spell(number - 1_000)}`.trim();
    if (number < 1_000_000)
      return `${spell(Math.floor(number / 1_000))} ribu ${spell(number % 1_000)}`.trim();
    if (number < 1_000_000_000)
      return `${spell(Math.floor(number / 1_000_000))} juta ${spell(number % 1_000_000)}`.trim();
    return `${spell(Math.floor(number / 1_000_000_000))} miliar ${spell(number % 1_000_000_000)}`.trim();
  };
  const normalized = Math.max(0, Math.floor(value));
  return `${normalized === 0 ? 'nol' : spell(normalized)} rupiah`
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function wrapText(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(candidate, size) > width) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : ['-'];
}

function drawContainedImage(
  page: PDFPage,
  image: PDFImage,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.width, height / image.height);
  const renderedWidth = image.width * scale;
  const renderedHeight = image.height * scale;
  page.drawImage(image, {
    x: x + (width - renderedWidth) / 2,
    y: y + (height - renderedHeight) / 2,
    width: renderedWidth,
    height: renderedHeight,
  });
}

export async function createBillingReceiptPdf(
  data: BillingReceiptDocumentData,
): Promise<BillingReceiptDocument> {
  const document = await PDFDocument.create();
  const page = document.addPage([595.28, 841.89]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const italic = await document.embedFont(StandardFonts.HelveticaBoldOblique);
  const [granada, kostation, ptSonSmart, tandatangan] = await Promise.all([
    document.embedPng(receiptAsset('granada.png')),
    document.embedPng(receiptAsset('kostation.png')),
    document.embedPng(receiptAsset('pt-son-smart.png')),
    document.embedPng(receiptAsset('tandatangan.png')),
  ]);
  const black = rgb(0, 0, 0);
  const navy = black;
  const softNavy = black;
  const terbilangRed = rgb(0.78, 0.08, 0.08);
  const muted = black;
  const border = rgb(0.79, 0.82, 0.86);
  const pageWidth = page.getWidth();

  drawContainedImage(page, granada, 34, 708, 150, 116);
  drawContainedImage(page, kostation, 214, 758, 168, 34);
  drawContainedImage(page, ptSonSmart, 465, 740, 78, 52);

  const addressLines = wrapText(
    regular,
    propertyAddressText(data.propertyName ?? 'Kostation', data.propertyAddress, ' · '),
    8,
    285,
  ).slice(0, 2);
  addressLines.forEach((line, index) => {
    const width = regular.widthOfTextAtSize(line, 8);
    page.drawText(line, {
      x: (pageWidth - width) / 2,
      y: 748 - index * 10,
      size: 8,
      font: regular,
      color: muted,
    });
  });

  page.drawLine({ start: { x: 52, y: 720 }, end: { x: 543, y: 720 }, thickness: 1.5, color: navy });
  const title =
    data.documentTitle ??
    (data.contractSettled ? 'KUITANSI PELUNASAN KONTRAK' : 'KUITANSI PEMBAYARAN SEWA KOST');
  const titleWidth = bold.widthOfTextAtSize(title, 14);
  page.drawText(title, {
    x: (pageWidth - titleWidth) / 2,
    y: 692,
    size: 14,
    font: bold,
    color: navy,
  });
  const receiptCode = `${data.documentNumberLabel ?? 'Nomor Kuitansi'} : ${data.receiptCode}`;
  const receiptCodeWidth = bold.widthOfTextAtSize(receiptCode, 9);
  page.drawText(receiptCode, {
    x: (pageWidth - receiptCodeWidth) / 2,
    y: 676,
    size: 9,
    font: bold,
    color: navy,
  });

  if (data.documentStatusNote) {
    const statusWidth = bold.widthOfTextAtSize(data.documentStatusNote, 9);
    page.drawText(data.documentStatusNote, {
      x: (pageWidth - statusWidth) / 2,
      y: 660,
      size: 9,
      font: bold,
      color: terbilangRed,
    });
  }

  const allocationText = data.allocations.length
    ? data.allocations
        .map((allocation) => `${allocation.invoiceCode} (${idr(allocation.amount)})`)
        .join(', ')
    : '';
  const paymentDescription =
    data.paymentDescription ??
    (data.contractSettled
      ? `Pelunasan Sewa Kontrak${
          data.contractRentAmount != null
            ? `\n(dari total kontrak ${idr(data.contractRentAmount)})`
            : ''
        }`
      : data.paymentPurpose === 'rent' && (data.rentPaymentSequence ?? 0) >= 2
        ? `Pembayaran Angsuran Sewa ke-${data.rentPaymentSequence}${
            data.contractRentAmount != null
              ? `\n(dari total kontrak ${idr(data.contractRentAmount)})`
              : ''
          }`
        : `${receiptPurpose[data.paymentPurpose] ?? label(data.paymentPurpose)}${
            data.contractRentAmount != null &&
            ['booking_fee', 'dp', 'down_payment', 'full_settlement'].includes(data.paymentPurpose)
              ? `\n(dari total kontrak ${idr(data.contractRentAmount)})`
              : allocationText
                ? ` · ${allocationText}`
                : ''
          }`);
  const method = paymentMethodLabel[data.paymentMethod] ?? label(data.paymentMethod);
  const partyLabel =
    data.transactionDirection === 'outgoing'
      ? 'Telah dibayarkan kepada'
      : data.transactionDirection === 'correction'
        ? 'Dikembalikan kepada'
        : 'Telah diterima dari';
  const rows: Array<[string, string]> = data.detailRows ?? [
    [partyLabel, data.residentName],
    ['Kode transaksi', data.paymentCode],
    ['Uang sejumlah', idr(data.amount)],
    ['Untuk pembayaran', paymentDescription],
    ['Tanggal pembayaran', receiptDate(data.paidAt, true)],
    [
      data.periodLabel ?? 'Periode sewa',
      receiptPeriod(data.leaseStart, data.leaseEnd, data.leaseTermMonths),
    ],
    ['Kamar No.', formatRoomDescription(data.roomNumber, data.buildingCode)],
    ['Pembayaran via', method],
  ];
  let y = data.documentStatusNote ? 626 : 642;
  for (const [labelText, value] of rows) {
    const valueLines = wrapText(regular, value, 10, 258);
    const rowHeight = Math.max(22, valueLines.length * 13 + 6);
    page.drawCircle({ x: 69, y: y - 7, size: 2.5, color: softNavy });
    page.drawText(labelText, { x: 83, y: y - 10, size: 10, font: bold, color: navy });
    page.drawText(':', { x: 223, y: y - 10, size: 10, font: regular, color: muted });
    valueLines.forEach((line, index) => {
      page.drawText(line, { x: 238, y: y - 10 - index * 13, size: 10, font: regular, color: navy });
    });
    y -= rowHeight;
  }

  const terbilangLines = wrapText(italic, terbilang(data.amount), 10, 422);
  const terbilangHeight = 34 + terbilangLines.length * 13;
  y -= 8;
  page.drawRectangle({
    x: 82,
    y: y - terbilangHeight,
    width: 432,
    height: terbilangHeight,
    borderColor: border,
    borderWidth: 1,
    color: rgb(0.98, 0.985, 0.99),
  });
  page.drawText('Terbilang:', { x: 96, y: y - 18, size: 10, font: bold, color: navy });
  terbilangLines.forEach((line, index) => {
    page.drawText(line, {
      x: 96,
      y: y - 34 - index * 13,
      size: 10,
      font: italic,
      color: terbilangRed,
    });
  });

  y -= terbilangHeight;
  if (
    data.showSettlementSummary &&
    data.contractRentAmount != null &&
    data.totalRentReceived != null &&
    data.remainingRentAmount != null
  ) {
    const summaryRows: Array<[string, string]> = [
      ['Total kontrak', idr(data.contractRentAmount)],
      ['Total telah diterima', idr(data.totalRentReceived)],
      ['Sisa pelunasan', idr(data.remainingRentAmount)],
      [
        'Batas akhir pelunasan',
        data.remainingRentAmount <= 0 ? 'Lunas' : receiptDate(data.finalSettlementDueAt ?? null),
      ],
    ];
    const summaryHeight = 18 + summaryRows.length * 15;
    y -= 10;
    page.drawRectangle({
      x: 82,
      y: y - summaryHeight,
      width: 432,
      height: summaryHeight,
      borderColor: border,
      borderWidth: 1,
      color: rgb(0.985, 0.985, 0.985),
    });
    summaryRows.forEach(([summaryLabel, summaryValue], index) => {
      const rowY = y - 18 - index * 15;
      page.drawText(summaryLabel, { x: 96, y: rowY, size: 9, font: bold, color: navy });
      page.drawText(':', { x: 223, y: rowY, size: 9, font: regular, color: muted });
      page.drawText(summaryValue, {
        x: 238,
        y: rowY,
        size: 9,
        font: summaryLabel === 'Sisa pelunasan' ? bold : regular,
        color: navy,
      });
    });
    y -= summaryHeight;
  }

  const footerY = Math.max(120, y - 92);
  const issuer = data.issuedByName?.trim() || `Pengelola ${data.propertyName ?? 'Kostation'}`;
  page.drawText('Jatinangor Sumedang,', {
    x: 52,
    y: footerY + 42,
    size: 9,
    font: regular,
    color: navy,
  });
  page.drawText('Pengelola Granada Student House by Kostation,', {
    x: 52,
    y: footerY + 28,
    size: 9,
    font: regular,
    color: navy,
  });
  drawContainedImage(page, tandatangan, 52, footerY - 72, 101, 88);
  page.drawText(issuer, { x: 52, y: footerY - 88, size: 9, font: bold, color: navy });

  const safeCode = data.receiptCode.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80) || 'kuitansi';
  return { filename: `${safeCode}.pdf`, content: Buffer.from(await document.save()) };
}

export function createContractPaidDocumentPdf(
  data: ContractPaidDocumentSnapshot,
  invalidation?: { invalidatedAt: string; reason: string } | null,
): Promise<BillingReceiptDocument> {
  const transactionReferences = data.transactionCodes.length
    ? data.transactionCodes.join(', ')
    : 'Sesuai riwayat pembayaran terverifikasi';
  const period = receiptPeriod(data.leaseStart, data.leaseEnd);

  return createBillingReceiptPdf({
    receiptCode: data.documentCode,
    paymentCode: transactionReferences,
    paymentMethod: 'other',
    paymentPurpose: 'rent',
    residentName: data.residentName,
    roomNumber: data.roomNumber,
    amount: data.contractRentAmount,
    paidAt: data.settledAt,
    issuedAt: new Date(data.issuedAt),
    allocations: [],
    propertyName: data.propertyName,
    propertyAddress: data.propertyAddress,
    buildingCode: data.buildingCode,
    issuedByName: data.issuedByName,
    leaseStart: data.leaseStart,
    leaseEnd: data.leaseEnd,
    documentTitle: 'BUKTI PELUNASAN KONTRAK SEWA',
    documentNumberLabel: 'Nomor Dokumen',
    documentStatusNote: invalidation ? 'STATUS DOKUMEN: DIBATALKAN' : undefined,
    detailRows: [
      ['Nama penghuni', data.residentName],
      ['Kamar No.', formatRoomDescription(data.roomNumber, data.buildingCode)],
      ['Periode sewa', period],
      ['Total sewa kontrak', idr(data.contractRentAmount)],
      ['Pembayaran awal', idr(data.initialRentCredit)],
      ['Pembayaran berikutnya', idr(data.additionalRentPayments)],
      ['Total pembayaran diterima', idr(data.totalRentReceived)],
      ['Penyesuaian kontrak', idr(data.contractAdjustmentAmount)],
      ['Total kewajiban lunas', idr(data.totalSettledAmount)],
      ['Sisa kewajiban', idr(data.outstandingAmount)],
      ['Status kontrak', invalidation ? 'DIBATALKAN' : 'LUNAS'],
      ['Kontrak dinyatakan lunas', receiptDateTime(data.settledAt)],
      ['Referensi transaksi', transactionReferences],
      ['Untuk pembayaran', `Pelunasan seluruh kewajiban sewa kontrak untuk periode ${period}`],
      [
        'Pernyataan',
        invalidation
          ? `Bukti pelunasan ini dibatalkan pada ${receiptDateTime(invalidation.invalidatedAt)} karena ${invalidation.reason}.`
          : `Dengan ini dinyatakan bahwa seluruh kewajiban pembayaran sewa kontrak atas ${formatRoomDescription(data.roomNumber, data.buildingCode)} untuk periode tersebut telah diterima dan dinyatakan lunas.`,
      ],
    ],
  });
}

function receiptDateTime(value: string | Date | null | undefined): string {
  if (!value) return 'Tidak tersedia';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function exitTypeLabel(value: LeaseExitOfficialDocumentSnapshot['lease']['exit_type']): string {
  return value === 'normal_expiry' ? 'Masa sewa berakhir' : 'Penghentian sewa lebih awal';
}

function yesNo(value: boolean): string {
  return value ? 'Terkonfirmasi' : 'Belum terkonfirmasi';
}

/**
 * M6 official lease-exit renderer. It intentionally shares the exact Granada,
 * Kostation, and PT Son Smart visual header with the canonical receipt. The
 * stored safe snapshot is the only data source so a later mutable-row change
 * cannot rewrite an already issued document.
 */
export async function createLeaseExitOfficialDocumentPdf(
  kind: LeaseExitOfficialDocumentKind,
  snapshot: LeaseExitOfficialDocumentSnapshot,
): Promise<BillingReceiptDocument> {
  if (kind === 'refund_receipt') {
    return createBillingReceiptPdf({
      receiptCode: snapshot.document_code,
      paymentCode:
        snapshot.refund.transaction_code ??
        snapshot.refund.external_reference ??
        snapshot.document_code,
      paymentMethod: snapshot.refund.payment_method ?? 'other',
      paymentPurpose: 'active_lease_refund',
      residentName: snapshot.resident.name,
      roomNumber: snapshot.room.number,
      amount: snapshot.settlement.final_refund_amount,
      paidAt: snapshot.refund.settled_at,
      issuedAt: new Date(snapshot.issued_at),
      allocations: [],
      documentTitle: 'BUKTI PENGEMBALIAN DANA REFUND',
      paymentDescription: `Pengembalian dana ${exitTypeLabel(snapshot.lease.exit_type).toLowerCase()} · ${snapshot.document_code}`,
      propertyName: snapshot.property.name,
      propertyAddress: snapshot.property.address,
      buildingCode: snapshot.room.building_code,
      issuedByName: snapshot.authority.checkout_confirmed_by,
      leaseStart: snapshot.lease.start_date,
      leaseEnd: snapshot.lease.planned_end_date,
      transactionDirection: 'outgoing',
    });
  }

  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const [granada, kostation, ptSonSmart, tandatangan] = await Promise.all([
    document.embedPng(receiptAsset('granada.png')),
    document.embedPng(receiptAsset('kostation.png')),
    document.embedPng(receiptAsset('pt-son-smart.png')),
    document.embedPng(receiptAsset('tandatangan.png')),
  ]);
  const black = rgb(0, 0, 0);
  const navy = black;
  const softNavy = black;
  const muted = black;
  const border = rgb(0.79, 0.82, 0.86);
  const pale = rgb(0.98, 0.985, 0.99);
  const pageWidth = 595.28;
  const title =
    kind === 'checkout_handover'
      ? snapshot.lease.exit_type === 'normal_expiry'
        ? 'BERITA ACARA SERAH TERIMA CHECK-OUT'
        : 'BERITA ACARA CHECK-OUT PENGHENTIAN DINI'
      : 'PERNYATAAN FINAL SETTLEMENT SEWA';
  let page!: PDFPage;
  let y = 0;

  const addPage = () => {
    page = document.addPage([595.28, 841.89]);
    drawContainedImage(page, granada, 34, 708, 150, 116);
    drawContainedImage(page, kostation, 214, 758, 168, 34);
    drawContainedImage(page, ptSonSmart, 465, 740, 78, 52);
    const addressLines = wrapText(
      regular,
      [snapshot.property.name, snapshot.property.address].filter(Boolean).join(' · '),
      8,
      285,
    ).slice(0, 2);
    addressLines.forEach((line, index) => {
      const width = regular.widthOfTextAtSize(line, 8);
      page.drawText(line, {
        x: (pageWidth - width) / 2,
        y: 748 - index * 10,
        size: 8,
        font: regular,
        color: muted,
      });
    });
    page.drawLine({
      start: { x: 52, y: 720 },
      end: { x: 543, y: 720 },
      thickness: 1.5,
      color: navy,
    });
    const titleWidth = bold.widthOfTextAtSize(title, 13);
    page.drawText(title, {
      x: (pageWidth - titleWidth) / 2,
      y: 692,
      size: 13,
      font: bold,
      color: navy,
    });
    const code = `Nomor Dokumen: ${snapshot.document_code}`;
    page.drawText(code, {
      x: (pageWidth - bold.widthOfTextAtSize(code, 9)) / 2,
      y: 676,
      size: 9,
      font: bold,
      color: navy,
    });
    y = 642;
  };

  const ensure = (height: number) => {
    if (y - height < 58) addPage();
  };

  const section = (text: string) => {
    ensure(34);
    page.drawRectangle({
      x: 52,
      y: y - 24,
      width: 491,
      height: 24,
      color: pale,
      borderColor: border,
      borderWidth: 0.7,
    });
    page.drawText(text, { x: 64, y: y - 16, size: 10, font: bold, color: navy });
    y -= 34;
  };

  const row = (name: string, value: string, valueColor = navy) => {
    const lines = wrapText(regular, value || '-', 9, 326);
    const height = Math.max(20, lines.length * 12 + 5);
    ensure(height);
    page.drawCircle({ x: 61, y: y - 7, size: 2, color: softNavy });
    page.drawText(name, { x: 72, y: y - 10, size: 9, font: bold, color: navy });
    page.drawText(':', { x: 205, y: y - 10, size: 9, font: regular, color: muted });
    lines.forEach((line, index) => {
      page.drawText(line, {
        x: 218,
        y: y - 10 - index * 12,
        size: 9,
        font: regular,
        color: valueColor,
      });
    });
    y -= height;
  };

  const moneyRow = (name: string, value: number) => row(name, idr(value));

  addPage();
  section('A. Identitas dokumen dan kontrak');
  row('Jenis keluar', exitTypeLabel(snapshot.lease.exit_type));
  row('Penghuni', snapshot.resident.name);
  row('Properti', snapshot.property.name);
  row('Gedung / kamar', formatRoomDescription(snapshot.room.number, snapshot.room.building_code));
  row('Kategori kamar', snapshot.room.category_name);
  row(
    'Periode kontrak',
    `${receiptDate(snapshot.lease.start_date)} s.d. ${receiptDate(snapshot.lease.planned_end_date)}`,
  );
  row('Tanggal check-out', receiptDate(snapshot.lease.actual_checkout_date, true));
  row('Versi kebijakan', snapshot.lease.policy_version);
  row('Dikonfirmasi oleh', snapshot.authority.checkout_confirmed_by);
  row('Waktu penerbitan', receiptDateTime(snapshot.issued_at));

  if (kind === 'checkout_handover') {
    section('B. Serah terima dan pemeriksaan kamar');
    row('Kunci / akses', yesNo(snapshot.handover.keys_access_confirmed));
    row('Inventaris', yesNo(snapshot.handover.inventory_confirmed));
    row('Parkir', yesNo(snapshot.handover.parking_confirmed));
    row('Pemeriksaan kamar', yesNo(snapshot.handover.inspection_confirmed));
    row('Hasil kamar', label(snapshot.room.checkout_result));
    row('Pemeriksa', snapshot.authority.inspection_recorded_by);
    row('Waktu pemeriksaan', receiptDateTime(snapshot.authority.inspection_recorded_at));

    section('B.1 Rincian inventaris');
    if (snapshot.handover.inventory_items.length === 0)
      row('Inventaris', 'Rincian item tidak tersedia pada catatan serah-terima ini.');
    snapshot.handover.inventory_items.forEach((item, index) => {
      row(
        `Item ${index + 1}`,
        `${item.name} · Seharusnya ${item.expected_quantity} · Dikembalikan ${item.returned_quantity} · ${label(item.condition)}${item.notes ? ` · ${item.notes}` : ''}`,
      );
    });

    section('B.2 Rincian kunci dan akses');
    if (snapshot.handover.key_access_items.length === 0)
      row('Kunci / akses', 'Rincian item tidak tersedia pada catatan serah-terima ini.');
    snapshot.handover.key_access_items.forEach((item, index) => {
      row(
        `Akses ${index + 1}`,
        `${item.name} · Seharusnya ${item.expected_quantity} · Dikembalikan ${item.returned_quantity} · ${label(item.status)}${item.notes ? ` · ${item.notes}` : ''}`,
      );
    });

    section('B.3 Utilitas dan meter');
    if (snapshot.handover.utility_readings.length === 0)
      row('Utilitas', 'Tidak ada pembacaan meter yang dicatat.');
    snapshot.handover.utility_readings.forEach((reading, index) => {
      row(
        `Meter ${index + 1}`,
        `${reading.utility_type}${reading.meter_number ? ` · No. ${reading.meter_number}` : ''} · ${reading.checkout_reading} ${reading.unit}${reading.outstanding_usage_notes ? ` · ${reading.outstanding_usage_notes}` : ''}`,
      );
    });
    if (snapshot.handover.notes) row('Catatan serah-terima', snapshot.handover.notes);

    section('C. Rincian temuan dan potongan');
    if (snapshot.damages.length === 0)
      row('Temuan', 'Tidak ada potongan kerusakan yang disetujui.');
    snapshot.damages.forEach((damage) => {
      row(damage.reference, `${damage.reason} · ${idr(damage.amount)}`);
    });

    section('D. Riwayat pembayaran kontrak');
    if (snapshot.payments.length === 0) row('Pembayaran', 'Belum ada pembayaran terverifikasi.');
    snapshot.payments.forEach((payment) => {
      const status = payment.payment_status === 'reversed' ? 'Dibalik/reversal' : 'Terverifikasi';
      row(
        payment.payment_code,
        `${receiptPurpose[payment.payment_purpose] ?? label(payment.payment_purpose)} · ${idr(payment.amount)} · ${receiptDateTime(payment.paid_at)} · ${paymentMethodLabel[payment.payment_method] ?? label(payment.payment_method)} · ${status}${payment.receipt_code ? ` · Kuitansi ${payment.receipt_code}` : ''}`,
      );
    });

    section('E. Pemberitahuan penghentian');
    row('Tanggal pemberitahuan', receiptDate(snapshot.notice.recorded_date));
    row('Tanggal efektif', receiptDate(snapshot.notice.effective_date));
    row(
      'Pemberitahuan',
      `${snapshot.notice.actual_days} hari dari ketentuan ${snapshot.notice.required_days} hari`,
    );
    row('Alasan', snapshot.notice.reason);
    moneyRow('Biaya notice pendek', snapshot.notice.approved_short_notice_charge);
    if (snapshot.notice.waiver_reason) row('Alasan keringanan', snapshot.notice.waiver_reason);
  }

  section(kind === 'checkout_handover' ? 'F. Ringkasan final settlement' : 'B. Perhitungan sewa');
  moneyRow('Nilai kontrak', snapshot.lease.contract_rent_amount);
  moneyRow('Pembayaran sewa terverifikasi', snapshot.settlement.verified_rent_payment_amount);
  moneyRow('Kredit invoice sebelumnya', snapshot.settlement.existing_invoice_credit_amount);
  moneyRow('Sewa yang telah menjadi hak', snapshot.settlement.earned_rent_amount);
  moneyRow('Kredit sewa belum terpakai', snapshot.settlement.rent_refundable_amount);
  moneyRow('Kredit sewa belum jatuh tempo', snapshot.settlement.unearned_invoice_credit_amount);
  moneyRow('Biaya pemberitahuan pendek', snapshot.notice.approved_short_notice_charge);
  moneyRow(
    'Sisa kewajiban sebelum offset deposit',
    snapshot.settlement.rent_amount_due_before_deposit_offset,
  );

  section(
    kind === 'checkout_handover' ? 'G. Deposit dan hasil akhir' : 'C. Deposit dan hasil akhir',
  );
  moneyRow('Security deposit awal', snapshot.settlement.deposit_liability_amount);
  moneyRow('Potongan kerusakan', snapshot.settlement.deposit_deduction_amount);
  moneyRow('Offset deposit ke kewajiban sewa', snapshot.settlement.deposit_rent_offset_amount);
  moneyRow('Deposit dapat dikembalikan', snapshot.settlement.refundable_deposit_amount);
  moneyRow('Rekomendasi refund', snapshot.settlement.recommended_refund_amount);
  moneyRow('Refund final', snapshot.settlement.final_refund_amount);
  moneyRow('Komponen refund sewa', snapshot.settlement.final_rent_refund_amount);
  moneyRow('Komponen refund deposit', snapshot.settlement.final_deposit_refund_amount);
  moneyRow('Penyesuaian Admin', snapshot.settlement.refund_adjustment_amount);
  if (snapshot.settlement.refund_adjustment_reason)
    row('Alasan penyesuaian', snapshot.settlement.refund_adjustment_reason);
  moneyRow('Sisa harus dibayar penghuni', snapshot.settlement.amount_due);
  row('Status final settlement', label(snapshot.settlement.decision_status));
  row('Status refund', snapshot.refund.status ? label(snapshot.refund.status) : 'Tidak ada refund');
  if (snapshot.refund.due_date)
    row('Target pembayaran refund', receiptDate(snapshot.refund.due_date));
  if (snapshot.refund.transaction_code)
    row('Kode transaksi refund', snapshot.refund.transaction_code);
  if (snapshot.refund.external_reference)
    row('Referensi eksternal refund', snapshot.refund.external_reference);

  section(kind === 'checkout_handover' ? 'H. Konfirmasi dan distribusi' : 'D. Ketentuan dokumen');
  row(
    'Pernyataan',
    kind === 'checkout_handover'
      ? 'Dokumen ini mencatat serah terima fisik dan merangkum final settlement yang berwenang. Kuitansi setiap pembayaran tetap tersedia sebagai dokumen terpisah.'
      : 'Pernyataan final settlement ini adalah sumber nominal yang berwenang. Kuitansi pembayaran sebelumnya tetap sah dan tidak diubah oleh dokumen ini.',
  );
  row(
    'Status lanjutan',
    snapshot.refund.status === 'pending'
      ? 'Refund masih menunggu pembayaran. Bukti pengembalian dana diterbitkan setelah pembayaran refund dicatat.'
      : snapshot.settlement.amount_due > 0
        ? 'Masih terdapat jumlah yang harus dibayar oleh penghuni.'
        : 'Kewajiban final settlement telah ditutup.',
  );

  ensure(145);
  page.drawText('Jatinangor Sumedang,', { x: 52, y: y - 8, size: 9, font: regular, color: navy });
  page.drawText('Pengelola Granada Student House by Kostation,', {
    x: 52,
    y: y - 22,
    size: 9,
    font: regular,
    color: navy,
  });
  drawContainedImage(page, tandatangan, 52, y - 114, 101, 88);
  page.drawText(snapshot.authority.checkout_confirmed_by, {
    x: 52,
    y: y - 130,
    size: 9,
    font: bold,
    color: navy,
  });

  const pages = document.getPages();
  pages.forEach((current, index) => {
    const pageNumber = `Halaman ${index + 1} dari ${pages.length}`;
    current.drawText(pageNumber, {
      x: 543 - regular.widthOfTextAtSize(pageNumber, 7.5),
      y: 30,
      size: 7.5,
      font: regular,
      color: muted,
    });
    current.drawText('Dokumen resmi dimediasi server · Waktu Asia/Jakarta', {
      x: 52,
      y: 30,
      size: 7.5,
      font: regular,
      color: muted,
    });
  });

  const safeCode =
    snapshot.document_code.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80) || 'dokumen-checkout';
  return { filename: `${safeCode}.pdf`, content: Buffer.from(await document.save()) };
}
