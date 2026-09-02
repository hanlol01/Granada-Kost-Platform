import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const billingClientPath = new URL("./admin-billing.ts", import.meta.url);
const billingHookPath = new URL("../hooks/useAdminBilling.ts", import.meta.url);
const documentSearchPath = new URL(
  "../components/billing/BillingDocumentSearch.tsx",
  import.meta.url,
);
const workspacePath = new URL("../components/billing/PaymentsWorkspace.tsx", import.meta.url);

test("global document search keeps one strict, property-scoped Admin contract", async () => {
  const [client, hook] = await Promise.all([
    readFile(billingClientPath, "utf8"),
    readFile(billingHookPath, "utf8"),
  ]);

  assert.match(client, /BILLING_DOCUMENT_SEARCH_TYPES/);
  assert.match(client, /parseBillingDocumentSearch/);
  assert.match(client, /"\/admin\/billing\/documents\/search"/);
  assert.match(client, /property_id: input\.propertyId/);
  assert.match(client, /q: input\.q/);
  assert.match(hook, /useBillingDocumentSearch/);
  assert.match(hook, /normalizedQuery\.length >= 2/);
});

test("payments workspace exposes explicit search, detail, and download actions", async () => {
  const [component, workspace] = await Promise.all([
    readFile(documentSearchPath, "utf8"),
    readFile(workspacePath, "utf8"),
  ]);

  assert.match(component, /Cari dokumen pembayaran/);
  assert.match(component, /Cari dokumen/);
  assert.match(component, /Detail dokumen pembayaran/);
  assert.match(component, /Unduh dokumen/);
  assert.match(component, /downloadAdminInvoiceDocument/);
  assert.match(component, /downloadAdminReceiptDocument/);
  assert.match(component, /downloadBookingLeadCommitmentNote/);
  assert.match(component, /downloadBookingLeadCancellationReceipt/);
  assert.match(component, /downloadLeaseExitDocument/);
  assert.match(component, /Tutup Pencarian/);
  assert.match(component, /ArrowLeft/);
  assert.match(component, /ArrowRight/);
  assert.match(component, /border-amber-400\/50 bg-amber-400\/15/);
  assert.match(component, /<X className="size-4" aria-hidden="true" \/>/);
  assert.match(component, /PAGE_SIZE = W06_PAGE_SIZE/);
  assert.match(
    await readFile(new URL("./admin-billing.ts", import.meta.url), "utf8"),
    /W06_PAGE_SIZE = 15/,
  );
  assert.match(component, /bg-destructive text-destructive-foreground/);
  assert.match(component, /bg-primary text-primary-foreground/);
  assert.match(
    component,
    /lg:grid-cols-\[minmax\(0,1\.55fr\)_minmax\(12rem,0\.85fr\)_minmax\(12rem,0\.8fr\)_minmax\(13rem,auto\)\]/,
  );
  assert.match(workspace, /<BillingDocumentSearch propertyId={currentPropertyId} \/>/);
  assert.match(workspace, /Ruang kerja pembayaran/);
  assert.match(workspace, /aria-labelledby="payments-workspace-heading"/);
  assert.match(workspace, /ArrowLeft/);
  assert.match(workspace, /ArrowRight/);
  assert.match(workspace, /bg-primary text-primary-foreground hover:bg-primary\/90/);
  assert.match(workspace, /Tutup detail/);
  assert.match(workspace, /function PaginationBadge/);
  assert.match(workspace, /Halaman \{page\} dari \{pageCount\}/);
  assert.match(workspace, /Menampilkan \{firstItem\}–\{lastItem\} dari \{total\} data/);
  assert.match(workspace, /Transfer berhasil diverifikasi/);
  assert.match(workspace, /Bukti transfer berhasil diverifikasi/);
  assert.match(workspace, /<X className="size-4" aria-hidden="true" \/>/);
  const hookSource = await readFile(
    new URL("../hooks/useAdminBilling.ts", import.meta.url),
    "utf8",
  );
  assert.equal((hookSource.match(/limit: W06_PAGE_SIZE/g) ?? []).length, 4);
});
