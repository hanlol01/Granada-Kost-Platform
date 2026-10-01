/** Names from authenticated Content-Disposition responses take precedence. */
export function safeDownloadFilename(
  value: string,
  fallback = "Dokumen.pdf",
): string {
  const clean = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[. -]+|[. -]+$/g, "");
  if (
    !clean ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(clean)
  ) {
    return fallback;
  }
  const extension = clean.match(/\.[a-z0-9]{1,8}$/i)?.[0] ?? "";
  const stem = extension ? clean.slice(0, -extension.length) : clean;
  const safeStem = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)
    ? `Berkas-${stem}`
    : stem;
  return `${safeStem.slice(0, 160)}${extension}`;
}

export function responseDownloadFilename(
  response: Response,
  fallback: string,
): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const encoded = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
  let filename: string | undefined;
  if (encoded) {
    try {
      filename = decodeURIComponent(encoded.trim());
    } catch {
      /* Try the ASCII parameter. */
    }
  }
  filename ??=
    disposition.match(/filename\s*=\s*"([^"]+)"/i)?.[1] ??
    disposition.match(/filename\s*=\s*([^;]+)/i)?.[1]?.trim();
  const extension = fallback.match(/\.[a-z0-9]{1,8}$/i)?.[0] ?? ".bin";
  const neutral = `Dokumen-${new Date().toISOString().slice(0, 10)}${extension}`;
  return safeDownloadFilename(
    filename ?? fallback,
    safeDownloadFilename(fallback, neutral),
  );
}

export function downloadObjectUrl(objectUrl: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** Opens a preview with an application-owned download control, never a bare blob tab. */
export async function fetchPreviewAndDownload(
  request: () => Promise<Response>,
  fallbackFilename: string,
  options: { preview?: boolean } = {},
): Promise<void> {
  const preview =
    options.preview === false ? null : window.open("about:blank", "_blank");
  if (preview) preview.opener = null;
  try {
    const response = await request();
    if (!response.ok)
      throw new Error(`Dokumen gagal diunduh (HTTP ${response.status}).`);
    const blob = await response.blob();
    const filename = responseDownloadFilename(response, fallbackFilename);
    const objectUrl = URL.createObjectURL(blob);
    if (preview && !preview.closed) {
      const doc = preview.document;
      doc.title = filename;
      doc.documentElement.lang = "id";
      const viewport = doc.createElement("meta");
      viewport.name = "viewport";
      viewport.content = "width=device-width,initial-scale=1";
      doc.head.appendChild(viewport);
      doc.body.style.cssText =
        "margin:0;display:flex;flex-direction:column;height:100dvh;background:#f3f4f6;font:14px system-ui;color:#111827";
      const toolbar = doc.createElement("header");
      toolbar.style.cssText =
        "display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px 16px;background:white;border-bottom:1px solid #d1d5db";
      const title = doc.createElement("strong");
      title.textContent = filename;
      title.style.cssText = "flex:1;min-width:0;overflow-wrap:anywhere";
      const download = doc.createElement("a");
      download.textContent = "Unduh";
      download.href = objectUrl;
      download.download = filename;
      download.style.cssText =
        "background:#006bd6;color:white;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600";
      toolbar.append(title, download);
      const frame = doc.createElement(
        blob.type.startsWith("image/") ? "img" : "iframe",
      );
      frame.setAttribute(
        "src",
        blob.type === "application/pdf" ? `${objectUrl}#toolbar=0` : objectUrl,
      );
      frame.setAttribute("title", filename);
      if (blob.type.startsWith("image/")) frame.setAttribute("alt", filename);
      frame.style.cssText =
        "flex:1;min-height:0;width:100%;border:0;object-fit:contain";
      doc.body.replaceChildren(toolbar, frame);
      preview.addEventListener(
        "pagehide",
        () => URL.revokeObjectURL(objectUrl),
        { once: true },
      );
    } else {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }
    downloadObjectUrl(objectUrl, filename);
  } catch (error) {
    preview?.close();
    throw error;
  }
}
