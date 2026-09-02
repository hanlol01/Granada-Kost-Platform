/**
 * Fetch a document, open its Blob in a preview tab, and start the browser
 * download from the same object URL.
 *
 * The blank tab is opened before awaiting the request so browser popup
 * protection does not block the preview after a slow API response.
 */
export async function fetchPreviewAndDownload(
  request: () => Promise<Response>,
  filename: string,
  options: { preview?: boolean } = {},
): Promise<void> {
  const previewTab =
    options.preview === false
      ? null
      : typeof window !== "undefined"
        ? window.open("about:blank", "_blank")
        : null;
  if (previewTab) previewTab.opener = null;

  try {
    const response = await request();
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    if (previewTab) {
      previewTab.location.replace(objectUrl);
    } else if (options.preview !== false && typeof window !== "undefined") {
      window.open(objectUrl, "_blank", "noopener,noreferrer");
    }

    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    // Keep the URL alive long enough for the preview tab to finish loading.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    previewTab?.close();
    throw error;
  }
}
