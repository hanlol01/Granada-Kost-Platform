import { useMemo, useState } from "react";
import { FileText, Mail, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import { formatIDR } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";

type Invoice = {
  id: string;
  invoice_code: string;
  coverage_start: string;
  coverage_end: string;
  due_date: string;
  outstanding_amount: number;
  invoice_status: string;
};
type Preview = {
  recipient: { display_name: string; room_number: string; phone: string | null };
  invoices: Array<{
    id: string;
    code: string;
    period: string;
    due_date: string;
    outstanding_amount: number;
    share_url: string;
  }>;
  total_outstanding_amount: number;
  rendered: { title: string; body: string };
  channels: { whatsapp: string; email: string };
};

export function ReminderComposerDialog({
  propertyId,
  residentId,
  invoices,
  currentMonthInvoiceId,
}: {
  propertyId: string | null;
  residentId: string;
  invoices: Invoice[];
  currentMonthInvoiceId?: string;
}) {
  const [open, setOpen] = useState(false);
  const eligible = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          invoice.outstanding_amount > 0 &&
          ["issued", "partially_paid", "overdue"].includes(invoice.invoice_status),
      ),
    [invoices],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recordedStatus, setRecordedStatus] = useState<
    "previewed" | "external_opened" | "manual_sent" | null
  >(null);

  function toggle(id: string, checked: boolean) {
    setSelected((items) =>
      checked ? [...new Set([...items, id])] : items.filter((item) => item !== id),
    );
    setPreview(null);
    setError(null);
    setRecordedStatus(null);
  }
  async function createPreview() {
    if (!propertyId || !selected.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await adminUxV2Requester.post<{ preview: Preview }>(
        `/admin/reminders/residents/${encodeURIComponent(residentId)}/attempts`,
        {
          property_id: propertyId,
          invoice_ids: currentMonthInvoiceId ? [currentMonthInvoiceId] : selected,
          channel: "whatsapp_manual",
          outcome_status: "previewed",
        },
        { idempotencyKey: newIdempotencyKey() },
      );
      setPreview(result.preview);
      setRecordedStatus("previewed");
    } catch {
      setError(
        "Preview tidak dapat dibuat. Pastikan tagihan masih aktif dan belum lunas, lalu coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function openWhatsApp() {
    if (!propertyId || !selected.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await adminUxV2Requester.post<{ action: { url: string } }>(
        `/admin/reminders/residents/${encodeURIComponent(residentId)}/attempts`,
        {
          property_id: propertyId,
          invoice_ids: currentMonthInvoiceId ? [currentMonthInvoiceId] : selected,
          channel: "whatsapp_manual",
          outcome_status: "external_opened",
        },
        { idempotencyKey: newIdempotencyKey() },
      );
      window.open(result.action.url, "_blank", "noopener,noreferrer");
      setRecordedStatus("external_opened");
    } catch {
      setError(
        "WhatsApp tidak dapat dibuka. Pastikan nomor penghuni tersedia dan tagihan masih aktif.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function recordManualSent() {
    if (
      !propertyId ||
      !selected.length ||
      !window.confirm("Catat bahwa pesan sudah dikirim manual?")
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await adminUxV2Requester.post(
        `/admin/reminders/residents/${encodeURIComponent(residentId)}/attempts`,
        {
          property_id: propertyId,
          invoice_ids: currentMonthInvoiceId ? [currentMonthInvoiceId] : selected,
          channel: "manual",
          outcome_status: "manual_sent",
        },
        { idempotencyKey: newIdempotencyKey() },
      );
      setRecordedStatus("manual_sent");
    } catch {
      setError("Tindakan manual belum tercatat. Pastikan tagihan masih aktif, lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        className="min-h-11"
        variant="info"
        disabled={!propertyId || eligible.length === 0}
        onClick={() => {
          setSelected(eligible.map((invoice) => invoice.id));
          setPreview(null);
          setError(null);
          setOpen(true);
        }}
      >
        <Send className="mr-2 h-4 w-4" />
        {currentMonthInvoiceId ? "Pengingat tagihan" : "Buat pengingat"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Susun pengingat tagihan</DialogTitle>
            <DialogDescription>
              {currentMonthInvoiceId
                ? "Tagihan bulan ini sudah dipilih oleh sistem. Nilai, periode, dan tautan invoice selalu dihitung ulang oleh server."
                : "Pilih tagihan yang masih memiliki sisa. Nilai, periode, dan tautan invoice selalu dihitung ulang oleh server."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {eligible.map((invoice) => (
              <label
                key={invoice.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/20 p-3 transition-colors hover:border-primary/45"
              >
                <Checkbox
                  checked={selected.includes(invoice.id)}
                  onCheckedChange={(value) => toggle(invoice.id, value === true)}
                  aria-label={`Pilih ${invoice.invoice_code}`}
                  disabled={Boolean(currentMonthInvoiceId)}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{invoice.invoice_code}</span>
                    <Badge
                      variant="outline"
                      className="border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                    >
                      {formatIDR(invoice.outstanding_amount)} tersisa
                    </Badge>
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {invoice.coverage_start}–{invoice.coverage_end} · jatuh tempo {invoice.due_date}
                  </span>
                </span>
              </label>
            ))}
            {eligible.length === 0 ? (
              <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                Tidak ada tagihan aktif yang dapat diingatkan.
              </p>
            ) : null}
            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
            {preview ? (
              <section
                className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4"
                aria-label="Preview pengingat"
              >
                <div className="flex items-center gap-2 text-primary">
                  <FileText className="h-4 w-4" />
                  <p className="font-semibold">
                    Preview untuk {preview.recipient.display_name} · Kamar{" "}
                    {preview.recipient.room_number}
                  </p>
                </div>
                <p className="text-sm font-semibold">
                  Total tersisa: {formatIDR(preview.total_outstanding_amount)}
                </p>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="font-semibold">{preview.rendered.title}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {preview.rendered.body}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  WhatsApp dibuka secara manual. Email belum diaktifkan dan tidak akan dikirim.
                </p>
                {recordedStatus ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  >
                    Riwayat:{" "}
                    {recordedStatus === "previewed"
                      ? "preview tercatat"
                      : recordedStatus === "external_opened"
                        ? "WhatsApp dibuka"
                        : "dikirim manual"}
                  </Badge>
                ) : null}
              </section>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="secondary" className="min-h-11" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              className="min-h-11"
              variant="outline"
              disabled={busy || selected.length === 0}
              onClick={() => void createPreview()}
            >
              <FileText className="mr-2 h-4 w-4" />
              {busy ? "Menyiapkan..." : "Tinjau pesan"}
            </Button>
            {preview ? (
              <Button
                className="min-h-11"
                disabled={busy || !preview.recipient.phone}
                onClick={() => void openWhatsApp()}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Buka WhatsApp
              </Button>
            ) : null}
            {preview ? (
              <Button
                className="min-h-11"
                variant="outline"
                disabled={busy}
                onClick={() => void recordManualSent()}
              >
                <Send className="mr-2 h-4 w-4" />
                Catat dikirim manual
              </Button>
            ) : null}
            <Button
              className="min-h-11"
              variant="outline"
              disabled
              title="Pengiriman email belum diaktifkan"
            >
              <Mail className="mr-2 h-4 w-4" />
              Email nonaktif
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
