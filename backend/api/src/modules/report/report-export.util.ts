import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFImage, PDFPage, rgb } from 'pdf-lib';
import type { ReportResult, ReportScalar } from './report.types';

const safeCell = (value: ReportScalar): string => {
  const text = value === null ? '' : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};

const xml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!,
  );

const columnName = (index: number): string => {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
};

type Sheet = { name: string; rows: ReportScalar[][] };

const ownerStatusLabels: Record<string, string> = {
  not_prepared: 'Belum disiapkan',
  draft: 'Draft',
  awaiting_review: 'Menunggu pemeriksaan',
  approved: 'Disetujui',
  submitted_to_finance: 'Diajukan ke keuangan',
  awaiting_transfer: 'Menunggu transfer',
  partially_realized: 'Transfer sebagian',
  realized: 'Sudah ditransfer',
  published_to_owner: 'Diterbitkan ke Owner',
  void: 'Dibatalkan',
};
const ownerSummaryLabels: Record<string, string> = {
  eligible_contract_total: 'Total kontrak layak',
  management_fee_total: 'Total management fee',
  realization_total: 'Hak Owner direalisasikan',
  transferred_total: 'Dana sudah ditransfer',
  total_not_eligible: 'Total data tidak layak',
  outstanding_contract_rent: 'Kontrak masih outstanding',
  owner_sponsored_excluded: 'Hunian tanggungan Owner',
  total_contract_rent: 'Total kontrak sewa',
  management_fee: 'Management fee',
  corrections: 'Penyesuaian',
  net_realization: 'Hak Owner',
  transferred: 'Sudah ditransfer',
};
const rupiah = (value: ReportScalar): string => {
  const amount = Number(value ?? 0);
  return `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0)}`;
};
const parseReportDate = (value: string): Date | null => {
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, 1));
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};
const formatDate = (value: string): string => {
  const date = parseReportDate(value);
  return date
    ? new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date)
    : value || '—';
};
const formatPeriod = (fromValue: string, toValue: string): string => {
  const from = parseReportDate(fromValue);
  const to = parseReportDate(toValue);
  if (!from || !to) return fromValue || toValue ? `${fromValue} s.d. ${toValue}` : 'Semua periode';
  const monthYear = new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(from);
  return from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear()
    ? `${monthYear} · ${from.getUTCDate()}–${to.getUTCDate()} ${monthYear}`
    : `${formatDate(fromValue)} s.d. ${formatDate(toValue)}`;
};
export const formatOwnerMonthYear = (value: string): string => {
  const date = parseReportDate(value);
  return date
    ? new Intl.DateTimeFormat('id-ID', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date)
    : '—';
};
const documentPropertyNameAliases: Record<string, string> = {
  'Granada Student House Jatinangor': 'Granada Student House 1 Jatinangor',
};
export const formatDocumentPropertyName = (value: string): string => {
  const normalized = value.trim();
  return documentPropertyNameAliases[normalized] ?? (normalized || '—');
};
const formatIssuedAt = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value || '—'
    : `${new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(date)} WIB`;
};
const formatReportDate = (value: ReportScalar): string => {
  const raw = String(value ?? '');
  if (!raw) return '—';
  return formatDate(raw.slice(0, 10));
};

function propertyOwnerSheets(report: ReportResult): Sheet[] {
  const notEligible =
    report.title.toLowerCase().includes('tidak layak') ||
    report.rows.some((row) => 'reason' in row);
  const summary: ReportScalar[][] = [
    ['Laporan', report.title],
    ['Properti', formatDocumentPropertyName(report.property_name)],
    ['Periode', formatOwnerMonthYear(report.period.date_from)],
    ['Diterbitkan', formatIssuedAt(report.generated_at)],
    ...(report.generated_by ? [['Diterbitkan oleh', report.generated_by] as ReportScalar[]] : []),
    ...(report.filter_summary?.map(
      ([label, value]) =>
        [
          label,
          label === 'Status' ? (ownerStatusLabels[String(value)] ?? value) : value,
        ] as ReportScalar[],
    ) ?? []),
    ['Jumlah data', report.meta.total],
  ];
  Object.entries(report.summary).forEach(([key, value]) => {
    const label = ownerSummaryLabels[key] ?? key;
    const money = [
      'eligible_contract_total',
      'management_fee_total',
      'realization_total',
      'transferred_total',
      'total_contract_rent',
      'management_fee',
      'corrections',
      'net_realization',
      'transferred',
    ].includes(key);
    summary.push([label, money ? rupiah(value) : value]);
  });
  const detailReport = report.title.startsWith('Realisasi Owner ');
  if (detailReport) {
    const header = [
      'No.',
      'Kamar',
      'Nama penghuni',
      'Nama Owner',
      'No. Kavling',
      'Durasi sewa',
      'Jenis tarif',
      'Uang diterima',
      'Total sewa',
      'Outstanding',
      'Management fee',
      'Hak Owner',
      'Status realisasi',
      'Tanggal pelunasan',
      'Check-in',
      'Check-out',
    ];
    const rows = report.rows.map(
      (row, index) =>
        [
          row.line_status === 'total' ? 'TOTAL' : index + 1,
          row.room,
          row.resident,
          row.owner,
          row.plot_number,
          row.line_status === 'total'
            ? ''
            : row.duration_months
              ? `${row.duration_months} bulan`
              : '—',
          row.line_status === 'total'
            ? ''
            : row.rate_type === 'negotiated'
              ? 'Tarif kesepakatan'
              : 'Tarif standar',
          rupiah(row.money_received),
          rupiah(row.contract_total),
          rupiah(row.outstanding),
          rupiah(row.management_fee),
          rupiah(row.net_realization),
          ownerStatusLabels[String(row.realization_status)] ?? row.realization_status,
          row.line_status === 'total' ? '' : formatReportDate(row.paid_in_full_at),
          row.line_status === 'total' ? '' : formatReportDate(row.check_in),
          row.line_status === 'total' ? '' : formatReportDate(row.check_out),
        ] as ReportScalar[],
    );
    return [
      { name: 'Ringkasan', rows: summary },
      { name: 'Rincian kontrak', rows: [header, ...rows] },
      ...(report.additional_sheets ?? []),
    ];
  }
  if (notEligible) {
    const header = [
      'No.',
      'Nama Owner',
      'No. Kamar',
      'No. Kavling',
      'Nama Penghuni',
      'Total kontrak',
      'Alasan tidak layak',
    ];
    const rows = report.rows.map(
      (row, index) =>
        [
          index + 1,
          row.owner,
          row.room,
          row.plot_number,
          row.resident,
          rupiah(row.total_contract),
          row.reason,
        ] as ReportScalar[],
    );
    if (!rows.length) rows.push(['', 'Tidak ada data sesuai filter', '', '', '', '', '']);
    rows.push([
      'TOTAL',
      '',
      '',
      '',
      '',
      rupiah(report.rows.reduce((sum, row) => sum + Number(row.total_contract ?? 0), 0)),
      `${report.rows.length} data`,
    ]);
    return [
      { name: 'Ringkasan', rows: summary },
      { name: 'Rincian', rows: [header, ...rows] },
      ...(report.additional_sheets ?? []),
    ];
  }
  const header = [
    'No.',
    'Nama Owner',
    'Owner dan aset',
    'Kontrak lunas',
    'Total sewa',
    'Management fee',
    'Hak Owner',
    'Sudah ditransfer',
    'Status realisasi',
    'Sumber data',
  ];
  const rows = report.rows.map(
    (row, index) =>
      [
        index + 1,
        row.owner,
        row.owner_assets,
        row.eligible_contract_count,
        rupiah(row.total_contract_rent),
        rupiah(row.management_fee),
        rupiah(row.owner_realization),
        rupiah(row.transferred),
        ownerStatusLabels[String(row.status)] ?? row.status,
        String(row.entry_kind) === 'system' ? 'Data sistem' : 'Input historis manual',
      ] as ReportScalar[],
  );
  if (!rows.length) rows.push(['', 'Tidak ada data sesuai filter', '', '', '', '', '', '', '', '']);
  rows.push([
    'TOTAL',
    '',
    '',
    report.rows.reduce((sum, row) => sum + Number(row.eligible_contract_count ?? 0), 0),
    rupiah(report.rows.reduce((sum, row) => sum + Number(row.total_contract_rent ?? 0), 0)),
    rupiah(report.rows.reduce((sum, row) => sum + Number(row.management_fee ?? 0), 0)),
    rupiah(report.rows.reduce((sum, row) => sum + Number(row.owner_realization ?? 0), 0)),
    rupiah(report.rows.reduce((sum, row) => sum + Number(row.transferred ?? 0), 0)),
    '',
    '',
  ]);
  return [
    { name: 'Ringkasan', rows: summary },
    { name: 'Rincian', rows: [header, ...rows] },
    ...(report.additional_sheets ?? []),
  ];
}

export type OwnerRealizationReceiptPdf = {
  receiptNumber: string;
  realizationReference: string;
  propertyName: string;
  ownerName: string;
  issuerName: string;
  period: string;
  transferDate: string;
  transferMethod: string;
  transferReference: string;
  evidenceReference?: string;
  destinationBank: string;
  destinationAccount: string;
  destinationHolder: string;
  transferAmount: number;
  totalContractRent: number;
  managementFee: number;
  correction: number;
  cumulativeTransfer: number;
  remainingTransfer: number;
  amountInWords: string;
  issuerSignature?: Buffer;
  lines: Array<{
    room: string;
    resident: string;
    plotNumber: string;
    contractTotal: number;
    managementFee: number;
    ownerEntitlement: number;
  }>;
};

export type OwnerFinanceRequestRow = {
  tenantName: string;
  roomCode: string;
  ownerName: string;
  plotNumber: string;
  durationMonths: number;
  totalRent: number;
  realizationAmount: number;
  accountNumber: string;
  bankName: string;
  accountHolder: string;
  ownerTotalRealization: number;
};

export type OwnerFinanceRequestDocument = {
  period: string;
  propertyName: string;
  departmentUnit: string;
  requestedAt: string;
  address: string;
  rows: OwnerFinanceRequestRow[];
  signatories: Array<{
    role: 'manager' | 'dbo' | 'director';
    label: 'Dibuat oleh' | 'Mengetahui' | 'Menyetujui';
    name: string;
    title: string;
    signature?: Buffer;
  }>;
};

/**
 * Finance's form deliberately shares the established Billing document assets.
 * Keeping the lookup local avoids making the report module depend on Billing's
 * private renderer, while the rendered brand header stays visually identical.
 */
const financeDocumentAsset = (name: string): Buffer => {
  const candidates = [
    join(__dirname, '..', 'billing', 'assets', name),
    join(process.cwd(), 'src', 'modules', 'billing', 'assets', name),
    join(process.cwd(), 'backend', 'api', 'src', 'modules', 'billing', 'assets', name),
    join(process.cwd(), 'apps', 'admin', 'public', 'images', 'brand', name),
    join(process.cwd(), '..', '..', 'apps', 'admin', 'public', 'images', 'brand', name),
  ];
  const asset = candidates.find((candidate) => existsSync(candidate));
  if (!asset) throw new Error(`Aset dokumen ${name} tidak ditemukan.`);
  return readFileSync(asset);
};

const drawContainedPdfImage = (
  page: PDFPage,
  image: PDFImage,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  const scale = Math.min(width / image.width, height / image.height);
  const renderedWidth = image.width * scale;
  const renderedHeight = image.height * scale;
  page.drawImage(image, {
    x: x + (width - renderedWidth) / 2,
    y: y + (height - renderedHeight) / 2,
    width: renderedWidth,
    height: renderedHeight,
  });
};

function sheets(report: ReportResult): Sheet[] {
  if (report.report_type === 'property-owners') return propertyOwnerSheets(report);
  const detailKeys = Object.keys(report.rows[0] ?? {});
  return [
    {
      name: 'Ringkasan',
      rows: [
        ['Laporan', report.title],
        ['Properti', formatDocumentPropertyName(report.property_name)],
        ['Periode', `${report.period.date_from} s.d. ${report.period.date_to}`],
        ['Dibuat', report.generated_at],
        ['Checksum filter', report.filter_checksum],
        ['Metodologi', report.methodology],
        ...Object.entries(report.summary).map(([key, value]) => [key, value]),
      ],
    },
    {
      name: 'Rincian',
      rows: [detailKeys, ...report.rows.map((row) => detailKeys.map((key) => row[key] ?? null))],
    },
    ...(report.additional_sheets ?? []),
  ];
}

function zip(files: Array<[string, string]>): Buffer {
  const crc32 = (buffer: Buffer) => {
    let crc = 0xffffffff;
    for (const byte of buffer) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(content);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuffer.length, 26);
    local.push(header, nameBuffer, data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(nameBuffer.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, nameBuffer);
    offset += header.length + nameBuffer.length + data.length;
  }
  const centralSize = central.reduce((sum, buffer) => sum + buffer.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

export function reportToXlsx(report: ReportResult): Buffer {
  const reportSheets = sheets(report);
  const worksheet = (rows: ReportScalar[][]) =>
    `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
      .map(
        (row, rowIndex) =>
          `<row r="${rowIndex + 1}">${row
            .map((cell, columnIndex) => {
              const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
              return typeof cell === 'number'
                ? `<c r="${reference}"><v>${cell}</v></c>`
                : `<c r="${reference}" t="inlineStr"><is><t>${xml(safeCell(cell))}</t></is></c>`;
            })
            .join('')}</row>`,
      )
      .join('')}</sheetData></worksheet>`;
  const overrides = reportSheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');
  return zip([
    [
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`,
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${reportSheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${reportSheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`,
    ],
    ...reportSheets.map((sheet, index): [string, string] => [
      `xl/worksheets/sheet${index + 1}.xml`,
      worksheet(sheet.rows),
    ]),
  ]);
}

export async function reportToPdf(report: ReportResult): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [font, bold] = await Promise.all([
    pdf.embedFont(
      readFileSync(require.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff')),
      { subset: true },
    ),
    pdf.embedFont(
      readFileSync(require.resolve('@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff')),
      { subset: true },
    ),
  ]);
  // A3 landscape keeps the official realization-history table legible even
  // when it contains all 16 columns required by Finance and Operations.
  const pageWidth = 1190;
  const pageHeight = 842;
  const margin = 34;
  const bodyColor = rgb(0.08, 0.1, 0.14);
  const mutedColor = rgb(0.35, 0.4, 0.46);
  let page = pdf.addPage([pageWidth, pageHeight]);
  let pageNumber = 1;
  let y = pageHeight - margin;
  const isMoneyLabel = (label: string) =>
    /(amount|uang|money|rent|sewa|fee|outstanding|transfer|transferred|realisasi|realization|entitlement|hak|contract_total|net)/i.test(
      label,
    );
  const displayValue = (value: ReportScalar, label = '') => {
    if (typeof value === 'number' && isMoneyLabel(label))
      return `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value)}`;
    return safeCell(value);
  };

  const wrap = (value: string, maxWidth: number, size: number, maxLines = 4) => {
    const paragraphs = value.split(/\r?\n/);
    const lines: string[] = [];
    let current = '';
    const pushWord = (word: string) => {
      if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
      const segments: string[] = [];
      let segment = '';
      for (const character of word) {
        if (segment && font.widthOfTextAtSize(`${segment}${character}`, size) > maxWidth) {
          segments.push(segment);
          segment = character;
        } else segment += character;
      }
      if (segment) segments.push(segment);
      return segments;
    };
    paragraphs.forEach((paragraph, paragraphIndex) => {
      for (const originalWord of paragraph.trim().split(/\s+/).filter(Boolean)) {
        for (const word of pushWord(originalWord)) {
          const candidate = current ? `${current} ${word}` : word;
          if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
          else {
            lines.push(current);
            current = word;
          }
        }
      }
      if (current) {
        lines.push(current);
        current = '';
      } else if (paragraphIndex < paragraphs.length - 1) lines.push('');
    });
    if (!lines.length) return ['—'];
    if (lines.length <= maxLines) return lines;
    const visible = lines.slice(0, maxLines);
    let last = visible[maxLines - 1];
    while (last.length > 1 && font.widthOfTextAtSize(`${last}…`, size) > maxWidth)
      last = last.slice(0, -1);
    visible[maxLines - 1] = `${last}…`;
    return visible;
  };
  const footer = () => {
    page.drawLine({
      start: { x: margin, y: 23 },
      end: { x: pageWidth - margin, y: 23 },
      thickness: 0.45,
      color: rgb(0.78, 0.82, 0.87),
    });
    page.drawText(`Dokumen KOSTATION · ${formatDocumentPropertyName(report.property_name)}`, {
      x: margin,
      y: 10,
      size: 6.6,
      font,
      color: mutedColor,
    });
    page.drawText(`Halaman ${pageNumber}`, {
      x: pageWidth - margin - 48,
      y: 10,
      size: 6.6,
      font,
      color: mutedColor,
    });
  };
  const drawPageHeading = (continued = false) => {
    page.drawText(report.title, {
      x: margin,
      y,
      size: 15,
      font: bold,
      color: rgb(0.03, 0.2, 0.34),
    });
    y -= 19;
    const reference =
      report.report_type === 'property-owners' && report.title.startsWith('Realisasi Owner ')
        ? report.filter_summary?.find(([label]) => label === 'Referensi realisasi')?.[1]
        : undefined;
    if (reference) {
      page.drawText(String(reference), { x: margin, y, size: 8, font: bold, color: mutedColor });
      y -= 15;
    }
    const displayPeriod =
      report.report_type === 'property-owners'
        ? formatOwnerMonthYear(report.period.date_from)
        : formatPeriod(report.period.date_from, report.period.date_to);
    page.drawText(
      `${formatDocumentPropertyName(report.property_name)} · ${displayPeriod}${continued ? ' · lanjutan' : ''}`,
      { x: margin, y, size: 7.6, font, color: mutedColor },
    );
    y -= 20;
  };
  const addPage = () => {
    footer();
    page = pdf.addPage([pageWidth, pageHeight]);
    pageNumber += 1;
    y = pageHeight - margin;
    drawPageHeading(true);
  };
  const ensure = (height: number) => {
    if (y - height < 44) addPage();
  };
  const section = (label: string) => {
    ensure(26);
    page.drawText(label.toUpperCase(), {
      x: margin,
      y,
      size: 8.5,
      font: bold,
      color: rgb(0.04, 0.31, 0.53),
    });
    y -= 17;
  };
  const renderKeyValue = (rows: ReportScalar[][]) => {
    rows.forEach((row) => {
      const label = safeCell(row[0] ?? '');
      const value =
        row
          .slice(1)
          .map((cell) => displayValue(cell, label))
          .join(' · ') || '—';
      const lines = wrap(value, pageWidth - margin * 2 - 245, 8.1, 3);
      ensure(Math.max(18, lines.length * 10 + 5));
      page.drawText(label, { x: margin, y, size: 8.1, font: bold, color: bodyColor });
      lines.forEach((line, index) =>
        page.drawText(line, {
          x: margin + 238,
          y: y - index * 10,
          size: 8.1,
          font,
          color: bodyColor,
        }),
      );
      y -= Math.max(18, lines.length * 10 + 5);
    });
  };
  const renderTable = (rows: ReportScalar[][]) => {
    const [header = [], ...body] = rows;
    if (!header.length) return;
    const availableWidth = pageWidth - margin * 2;
    const weights = header.map((value) => {
      const label = safeCell(value).toLowerCase();
      if (/(no\.?|status|jenis|tarif|kamar|kavling)/.test(label)) return 0.75;
      if (/(nama|penghuni|owner|periode|check)/.test(label)) return 1.35;
      if (/(uang|total|fee|outstanding|transfer|pelunasan|realisasi)/.test(label)) return 1.05;
      return 1;
    });
    const weightTotal = weights.reduce((total, weight) => total + weight, 0);
    const widths = weights.map((weight) => (availableWidth * weight) / weightTotal);
    const positions = widths.reduce<number[]>((values, width, index) => {
      values.push(index === 0 ? margin : values[index - 1] + widths[index - 1]);
      return values;
    }, []);
    const headerFontSize = header.length > 11 ? 5.7 : header.length > 7 ? 6.4 : 7.2;
    const bodyFontSize = header.length > 11 ? 5.8 : header.length > 7 ? 6.6 : 7.4;
    const renderHeader = () => {
      const headerLines = header.map((value, index) =>
        wrap(safeCell(value), widths[index] - 8, headerFontSize, 2),
      );
      const height =
        Math.max(...headerLines.map((lines) => lines.length), 1) * (headerFontSize + 2) + 10;
      ensure(height + 3);
      page.drawRectangle({
        x: margin,
        y: y - height,
        width: availableWidth,
        height,
        color: rgb(0.05, 0.31, 0.48),
      });
      headerLines.forEach((lines, index) =>
        lines.forEach((line, lineIndex) =>
          page.drawText(line, {
            x: positions[index] + 4,
            y: y - 8 - lineIndex * (headerFontSize + 2),
            size: headerFontSize,
            font: bold,
            color: rgb(1, 1, 1),
          }),
        ),
      );
      y -= height + 2;
    };
    renderHeader();
    body.forEach((row, rowIndex) => {
      const isTotalRow = String(row[0] ?? '').toUpperCase() === 'TOTAL';
      const cells = header.map((column, index) =>
        wrap(
          displayValue(row[index] ?? '', safeCell(column)),
          widths[index] - 8,
          bodyFontSize,
          /(owner|aset)/i.test(safeCell(column)) ? 8 : 4,
        ),
      );
      const rowHeight = Math.max(...cells.map((lines) => lines.length), 1) * (bodyFontSize + 2) + 9;
      if (y - rowHeight < 44) {
        addPage();
        section('Rincian (lanjutan)');
        renderHeader();
      }
      page.drawRectangle({
        x: margin,
        y: y - rowHeight,
        width: availableWidth,
        height: rowHeight,
        color: isTotalRow
          ? rgb(0.91, 0.96, 0.99)
          : rowIndex % 2 === 0
            ? rgb(0.98, 0.99, 1)
            : rgb(1, 1, 1),
        borderColor: rgb(0.85, 0.88, 0.91),
        borderWidth: 0.3,
      });
      cells.forEach((lines, index) =>
        lines.forEach((line, lineIndex) =>
          page.drawText(line, {
            x: positions[index] + 4,
            y: y - 7 - lineIndex * (bodyFontSize + 2),
            size: bodyFontSize,
            font: isTotalRow ? bold : font,
            color: bodyColor,
          }),
        ),
      );
      y -= rowHeight;
    });
    y -= 12;
  };

  drawPageHeading();
  for (const sheet of sheets(report)) {
    section(sheet.name);
    if (sheet.rows[0]?.length <= 2) renderKeyValue(sheet.rows);
    else renderTable(sheet.rows);
    y -= 6;
  }
  footer();
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

/**
 * A dedicated, paginated receipt renderer. It deliberately works only from
 * the immutable realization document snapshot supplied by the caller.
 */
export async function ownerRealizationReceiptToPdf(
  receipt: OwnerRealizationReceiptPdf,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [font, bold] = await Promise.all([
    pdf.embedFont(
      readFileSync(require.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff')),
      { subset: true },
    ),
    pdf.embedFont(
      readFileSync(require.resolve('@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff')),
      { subset: true },
    ),
  ]);
  const ownerSignatureImage = receipt.issuerSignature
    ? await pdf
        .embedPng(receipt.issuerSignature)
        .catch(() => pdf.embedJpg(receipt.issuerSignature!))
    : null;
  const width = 595.28;
  const height = 841.89;
  const margin = 42;
  const money = (value: number) => `Rp ${new Intl.NumberFormat('id-ID').format(value)}`;
  const short = (value: string, max: number) =>
    value.length > max ? `${value.slice(0, max - 1)}…` : value;
  const wrap = (value: string, maxWidth: number, size: number, maxLines = 3) => {
    const words = value.trim().split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !currentLine) {
        currentLine = candidate;
        continue;
      }
      lines.push(currentLine);
      currentLine = word;
    }
    if (currentLine) lines.push(currentLine);
    if (lines.length <= maxLines) return lines.length ? lines : ['—'];
    const visible = lines.slice(0, maxLines);
    let last = visible[maxLines - 1];
    while (last.length > 1 && font.widthOfTextAtSize(`${last}…`, size) > maxWidth)
      last = last.slice(0, -1);
    visible[maxLines - 1] = `${last}…`;
    return visible;
  };
  const pages: Array<{ page: ReturnType<PDFDocument['addPage']>; y: number }> = [];
  const addPage = () => {
    const page = pdf.addPage([width, height]);
    pages.push({ page, y: height - margin });
    return pages[pages.length - 1];
  };
  let current = addPage();
  const footer = (entry: (typeof pages)[number], number: number) => {
    entry.page.drawLine({
      start: { x: margin, y: 30 },
      end: { x: width - margin, y: 30 },
      thickness: 0.45,
      color: rgb(0.78, 0.82, 0.87),
    });
    entry.page.drawText(`Kuitansi Realisasi Hak Owner · ${receipt.receiptNumber}`, {
      x: margin,
      y: 17,
      size: 6.5,
      font,
      color: rgb(0.36, 0.41, 0.47),
    });
    entry.page.drawText(`Halaman ${number}`, {
      x: width - margin - 45,
      y: 17,
      size: 6.5,
      font,
      color: rgb(0.36, 0.41, 0.47),
    });
  };
  const need = (heightNeeded: number) => {
    if (current.y - heightNeeded < 48) current = addPage();
  };
  const line = (x: number, label: string, value: string, valueX = x + 138) => {
    need(19);
    current.page.drawText(label, {
      x,
      y: current.y,
      size: 8.3,
      font,
      color: rgb(0.28, 0.33, 0.39),
    });
    current.page.drawText(short(value, 52), {
      x: valueX,
      y: current.y,
      size: 8.3,
      font: bold,
      color: rgb(0.07, 0.11, 0.16),
    });
    current.y -= 18;
  };
  const section = (label: string) => {
    need(27);
    current.page.drawText(label.toUpperCase(), {
      x: margin,
      y: current.y,
      size: 7.8,
      font: bold,
      color: rgb(0.04, 0.31, 0.53),
    });
    current.y -= 17;
  };

  current.page.drawText(`Realisasi Owner ${receipt.ownerName}`, {
    x: margin,
    y: current.y,
    size: 22,
    font: bold,
    color: rgb(0.03, 0.16, 0.29),
  });
  current.page.drawText('KUITANSI REALISASI HAK OWNER', {
    x: margin,
    y: current.y - 18,
    size: 10,
    font: bold,
    color: rgb(0.04, 0.31, 0.53),
  });
  current.page.drawText(`No. Kuitansi: ${receipt.receiptNumber}`, {
    x: width - margin - 204,
    y: current.y - 4,
    size: 8.5,
    font: bold,
    color: rgb(0.07, 0.11, 0.16),
  });
  current.page.drawText(`Referensi: ${receipt.realizationReference}`, {
    x: width - margin - 204,
    y: current.y - 20,
    size: 7.5,
    font,
    color: rgb(0.35, 0.4, 0.46),
  });
  current.y -= 52;
  current.page.drawLine({
    start: { x: margin, y: current.y },
    end: { x: width - margin, y: current.y },
    thickness: 0.8,
    color: rgb(0.14, 0.43, 0.68),
  });
  current.y -= 20;

  section('Penerima dan periode');
  line(margin, 'Dibayarkan kepada', receipt.ownerName);
  line(margin, 'Properti', formatDocumentPropertyName(receipt.propertyName));
  line(margin, 'Periode realisasi', receipt.period);
  current.y -= 6;

  need(98);
  const boxTop = current.y;
  current.page.drawRectangle({
    x: margin,
    y: boxTop - 82,
    width: width - margin * 2,
    height: 82,
    color: rgb(0.95, 0.98, 1),
    borderColor: rgb(0.71, 0.83, 0.93),
    borderWidth: 0.7,
  });
  current.page.drawText('JUMLAH TRANSFER PADA KUITANSI INI', {
    x: margin + 14,
    y: boxTop - 18,
    size: 7.4,
    font: bold,
    color: rgb(0.04, 0.31, 0.53),
  });
  current.page.drawText(money(receipt.transferAmount), {
    x: margin + 14,
    y: boxTop - 43,
    size: 19,
    font: bold,
    color: rgb(0.03, 0.16, 0.29),
  });
  current.page.drawText(`Terbilang: ${short(receipt.amountInWords, 74)}`, {
    x: margin + 14,
    y: boxTop - 65,
    size: 8.2,
    font,
    color: rgb(0.17, 0.22, 0.28),
  });
  current.y -= 100;

  section('Rincian perhitungan');
  const summaryRows: Array<[string, number]> = [
    ['Total sewa kontrak yang direalisasikan', receipt.totalContractRent],
    ['Total management fee', receipt.managementFee],
    ['Penyesuaian tercatat', receipt.correction],
    [
      'Hak Owner realisasi ini',
      receipt.totalContractRent - receipt.managementFee + receipt.correction,
    ],
    ['Transfer kumulatif', receipt.cumulativeTransfer],
    ['Sisa Realisasi', receipt.remainingTransfer],
  ];
  for (const [label, value] of summaryRows) {
    need(18);
    current.page.drawText(label, {
      x: margin,
      y: current.y,
      size: 8.4,
      font,
      color: rgb(0.18, 0.23, 0.29),
    });
    current.page.drawText(money(value), {
      x: width - margin - 120,
      y: current.y,
      size: 8.4,
      font: bold,
      color: rgb(0.05, 0.1, 0.15),
    });
    current.y -= 17;
  }
  current.y -= 10;

  section('Rincian kontrak yang direalisasikan');
  const tableHeaders = ['No.', 'Kamar / penghuni', 'Total sewa', 'Fee', 'Hak Owner'];
  const columns = [margin, margin + 28, margin + 250, margin + 336, margin + 406];
  const renderHeader = () => {
    need(22);
    current.page.drawRectangle({
      x: margin,
      y: current.y - 17,
      width: width - margin * 2,
      height: 20,
      color: rgb(0.05, 0.31, 0.48),
    });
    tableHeaders.forEach((header, index) =>
      current.page.drawText(header, {
        x: columns[index] + 5,
        y: current.y - 10,
        size: 6.8,
        font: bold,
        color: rgb(1, 1, 1),
      }),
    );
    current.y -= 22;
  };
  renderHeader();
  receipt.lines.forEach((row, index) => {
    const residentLines = wrap(
      `${row.room} · ${row.resident}`,
      columns[2] - columns[1] - 10,
      7.1,
      2,
    );
    const plotLine = `No. Kavling ${row.plotNumber || '—'}`;
    const rowHeight = Math.max(35, residentLines.length * 9 + 20);
    if (current.y - rowHeight - 3 < 48) {
      current = addPage();
      current.y -= 4;
      section('Rincian kontrak yang direalisasikan (lanjutan)');
      renderHeader();
    }
    const shade = index % 2 === 0 ? rgb(0.98, 0.99, 1) : rgb(1, 1, 1);
    const middle = current.y - rowHeight / 2 - 2;
    current.page.drawRectangle({
      x: margin,
      y: current.y - rowHeight,
      width: width - margin * 2,
      height: rowHeight + 2,
      color: shade,
      borderColor: rgb(0.86, 0.89, 0.92),
      borderWidth: 0.35,
    });
    current.page.drawText(String(index + 1), { x: columns[0] + 5, y: middle, size: 7.1, font });
    residentLines.forEach((value, lineIndex) =>
      current.page.drawText(value, {
        x: columns[1] + 5,
        y: current.y - 10 - lineIndex * 9,
        size: 7.1,
        font: bold,
      }),
    );
    current.page.drawText(short(plotLine, 34), {
      x: columns[1] + 5,
      y: current.y - 12 - residentLines.length * 9,
      size: 6.5,
      font,
      color: rgb(0.32, 0.37, 0.43),
    });
    current.page.drawText(short(money(row.contractTotal), 16), {
      x: columns[2] + 5,
      y: middle,
      size: 6.8,
      font,
    });
    current.page.drawText(short(money(row.managementFee), 14), {
      x: columns[3] + 5,
      y: middle,
      size: 6.8,
      font,
    });
    current.page.drawText(short(money(row.ownerEntitlement), 14), {
      x: columns[4] + 5,
      y: middle,
      size: 6.8,
      font: bold,
    });
    current.y -= rowHeight + 3;
  });
  current.y -= 10;

  section('Informasi transfer');
  line(margin, 'Tanggal transfer', receipt.transferDate);
  line(margin, 'Metode transfer', receipt.transferMethod);
  line(margin, 'Referensi transfer', receipt.transferReference);
  line(margin, 'Tujuan transfer', `${receipt.destinationBank} · ${receipt.destinationAccount}`);
  line(margin, 'Atas nama rekening', receipt.destinationHolder);
  if (receipt.evidenceReference) line(margin, 'Referensi bukti', receipt.evidenceReference);
  current.y -= 14;
  const note =
    'Catatan: nominal mengikuti snapshot Realisasi Owner yang telah dicatat. Kuitansi ini tidak mengubah kontrak atau status pembayaran penghuni.';
  const noteLines = wrap(note, width - margin * 2, 7.2, 3);
  const ownerSignatureLines = wrap(receipt.ownerName, 135, 7.4, 3);
  const issuerSignatureLines = wrap(receipt.issuerName, 135, 7.4, 3);
  const signatureImageSize = ownerSignatureImage?.scaleToFit(120, 60) ?? { width: 0, height: 0 };
  need(
    noteLines.length * 10 +
      Math.max(ownerSignatureLines.length, issuerSignatureLines.length) * 10 +
      signatureImageSize.height +
      82,
  );
  noteLines.forEach((value, index) =>
    current.page.drawText(value, {
      x: margin,
      y: current.y - index * 10,
      size: 7.2,
      font,
      color: rgb(0.32, 0.37, 0.43),
    }),
  );
  current.y -= noteLines.length * 10 + 18;
  const centered = (
    value: string,
    left: number,
    boxWidth: number,
    y: number,
    size: number,
    useBold = true,
  ) =>
    current.page.drawText(value, {
      x: left + (boxWidth - (useBold ? bold : font).widthOfTextAtSize(value, size)) / 2,
      y,
      size,
      font: useBold ? bold : font,
    });
  const signatureLabelY = current.y;
  centered('Pengelola GSH 1 Jatinangor', margin, 135, signatureLabelY, 8.5);
  centered('Penerima / Owner', width - margin - 135, 135, signatureLabelY, 8.5);
  // Keep the supplied signature artwork between the issuer label and separator.
  if (ownerSignatureImage) {
    current.page.drawImage(ownerSignatureImage, {
      x: margin + (135 - signatureImageSize.width) / 2,
      y: signatureLabelY - 10 - signatureImageSize.height,
      width: signatureImageSize.width,
      height: signatureImageSize.height,
    });
  }
  const signatureLineY = signatureLabelY - signatureImageSize.height - 18;
  current.y = signatureLineY;
  current.page.drawLine({
    start: { x: margin, y: signatureLineY },
    end: { x: margin + 135, y: signatureLineY },
    thickness: 0.5,
    color: rgb(0.25, 0.3, 0.35),
  });
  current.page.drawLine({
    start: { x: width - margin - 135, y: signatureLineY },
    end: { x: width - margin, y: signatureLineY },
    thickness: 0.5,
    color: rgb(0.25, 0.3, 0.35),
  });
  issuerSignatureLines.forEach((value, index) =>
    centered(value, margin, 135, signatureLineY - 13 - index * 10, 7.4),
  );
  ownerSignatureLines.forEach((value, index) =>
    centered(value, width - margin - 135, 135, signatureLineY - 13 - index * 10, 7.4),
  );

  pages.forEach((entry, index) => footer(entry, index + 1));
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

/**
 * Renders the Finance hand-off form. This is intentionally separate from the
 * operational queue report: Finance needs one contract per row, complete
 * payout details, and the three approval/signature columns from the reference
 * form.
 */
export async function ownerFinanceRequestToPdf(
  document: OwnerFinanceRequestDocument,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [font, bold, granada, kostation, ptSonSmart] = await Promise.all([
    pdf.embedFont(
      readFileSync(require.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff')),
      { subset: true },
    ),
    pdf.embedFont(
      readFileSync(require.resolve('@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff')),
      { subset: true },
    ),
    pdf.embedPng(financeDocumentAsset('granada.png')),
    pdf.embedPng(financeDocumentAsset('kostation.png')),
    pdf.embedPng(financeDocumentAsset('pt-son-smart.png')),
  ]);
  // The Finance hand-off follows the supplied operational reference: A4
  // portrait with a dense table that uses almost the full printable width.
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 16;
  // This document is printed and reviewed outside the application. Use true
  // black for every operational label and value so it remains legible on a
  // standard office printer; blue is reserved for short lease durations.
  const body = rgb(0, 0, 0);
  const muted = body;
  const headerColor = rgb(0.05, 0.31, 0.48);
  const blue = rgb(0.04, 0.35, 0.78);
  const rowBlue = rgb(0.97, 0.985, 0.995);
  const totalBlue = rgb(0.89, 0.94, 0.98);
  const border = rgb(0, 0, 0);
  const headerBorder = rgb(0, 0, 0);
  const money = (value: number) => `Rp ${new Intl.NumberFormat('id-ID').format(value || 0)}`;
  const duration = (months: number) => {
    if (!months) return '-';
    if (months === 12) return '1 Tahun';
    if (months > 12 && months % 12 === 0) return `${months / 12} Tahun`;
    return `${months} Bulan`;
  };
  const wrap = (value: string, width: number, size: number, maxLines = 3) => {
    const words = value.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return ['-'];
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || font.widthOfTextAtSize(candidate, size) <= width) current = candidate;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    if (lines.length <= maxLines) return lines;
    const visible = lines.slice(0, maxLines);
    let last = visible[maxLines - 1];
    while (last.length > 1 && font.widthOfTextAtSize(`${last}…`, size) > width)
      last = last.slice(0, -1);
    visible[maxLines - 1] = `${last}…`;
    return visible;
  };
  let page: PDFPage = pdf.addPage([pageWidth, pageHeight]);
  let pageNumber = 1;
  let y = 0;
  const tableWidth = pageWidth - margin * 2;
  const centered = (
    value: string,
    x: number,
    width: number,
    baseline: number,
    size: number,
    useBold = false,
  ) => {
    const activeFont = useBold ? bold : font;
    page.drawText(value, {
      x: x + Math.max(0, (width - activeFont.widthOfTextAtSize(value, size)) / 2),
      y: baseline,
      size,
      font: activeFont,
      color: body,
    });
  };
  const footer = () => {
    page.drawLine({
      start: { x: margin, y: 24 },
      end: { x: pageWidth - margin, y: 24 },
      thickness: 0.6,
      color: border,
    });
    page.drawText(document.address || document.propertyName, {
      x: margin,
      y: 11,
      size: 7,
      font,
      color: muted,
    });
    page.drawText(`Halaman ${pageNumber}`, {
      x: pageWidth - margin - 50,
      y: 11,
      size: 7,
      font,
      color: muted,
    });
  };
  const drawBrandHeader = (includeMetadata: boolean) => {
    // Keep the same identity scale as the paid-rent receipt. The header is
    // intentionally larger than the data grid so Finance can recognise the
    // official document at a glance on A4 portrait paper.
    drawContainedPdfImage(page, granada, 34, 708, 150, 116);
    drawContainedPdfImage(page, kostation, (pageWidth - 168) / 2, 758, 168, 34);
    drawContainedPdfImage(page, ptSonSmart, pageWidth - 130, 740, 78, 52);
    const addressLines = wrap(
      `${document.propertyName}${document.address ? ` - ${document.address}` : ''}`,
      300,
      8,
      2,
    );
    addressLines.forEach((line, index) => {
      const width = font.widthOfTextAtSize(line, 8);
      page.drawText(line, {
        x: (pageWidth - width) / 2,
        y: 748 - index * 10,
        size: 8,
        font,
        color: muted,
      });
    });
    const dividerY = 720;
    page.drawLine({
      start: { x: 52, y: dividerY },
      end: { x: pageWidth - 52, y: dividerY },
      thickness: 1.5,
      color: body,
    });
    const title = 'FORM PENGAJUAN REALISASI PASSIVE INCOME INVESTOR';
    centered(title, margin, tableWidth, dividerY - 29, 13.2, true);
    if (!includeMetadata) {
      y = dividerY - 46;
      return;
    }
    const metadata = [
      ['Periode', document.period],
      ['Departemen/Unit', document.departmentUnit],
      ['Tanggal Pengajuan', document.requestedAt],
    ] as const;
    let metadataY = dividerY - 62;
    metadata.forEach(([label, value]) => {
      page.drawText(`${label}:`, {
        x: margin + 4,
        y: metadataY,
        size: 7.8,
        font: bold,
        color: body,
      });
      page.drawText(value, { x: margin + 92, y: metadataY, size: 7.8, font, color: body });
      metadataY -= 14;
    });
    y = metadataY - 9;
  };
  const addPage = () => {
    footer();
    page = pdf.addPage([pageWidth, pageHeight]);
    pageNumber += 1;
    drawBrandHeader(false);
  };
  const ensure = (heightNeeded: number) => {
    if (y - heightNeeded < 48) addPage();
  };
  drawBrandHeader(true);

  const headers = [
    'No.',
    'Nama Penyewa',
    'No. Kamar',
    'Nama Pemilik',
    'No. Kav.',
    'Lama Sewa',
    'Total Sewa',
    'Total Realisasi',
    'No. Rekening',
    'Bank',
    'Atas Nama',
    'Total Realisasi',
  ];
  const weights = [0.34, 1.14, 0.72, 1.15, 0.48, 0.65, 1.03, 1.07, 1.16, 0.62, 1.04, 1.07];
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const widths = weights.map((value) => (tableWidth * value) / weightTotal);
  const positions = widths.reduce<number[]>((values, width, index) => {
    values.push(index === 0 ? margin : values[index - 1] + widths[index - 1]);
    return values;
  }, []);
  const headerSize = 5.8;
  const bodySize = 6.1;
  const headerLineHeight = 6.95;
  const bodyLineHeight = 7.55;
  const drawTableHeader = () => {
    const lines = headers.map((header, index) => wrap(header, widths[index] - 10, headerSize, 3));
    const height = Math.max(...lines.map((value) => value.length), 1) * headerLineHeight + 9;
    ensure(height + 3);
    page.drawRectangle({
      x: margin,
      y: y - height,
      width: tableWidth,
      height,
      color: headerColor,
      borderColor: border,
      borderWidth: 0.8,
    });
    lines.forEach((values, index) => {
      const firstBaseline = y - (height - values.length * headerLineHeight) / 2 - headerSize * 0.72;
      values.forEach((value, lineIndex) =>
        page.drawText(value, {
          x:
            positions[index] +
            Math.max(0, (widths[index] - bold.widthOfTextAtSize(value, headerSize)) / 2),
          y: firstBaseline - lineIndex * headerLineHeight,
          size: headerSize,
          font: bold,
          color: rgb(1, 1, 1),
        }),
      );
    });
    positions.slice(1).forEach((x) =>
      page.drawLine({
        start: { x, y },
        end: { x, y: y - height },
        thickness: 0.5,
        color: headerBorder,
      }),
    );
    y -= height + 2;
  };
  drawTableHeader();
  const totalRent = document.rows.reduce((sum, row) => sum + row.totalRent, 0);
  const totalRealization = document.rows.reduce((sum, row) => sum + row.realizationAmount, 0);
  type FinanceRequestTableRow = {
    values: string[];
    durationMonths: number;
    ownerName: string;
    realizationAmount: number;
    sequence: number;
  };
  const rows: FinanceRequestTableRow[] = document.rows.map((row, index) => ({
    values: [
      String(index + 1),
      row.tenantName || '-',
      row.roomCode || '-',
      row.ownerName || '-',
      row.plotNumber || '-',
      duration(row.durationMonths),
      money(row.totalRent),
      money(row.realizationAmount),
      row.accountNumber || '-',
      row.bankName || '-',
      row.accountHolder || '-',
      row.ownerTotalRealization ? money(row.ownerTotalRealization) : '-',
    ],
    durationMonths: row.durationMonths,
    ownerName: row.ownerName || '-',
    realizationAmount: row.realizationAmount,
    sequence: index,
  }));
  const ownerGroups = rows.reduce<Array<{ ownerName: string; rows: FinanceRequestTableRow[] }>>(
    (groups, row) => {
      const previous = groups.at(-1);
      if (previous?.ownerName === row.ownerName) previous.rows.push(row);
      else groups.push({ ownerName: row.ownerName, rows: [row] });
      return groups;
    },
    [],
  );
  const drawHorizontalBoundary = (boundaryY: number, merged: boolean) => {
    if (!merged) {
      page.drawLine({
        start: { x: margin, y: boundaryY },
        end: { x: margin + tableWidth, y: boundaryY },
        thickness: 0.7,
        color: border,
      });
      return;
    }
    page.drawLine({
      start: { x: margin, y: boundaryY },
      end: { x: positions[3], y: boundaryY },
      thickness: 0.7,
      color: border,
    });
    page.drawLine({
      start: { x: positions[4], y: boundaryY },
      end: { x: positions[11], y: boundaryY },
      thickness: 0.7,
      color: border,
    });
  };
  const drawCenteredCell = (
    value: string,
    x: number,
    width: number,
    top: number,
    height: number,
    useBold = false,
    color = body,
  ) => {
    const activeFont = useBold ? bold : font;
    const lines = wrap(value, width - 10, bodySize, 4);
    const lineHeight = bodyLineHeight;
    const firstBaseline = top - (height - lines.length * lineHeight) / 2 - bodySize * 0.72;
    lines.forEach((line, index) => {
      page.drawText(line, {
        x: x + Math.max(4, (width - activeFont.widthOfTextAtSize(line, bodySize)) / 2),
        y: firstBaseline - index * lineHeight,
        size: bodySize,
        font: activeFont,
        color,
      });
    });
  };
  const rowLayout = (row: FinanceRequestTableRow) => {
    const cells = row.values.map((value, index) =>
      index === 3 || index === 11 ? [''] : wrap(value, widths[index] - 10, bodySize, 4),
    );
    return {
      row,
      cells,
      height: Math.max(...cells.map((value) => value.length), 1) * bodyLineHeight + 9,
    };
  };
  let hasRowsOnPage = false;
  const nextTablePage = () => {
    addPage();
    drawTableHeader();
    hasRowsOnPage = false;
  };
  const drawOwnerGroup = (
    group: { ownerName: string; rows: FinanceRequestTableRow[] },
    groupIndex: number,
    layouts: Array<ReturnType<typeof rowLayout>>,
  ) => {
    const groupTop = y;
    const groupHeight = layouts.reduce((sum, layout) => sum + layout.height, 0);
    layouts.forEach(({ row, height }, layoutIndex) => {
      const rowTop = y;
      page.drawRectangle({
        x: margin,
        y: rowTop - height,
        width: tableWidth,
        height,
        color: row.sequence % 2 ? rgb(1, 1, 1) : rowBlue,
      });
      positions.slice(1).forEach((x) =>
        page.drawLine({
          start: { x, y: rowTop },
          end: { x, y: rowTop - height },
          thickness: 0.5,
          color: border,
        }),
      );
      if (layoutIndex > 0) drawHorizontalBoundary(rowTop, true);
      row.values.forEach((value, index) => {
        if (index === 3 || index === 11) return;
        drawCenteredCell(
          value,
          positions[index],
          widths[index],
          rowTop,
          height,
          false,
          index === 5 && row.durationMonths > 0 && row.durationMonths < 12 ? blue : body,
        );
      });
      y -= height;
    });
    const groupBottom = y;
    const mergedFill = groupIndex % 2 ? rgb(1, 1, 1) : rowBlue;
    [3, 11].forEach((index) =>
      page.drawRectangle({
        x: positions[index],
        y: groupBottom,
        width: widths[index],
        height: groupHeight,
        color: mergedFill,
        borderColor: border,
        borderWidth: 0.7,
      }),
    );
    drawHorizontalBoundary(groupTop, false);
    drawHorizontalBoundary(groupBottom, false);
    drawCenteredCell(group.ownerName, positions[3], widths[3], groupTop, groupHeight);
    drawCenteredCell(
      money(group.rows.reduce((sum, row) => sum + row.realizationAmount, 0)),
      positions[11],
      widths[11],
      groupTop,
      groupHeight,
      true,
    );
    hasRowsOnPage = true;
  };
  ownerGroups.forEach((group, groupIndex) => {
    let remaining = group.rows;
    while (remaining.length) {
      const layouts = remaining.map(rowLayout);
      const remainingHeight = layouts.reduce((sum, layout) => sum + layout.height, 0);
      if (remainingHeight <= y - 48) {
        drawOwnerGroup(group, groupIndex, layouts);
        remaining = [];
        continue;
      }
      if (hasRowsOnPage) {
        nextTablePage();
        continue;
      }
      let count = 0;
      let segmentHeight = 0;
      for (const layout of layouts) {
        if (count && segmentHeight + layout.height > y - 48) break;
        segmentHeight += layout.height;
        count += 1;
      }
      if (!count) {
        throw new Error('Satu baris Form Finance terlalu tinggi untuk halaman dokumen.');
      }
      drawOwnerGroup(group, groupIndex, layouts.slice(0, count));
      remaining = remaining.slice(count);
      if (remaining.length) nextTablePage();
    }
  });
  const totalRow = {
    values: [
      '',
      '',
      '',
      '',
      '',
      '',
      money(totalRent),
      money(totalRealization),
      '',
      '',
      'TOTAL',
      money(totalRealization),
    ],
    durationMonths: 0,
  };
  const totalCells = totalRow.values.map((value, index) =>
    wrap(value, widths[index] - 10, bodySize, 4),
  );
  const totalRowHeight =
    Math.max(...totalCells.map((value) => value.length), 1) * bodyLineHeight + 9;
  if (y - totalRowHeight < 48) nextTablePage();
  page.drawRectangle({
    x: margin,
    y: y - totalRowHeight,
    width: tableWidth,
    height: totalRowHeight,
    color: totalBlue,
    borderColor: border,
    borderWidth: 0.8,
  });
  positions.slice(1).forEach((x) =>
    page.drawLine({
      start: { x, y },
      end: { x, y: y - totalRowHeight },
      thickness: 0.5,
      color: border,
    }),
  );
  totalRow.values.forEach((value, index) =>
    drawCenteredCell(value, positions[index], widths[index], y, totalRowHeight, true),
  );
  y -= totalRowHeight;
  y -= 28;
  if (y < 190) {
    addPage();
    centered('PENGESAHAN FORM PENGAJUAN', margin, tableWidth, y - 14, 10, true);
    page.drawLine({
      start: { x: margin, y: y - 20 },
      end: { x: pageWidth - margin, y: y - 20 },
      thickness: 0.7,
      color: border,
    });
    y -= 44;
  }
  const signatureTop = y;
  const signatureGap = 36;
  const signatureWidth = (tableWidth - signatureGap * 2) / 3;
  for (const [index, signatory] of document.signatories.entries()) {
    const x = margin + index * (signatureWidth + signatureGap);
    centered(signatory.label, x, signatureWidth, signatureTop, 9.6, true);
    if (signatory.signature) {
      try {
        const image = await pdf
          .embedPng(signatory.signature)
          .catch(() => pdf.embedJpg(signatory.signature!));
        const fitted = image.scaleToFit(signatureWidth - 32, 44);
        page.drawImage(image, {
          x: x + (signatureWidth - fitted.width) / 2,
          y: signatureTop - 57,
          width: fitted.width,
          height: fitted.height,
        });
      } catch {
        // A missing or unsupported optional signature must not block the form.
      }
    }
    page.drawLine({
      start: { x: x + 12, y: signatureTop - 66 },
      end: { x: x + signatureWidth - 12, y: signatureTop - 66 },
      thickness: 0.7,
      color: border,
    });
    centered(signatory.name || '-', x, signatureWidth, signatureTop - 80, 8.8, true);
    const title = signatory.title || '-';
    const titleWidth = font.widthOfTextAtSize(title, 8);
    page.drawText(title, {
      x: x + Math.max(0, (signatureWidth - titleWidth) / 2),
      y: signatureTop - 94,
      size: 8,
      font,
      color: muted,
    });
  }
  footer();
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

export function ownerFinanceRequestToXlsx(document: OwnerFinanceRequestDocument): Buffer {
  const headers = [
    'No.',
    'Nama Penyewa',
    'No. Kamar',
    'Nama Pemilik',
    'No. Kav.',
    'Lama Sewa',
    'Total Sewa',
    'Total Realisasi',
    'No. Rekening',
    'Bank',
    'Atas Nama',
    'Total Realisasi',
  ];
  const duration = (months: number) =>
    months === 12
      ? '1 Tahun'
      : months > 12 && months % 12 === 0
        ? `${months / 12} Tahun`
        : months
          ? `${months} Bulan`
          : '-';
  const money = (value: number) => `Rp ${new Intl.NumberFormat('id-ID').format(value || 0)}`;
  const rows: ReportScalar[][] = [
    ['FORM PENGAJUAN REALISASI PASSIVE INCOME INVESTOR'],
    ['Periode', document.period],
    ['Departemen/Unit', document.departmentUnit],
    ['Tanggal Pengajuan', document.requestedAt],
    [],
    headers,
    ...document.rows.map((row, index) => [
      index + 1,
      row.tenantName || '-',
      row.roomCode || '-',
      row.ownerName || '-',
      row.plotNumber || '-',
      duration(row.durationMonths),
      money(row.totalRent),
      money(row.realizationAmount),
      row.accountNumber || '-',
      row.bankName || '-',
      row.accountHolder || '-',
      row.ownerTotalRealization ? money(row.ownerTotalRealization) : '-',
    ]),
    [
      'TOTAL',
      '',
      '',
      '',
      '',
      '',
      money(document.rows.reduce((sum, row) => sum + row.totalRent, 0)),
      money(document.rows.reduce((sum, row) => sum + row.realizationAmount, 0)),
      '',
      '',
      '',
      money(document.rows.reduce((sum, row) => sum + row.realizationAmount, 0)),
    ],
  ];
  rows.push(
    [],
    [
      'Dibuat oleh',
      document.signatories.find((item) => item.role === 'manager')?.name ?? '-',
      document.signatories.find((item) => item.role === 'manager')?.title ?? '-',
    ],
    [
      'Mengetahui',
      document.signatories.find((item) => item.role === 'dbo')?.name ?? '-',
      document.signatories.find((item) => item.role === 'dbo')?.title ?? '-',
    ],
    [
      'Menyetujui',
      document.signatories.find((item) => item.role === 'director')?.name ?? '-',
      document.signatories.find((item) => item.role === 'director')?.title ?? '-',
    ],
  );
  const worksheet = (values: ReportScalar[][]) =>
    `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${values
      .map(
        (row, rowIndex) =>
          `<row r="${rowIndex + 1}">${row
            .map((cell, columnIndex) => {
              const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
              return typeof cell === 'number'
                ? `<c r="${reference}"><v>${cell}</v></c>`
                : `<c r="${reference}" t="inlineStr"><is><t>${xml(safeCell(cell))}</t></is></c>`;
            })
            .join('')}</row>`,
      )
      .join('')}</sheetData></worksheet>`;
  return zip([
    [
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Form Finance" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ],
    ['xl/worksheets/sheet1.xml', worksheet(rows)],
  ]);
}
