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
  paidAt: Date | null;
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
};

export type BillingReceiptDocument = {
  filename: string;
  content: Buffer;
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
  const paymentDescription = data.contractSettled
    ? 'Pelunasan kontrak sewa'
    : `${receiptPurpose[data.paymentPurpose] ?? label(data.paymentPurpose)}${
        allocationText ? ` · ${allocationText}` : ''
      }`;
  const method = data.paymentMethod === 'cash' ? 'Tunai' : 'Transfer bank';
  const rows: Array<[string, string]> = [
    ['Telah diterima dari', data.residentName],
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
