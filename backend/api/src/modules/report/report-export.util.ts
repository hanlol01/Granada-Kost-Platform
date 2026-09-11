import { readFileSync } from 'node:fs';
import * as fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
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

function sheets(report: ReportResult): Sheet[] {
  const detailKeys = Object.keys(report.rows[0] ?? {});
  return [
    {
      name: 'Ringkasan',
      rows: [
        ['Laporan', report.title],
        ['Properti', report.property_name],
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
  const lines = sheets(report).flatMap((sheet) => [
    sheet.name.toUpperCase(),
    ...sheet.rows.map((row) => row.map(safeCell).join('  |  ')),
    '',
  ]);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    readFileSync(require.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff')),
    { subset: true },
  );
  const pageWidth = 842;
  const pageHeight = 595;
  const linesPerPage = 33;
  for (let start = 0; start < Math.max(lines.length, 1); start += linesPerPage) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    if (start === 0) {
      page.drawText(report.title, { x: 32, y: 565, size: 15, font, color: rgb(0.03, 0.2, 0.34) });
    }
    lines.slice(start, start + linesPerPage).forEach((line, index) => {
      const clipped = line.length > 155 ? `${line.slice(0, 152)}...` : line;
      page.drawText(clipped, {
        x: 32,
        y: 540 - index * 15,
        size: 7.5,
        font,
        color: rgb(0.08, 0.1, 0.14),
      });
    });
    page.drawText(`Halaman ${Math.floor(start / linesPerPage) + 1}`, {
      x: 760,
      y: 18,
      size: 7,
      font,
      color: rgb(0.35, 0.4, 0.46),
    });
  }
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
