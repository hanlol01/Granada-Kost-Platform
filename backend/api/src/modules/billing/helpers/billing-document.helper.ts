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
  issuedByName?: string | null;
  leaseStart?: string | Date | null;
  leaseEnd?: string | Date | null;
  transactionDirection?: 'incoming' | 'outgoing' | 'correction';
  paymentDescription?: string;
};

export type BillingReceiptDocument = {
  filename: string;
  content: Buffer;
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
    settled_at: string | null;
  };
};

function ascii(value: string): string {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code <= 126 ? character : '?';
    })
    .join('')
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

function idr(value: number): string {
  return `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value)}`;
}

function label(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function createBillingInvoicePdf(data: BillingInvoiceDocumentData): BillingInvoiceDocument {
  const paidAmount = data.totalAmount - data.outstandingAmount;
  const body = [
    ['Kode invoice', data.invoiceCode],
    ['Status', label(data.invoiceStatus)],
    ['Tujuan', data.invoicePurpose === 'rent' ? 'Sewa' : 'Tagihan lainnya'],
    ['Penghuni', data.residentName],
    ['Kamar', `${data.buildingCode} / ${data.roomNumber}`],
    ['Periode', `${data.coverageStart} s.d. ${data.coverageEnd}`],
    ['Jatuh tempo', data.dueDate],
    ['Total', idr(data.totalAmount)],
    ['Sudah dialokasikan', idr(paidAmount)],
    ['Sisa', idr(data.outstandingAmount)],
    ['Diterbitkan', data.issuedAt?.toISOString() ?? 'Belum diterbitkan'],
  ];
  const commands = [
    'q 0.10 0.22 0.42 rg 36 744 523 72 re f Q',
    'BT /F1 22 Tf 1 1 1 rg 52 786 Td (INVOICE KOSTATION) Tj ET',
    `BT /F1 10 Tf 0.86 0.91 0.98 rg 52 765 Td (${ascii(data.invoiceCode)}) Tj ET`,
    'BT /F1 11 Tf 0.13 0.16 0.20 rg',
  ];
  let y = 712;
  for (const [name, value] of body) {
    commands.push(`1 0 0 1 52 ${y} Tm (${ascii(name)}) Tj`);
    commands.push(`1 0 0 1 220 ${y} Tm (${ascii(value)}) Tj`);
    y -= 32;
  }
  commands.push('ET');
  commands.push('q 0.86 0.88 0.91 RG 52 338 m 543 338 l S Q');
  commands.push(
    'BT /F1 9 Tf 0.35 0.39 0.45 rg 52 316 Td (Dokumen resmi dimediasi server - waktu Asia/Jakarta.) Tj ET',
  );
  commands.push(
    'BT /F1 9 Tf 0.35 0.39 0.45 rg 52 298 Td (Simpan dokumen ini bersama kuitansi pembayaran.) Tj ET',
  );
  const stream = commands.join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n%KOSTATION\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const safeCode = data.invoiceCode.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80) || 'invoice';
  return { filename: `${safeCode}.pdf`, content: Buffer.from(pdf, 'latin1') };
}

const receiptPurpose: Record<string, string> = {
  rent: 'Pembayaran sewa',
  dp: 'DP / uang muka sewa',
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
) {
  if (!start) return 'Sesuai alokasi tagihan';
  return `${receiptDate(start)} s.d. ${end ? receiptDate(end) : 'berjalan'}`;
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
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
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
  const [granada, kostation, ptSonSmart] = await Promise.all([
    document.embedPng(receiptAsset('granada.png')),
    document.embedPng(receiptAsset('kostation.png')),
    document.embedPng(receiptAsset('pt-son-smart.png')),
  ]);
  const navy = rgb(0.07, 0.18, 0.36);
  const softNavy = rgb(0.27, 0.3, 0.52);
  const terbilangRed = rgb(0.78, 0.08, 0.08);
  const muted = rgb(0.35, 0.39, 0.47);
  const border = rgb(0.79, 0.82, 0.86);
  const pageWidth = page.getWidth();

  drawContainedImage(page, granada, 34, 724, 150, 88);
  drawContainedImage(page, kostation, 214, 758, 168, 34);
  drawContainedImage(page, ptSonSmart, 465, 740, 78, 52);

  const addressLines = wrapText(
    regular,
    [data.propertyName ?? 'Kostation', data.propertyAddress].filter(Boolean).join(' · '),
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
  const receiptCode = `Nomor Kwitansi: ${data.receiptCode}`;
  const receiptCodeWidth = bold.widthOfTextAtSize(receiptCode, 9);
  page.drawText(receiptCode, {
    x: (pageWidth - receiptCodeWidth) / 2,
    y: 676,
    size: 9,
    font: bold,
    color: navy,
  });

  const allocationText = data.allocations.length
    ? data.allocations
        .map((allocation) => `${allocation.invoiceCode} (${idr(allocation.amount)})`)
        .join(', ')
    : '';
  const paymentDescription =
    data.paymentDescription ??
    (data.contractSettled
      ? 'Pelunasan kontrak sewa'
      : `${receiptPurpose[data.paymentPurpose] ?? label(data.paymentPurpose)}${
          allocationText ? ` · ${allocationText}` : ''
        }`);
  const method = paymentMethodLabel[data.paymentMethod] ?? label(data.paymentMethod);
  const partyLabel =
    data.transactionDirection === 'outgoing'
      ? 'Telah dibayarkan kepada'
      : data.transactionDirection === 'correction'
        ? 'Koreksi pembayaran milik'
        : 'Telah diterima dari';
  const rows: Array<[string, string]> = [
    [partyLabel, data.residentName],
    ['Uang sejumlah', idr(data.amount)],
    ['Untuk pembayaran', paymentDescription],
    ['Tanggal pembayaran', receiptDate(data.paidAt, true)],
    ['Periode sewa', receiptPeriod(data.leaseStart, data.leaseEnd)],
    ['Kamar No.', data.roomNumber],
    ['Pembayaran via', method],
  ];
  let y = 642;
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

  const terbilangLines = wrapText(bold, terbilang(data.amount), 10, 422);
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
      font: bold,
      color: terbilangRed,
    });
  });

  const footerY = Math.max(102, y - terbilangHeight - 72);
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
  drawContainedImage(page, kostation, 52, footerY - 4, 100, 22);
  page.drawText(`(${issuer})`, { x: 52, y: footerY - 18, size: 9, font: bold, color: navy });

  const safeCode = data.receiptCode.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80) || 'kuitansi';
  return { filename: `${safeCode}.pdf`, content: Buffer.from(await document.save()) };
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
      paymentCode: snapshot.refund.external_reference ?? snapshot.document_code,
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
      issuedByName: snapshot.authority.checkout_confirmed_by,
      leaseStart: snapshot.lease.start_date,
      leaseEnd: snapshot.lease.planned_end_date,
      transactionDirection: 'outgoing',
    });
  }

  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const [granada, kostation, ptSonSmart] = await Promise.all([
    document.embedPng(receiptAsset('granada.png')),
    document.embedPng(receiptAsset('kostation.png')),
    document.embedPng(receiptAsset('pt-son-smart.png')),
  ]);
  const navy = rgb(0.07, 0.18, 0.36);
  const softNavy = rgb(0.27, 0.3, 0.52);
  const muted = rgb(0.35, 0.39, 0.47);
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
    drawContainedImage(page, granada, 34, 724, 150, 88);
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
  row('Gedung / kamar', `${snapshot.room.building_code} / ${snapshot.room.number}`);
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
  if (snapshot.refund.external_reference)
    row('Referensi refund', snapshot.refund.external_reference);

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

  ensure(92);
  page.drawText('Jatinangor Sumedang,', { x: 52, y: y - 8, size: 9, font: regular, color: navy });
  page.drawText('Pengelola Granada Student House by Kostation,', {
    x: 52,
    y: y - 22,
    size: 9,
    font: regular,
    color: navy,
  });
  drawContainedImage(page, kostation, 52, y - 55, 100, 22);
  page.drawText(`(${snapshot.authority.checkout_confirmed_by})`, {
    x: 52,
    y: y - 70,
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
