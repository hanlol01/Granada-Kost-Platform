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
