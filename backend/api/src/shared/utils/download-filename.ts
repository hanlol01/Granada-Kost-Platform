/** Stable, filesystem-safe names for generated documents and attached evidence. */
export function downloadFilename(value: string, fallback = 'Dokumen.pdf'): string {
  const clean = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[. -]+|[. -]+$/g, '');
  if (!clean || /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(clean))
    return fallback;
  const extension = clean.match(/\.[a-z0-9]{1,8}$/i)?.[0] ?? '';
  let stem = extension ? clean.slice(0, -extension.length) : clean;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) stem = `Berkas-${stem}`;
  if (/^(RCT|KWT)-/i.test(stem)) stem = `Kuitansi-Pembayaran-${stem}`;
  else if (/^INV-/i.test(stem)) stem = `Invoice-Sewa-${stem}`;
  else if (/^RLS-/i.test(stem)) stem = `Realisasi-Owner-${stem}`;
  else if (/KONTRAK-LUNAS/i.test(stem) && !/^Bukti-/i.test(stem)) stem = `Bukti-Pelunasan-${stem}`;
  return `${stem.slice(0, 160)}${extension}`;
}

export function documentDisposition(
  filename: string,
  mode: 'attachment' | 'inline' = 'attachment',
  documentType?: string,
): string {
  const typed =
    documentType && !filename.toLowerCase().startsWith(documentType.toLowerCase())
      ? `${documentType}-${filename}`
      : filename;
  const safe = downloadFilename(typed);
  return `${mode}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
