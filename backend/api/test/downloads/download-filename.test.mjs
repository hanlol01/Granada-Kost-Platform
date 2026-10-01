import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadFilename, documentDisposition } from '../../src/shared/utils/download-filename.ts';
import {
  responseDownloadFilename,
  safeDownloadFilename,
} from '../../../../packages/api-client/src/document-download.ts';

test('document codes survive response headers and client parsing', () => {
  const examples = [
    'RCT-1018D5705B4947.pdf',
    'INV/025/09/2026.pdf',
    'kuitansi-realisasi-KWT-RLS/GSH1/2026/09/0001.pdf',
  ];
  for (const code of examples) {
    const expected = downloadFilename(code);
    const response = new Response('', {
      headers: { 'Content-Disposition': documentDisposition(code) },
    });
    assert.equal(responseDownloadFilename(response, 'Dokumen.pdf'), expected);
    assert.doesNotMatch(expected, /[\\/\r\n]/);
  }
  assert.equal(downloadFilename(examples[0]), 'Kuitansi-Pembayaran-RCT-1018D5705B4947.pdf');
  assert.match(documentDisposition('025-09-GSH1.pdf', 'attachment', 'Kuitansi-Pembayaran'), /filename="Kuitansi-Pembayaran-025-09-GSH1.pdf"/);
});

test('UTF-8 names, missing headers, invalid encoding and UUIDs have safe fallbacks', () => {
  assert.equal(
    responseDownloadFilename(
      new Response('', {
        headers: {
          'Content-Disposition': "attachment; filename*=UTF-8''Laporan%20Agustus%202026.xlsx",
        },
      }),
      'Dokumen.xlsx',
    ),
    'Laporan-Agustus-2026.xlsx',
  );
  assert.equal(
    responseDownloadFilename(
      new Response('', {
        headers: {
          'Content-Disposition': "attachment; filename*=UTF-8''%ZZ; filename=Kuitansi-RCT-1.pdf",
        },
      }),
      'Dokumen.pdf',
    ),
    'Kuitansi-RCT-1.pdf',
  );
  assert.equal(
    responseDownloadFilename(new Response(''), 'Invoice-INV-01.pdf'),
    'Invoice-INV-01.pdf',
  );
  assert.equal(
    safeDownloadFilename('c7c9ba78-b77e-4994-9c17-9659bf673fd8.pdf', 'Kuitansi.pdf'),
    'Kuitansi.pdf',
  );
  assert.equal(safeDownloadFilename('nul.jpg'), 'Berkas-nul.jpg');
  assert.ok(safeDownloadFilename('a'.repeat(300) + '.xlsx').endsWith('.xlsx'));
});

test('unsafe filename characters cannot inject headers or paths', () => {
  assert.doesNotMatch(documentDisposition('..\\..\\invoice\r\nX-Evil: yes.pdf'), /[\r\n]/);
  assert.equal(downloadFilename('Bukti-Transfer-PAY-001-02.jpg'), 'Bukti-Transfer-PAY-001-02.jpg');
});
