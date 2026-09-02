import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileSearch2,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useBillingDocumentSearch } from "@/hooks/useAdminBilling";
import {
  downloadBookingLeadCancellationReceipt,
  downloadBookingLeadCommitmentNote,
} from "@/lib/admin-booking-lead-completion";
import { downloadLeaseExitDocument } from "@/lib/admin-ux-lease-api";
import {
  downloadAdminInvoiceDocument,
  downloadAdminReceiptDocument,
  W06_PAGE_SIZE,
  type BillingDocumentSearchItem,
} from "@/lib/admin-billing";
import { formatIDR } from "@/lib/format";

const PAGE_SIZE = W06_PAGE_SIZE;

export function BillingDocumentSearch({ propertyId }: { propertyId: string | null }) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [validationMessage, setValidationMessage] = useState("");
  const [selected, setSelected] = useState<BillingDocumentSearchItem | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const documents = useBillingDocumentSearch(propertyId, query, offset);

  useEffect(() => {
    setInput("");
    setQuery("");
    setOffset(0);
    setSelected(null);
    setValidationMessage("");
    setDownloadError("");
  }, [propertyId]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = input.trim();
    if (normalized.length < 2) {
      setValidationMessage("Masukkan sedikitnya 2 karakter untuk mencari dokumen.");
      return;
    }
    setValidationMessage("");
    setDownloadError("");
    setOffset(0);
    if (normalized === query && offset === 0) void documents.refetch();
    else setQuery(normalized);
  }

  function clearSearch() {
    setInput("");
    setQuery("");
    setOffset(0);
    setSelected(null);
    setValidationMessage("");
    setDownloadError("");
  }

  function closeSearch() {
    clearSearch();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function downloadDocument(document: BillingDocumentSearchItem) {
    if (!propertyId) return;
    setDownloadingId(document.id);
    setDownloadError("");
    try {
      if (document.document_type === "invoice") {
        await downloadAdminInvoiceDocument(propertyId, document.id, document.document_code);
      } else if (
        document.document_type === "payment_receipt" ||
        document.document_type === "payment_reversal_receipt"
      ) {
        await downloadAdminReceiptDocument(propertyId, document.id, document.document_code);
      } else if (document.document_type === "booking_payment_receipt") {
        if (!document.booking_lead_id) throw new Error("Referensi minat booking tidak tersedia.");
        await downloadBookingLeadCommitmentNote({
          propertyId,
          leadId: document.booking_lead_id,
        });
      } else if (document.document_type === "booking_refund_receipt") {
        if (!document.booking_lead_id) throw new Error("Referensi minat booking tidak tersedia.");
        await downloadBookingLeadCancellationReceipt({
          propertyId,
          leadId: document.booking_lead_id,
        });
      } else {
        if (!document.lease_id || !document.checkout_command_id)
          throw new Error("Referensi checkout tidak tersedia.");
        await downloadLeaseExitDocument(
          document.lease_id,
          document.checkout_command_id,
          document.id,
          document.document_code,
        );
      }
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "Dokumen belum dapat diunduh. Coba lagi.",
      );
    } finally {
      setDownloadingId(null);
    }
  }

  const total = documents.data?.meta.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstResult = total > 0 ? offset + 1 : 0;
  const lastResult = total > 0 ? Math.min(offset + PAGE_SIZE, total) : 0;

  return (
    <>
      <Card className="overflow-hidden border-primary/20 bg-card/80 shadow-sm">
        <CardHeader className="space-y-1 border-b border-border/70 bg-muted/20 pb-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <FileSearch2 className="size-4" aria-hidden="true" />
            </span>
            <div>
              <CardTitle className="text-base">Cari dokumen pembayaran</CardTitle>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Temukan invoice, kuitansi pembayaran, refund, dan dokumen checkout dari seluruh
                periode.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  if (validationMessage) setValidationMessage("");
                }}
                placeholder="Nomor kuitansi, invoice, nama penghuni, atau kamar"
                className="h-11 pl-9 pr-10"
                aria-label="Cari seluruh dokumen pembayaran"
                aria-describedby={validationMessage ? "document-search-error" : undefined}
                disabled={!propertyId}
              />
              {input ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Hapus pencarian dokumen"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <Button type="submit" className="h-11 shrink-0 gap-2 px-5" disabled={!propertyId}>
              <Search className="size-4" aria-hidden="true" />
              Cari dokumen
            </Button>
          </form>

          {validationMessage ? (
            <p id="document-search-error" className="text-sm text-destructive" role="alert">
              {validationMessage}
            </p>
          ) : null}
          {downloadError ? (
            <p className="text-sm text-destructive" role="alert">
              {downloadError}
            </p>
          ) : null}

          {query ? (
            <div className="space-y-3" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p className="text-muted-foreground">
                  {documents.isFetching
                    ? "Mencari dokumen…"
                    : `${total} dokumen ditemukan untuk “${query}”`}
                </p>
                {total > 0 ? (
                  <span className="rounded-full border border-amber-400/50 bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm shadow-amber-400/20 dark:text-amber-300">
                    Halaman {page} dari {pageCount}
                  </span>
                ) : null}
              </div>

              {documents.isLoading ? (
                <div className="flex min-h-28 items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  Memuat dokumen…
                </div>
              ) : documents.isError ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  Dokumen tidak dapat dimuat. Periksa koneksi, lalu coba cari kembali.
                </div>
              ) : documents.data?.data.length ? (
                <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {documents.data.data.map((document) => (
                    <article
                      key={`${document.document_type}:${document.id}`}
                      className="grid gap-4 bg-background/45 p-4 transition-colors hover:bg-muted/20 lg:grid-cols-[minmax(0,1.55fr)_minmax(12rem,0.85fr)_minmax(12rem,0.8fr)_minmax(13rem,auto)] lg:items-center"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{document.title}</p>
                        <p className="mt-1 break-all font-mono text-sm font-semibold text-primary">
                          {document.document_code}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Terbit {formatDocumentDate(document.issued_at)}
                        </p>
                      </div>
                      <div className="min-w-0 text-sm">
                        <p className="truncate font-medium text-foreground">
                          {document.resident_name}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {document.room_number
                            ? `Kamar ${document.room_number}`
                            : "Kamar belum ditentukan"}
                        </p>
                        {document.amount !== null ? (
                          <p className="mt-1 font-semibold text-foreground">
                            {formatIDR(document.amount)}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex min-w-0 items-center lg:justify-start">
                        <Badge
                          variant="outline"
                          className={`whitespace-nowrap ${statusClass(document.status)}`}
                        >
                          {statusLabel(document.status)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          className="whitespace-nowrap border-primary/50 text-primary hover:bg-primary/10 hover:text-primary"
                          onClick={() => setSelected(document)}
                        >
                          Detail
                        </Button>
                        <Button
                          type="button"
                          className="gap-2 whitespace-nowrap bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={() => void downloadDocument(document)}
                          disabled={downloadingId === document.id}
                        >
                          {downloadingId === document.id ? (
                            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Download className="size-4" aria-hidden="true" />
                          )}
                          Unduh
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-6 text-center">
                  <p className="font-medium text-foreground">Dokumen tidak ditemukan</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Periksa kembali nomor dokumen, nama penghuni, atau nomor kamar.
                  </p>
                </div>
              )}

              {total > 0 ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Menampilkan {firstResult}–{lastResult} dari {total} dokumen
                  </p>
                  {total > PAGE_SIZE ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        type="button"
                        className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                        disabled={offset === 0 || documents.isFetching}
                        onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
                      >
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        Sebelumnya
                      </Button>
                      <Button
                        type="button"
                        className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                        disabled={offset + PAGE_SIZE >= total || documents.isFetching}
                        onClick={() => setOffset((current) => current + PAGE_SIZE)}
                      >
                        Berikutnya
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="flex justify-end border-t border-border/70 pt-3">
                <Button
                  type="button"
                  className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={closeSearch}
                >
                  <X className="size-4" aria-hidden="true" />
                  Tutup Pencarian
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Detail dokumen pembayaran</DialogTitle>
            <DialogDescription>
              Informasi dokumen resmi yang tersimpan pada riwayat properti.
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Detail label="Jenis dokumen" value={selected.title} />
              <Detail label="Nomor dokumen" value={selected.document_code} mono />
              <Detail label="Nama penghuni" value={selected.resident_name} />
              <Detail label="Kamar" value={selected.room_number ?? "Belum ditentukan"} />
              <Detail label="Tanggal terbit" value={formatDocumentDate(selected.issued_at)} />
              <Detail label="Status" value={statusLabel(selected.status)} />
              {selected.amount !== null ? (
                <Detail label="Nominal" value={formatIDR(selected.amount)} />
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => setSelected(null)}
            >
              <X className="size-4" aria-hidden="true" />
              Tutup
            </Button>
            {selected ? (
              <Button
                type="button"
                className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => void downloadDocument(selected)}
                disabled={downloadingId === selected.id}
              >
                {downloadingId === selected.id ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="size-4" aria-hidden="true" />
                )}
                Unduh dokumen
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-muted/25 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 break-words text-sm font-semibold text-foreground ${mono ? "font-mono" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function formatDocumentDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  return (
    {
      draft: "Draf",
      issued: "Terbit",
      partially_paid: "Dibayar sebagian",
      paid: "Lunas",
      overdue: "Terlambat",
      void: "Dibatalkan",
      pending_confirmation: "Menunggu konfirmasi",
      verified: "Terverifikasi",
      rejected: "Ditolak",
      reversed: "Dibatalkan",
      refunded: "Direfund",
    }[status] ?? status.replaceAll("_", " ")
  );
}

function statusClass(status: string) {
  if (["paid", "verified", "issued"].includes(status))
    return "border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (["overdue", "rejected", "void", "reversed", "refunded"].includes(status))
    return "border-destructive/35 bg-destructive/10 text-destructive";
  return "border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400";
}
