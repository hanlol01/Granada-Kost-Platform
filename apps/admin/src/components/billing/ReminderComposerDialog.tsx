import { useMemo, useState } from "react";
import { FileText, Mail, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import { formatIDR } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";
import { cn } from "@/lib/utils";

type RecipientKind = "resident" | "parent";
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
  recipient: {
    kind: RecipientKind;
    display_name: string;
    room_number: string;
    phone: string | null;
  };
  invoices: Array<{
    id: string;
    code: string;
    period: string;
    due_date: string;
    outstanding_amount: number;
  }>;
  total_outstanding_amount: number;
  rendered: { title: string; body: string };
  channels: { whatsapp: string; email: string };
};
const recipientLabel: Record<RecipientKind, string> = {
  resident: "Preview Penghuni",
  parent: "Preview Orang Tua",
};

export function ReminderComposerDialog({
  propertyId,
  residentId,
  invoices,
  currentMonthInvoiceId,
  triggerClassName,
}: {
  propertyId: string | null;
  residentId: string;
  invoices: Invoice[];
  currentMonthInvoiceId?: string;
  triggerClassName?: string;
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
  const [recipientKind, setRecipientKind] = useState<RecipientKind>("resident");
  const [previews, setPreviews] = useState<Partial<Record<RecipientKind, Preview>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recordedStatus, setRecordedStatus] = useState<
    "previewed" | "external_opened" | "manual_sent" | null
  >(null);
  const preview = previews[recipientKind] ?? null;
  const targetIds = (nextSelected = selected) =>
    currentMonthInvoiceId ? [currentMonthInvoiceId] : nextSelected;

  function resetDialog() {
    setSelected([]);
    setRecipientKind("resident");
    setPreviews({});
    setError(null);
    setRecordedStatus(null);
  }
  async function createPreview(kind: RecipientKind, invoiceIds = targetIds()) {
    if (!propertyId || !invoiceIds.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await adminUxV2Requester.post<{ preview: Preview }>(
        `/admin/reminders/residents/${encodeURIComponent(residentId)}/attempts`,
        {
          property_id: propertyId,
          invoice_ids: invoiceIds,
          recipient_kind: kind,
          channel: "whatsapp_manual",
          outcome_status: "previewed",
        },
        { idempotencyKey: newIdempotencyKey() },
      );
      setPreviews((current) => ({ ...current, [kind]: result.preview }));
      setRecordedStatus("previewed");
    } catch {
      setError(
        "Preview tidak dapat dibuat. Pastikan tagihan masih aktif dan belum lunas, lalu coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }
  function toggle(id: string, checked: boolean) {
    const next = checked ? [...new Set([...selected, id])] : selected.filter((item) => item !== id);
    setSelected(next);
    setPreviews({});
    setError(null);
    setRecordedStatus(null);
    void createPreview("resident", targetIds(next));
  }
  async function chooseRecipient(kind: RecipientKind) {
    setRecipientKind(kind);
    if (!previews[kind]) await createPreview(kind);
  }
  async function record(
    outcome_status: "external_opened" | "manual_sent",
    channel: "whatsapp_manual" | "manual",
  ) {
    const invoiceIds = targetIds();
    if (!propertyId || !invoiceIds.length) return null;
    setBusy(true);
    setError(null);
    try {
      const result = await adminUxV2Requester.post<{
        action: { url: string } | null;
        preview: Preview;
      }>(
        `/admin/reminders/residents/${encodeURIComponent(residentId)}/attempts`,
        {
          property_id: propertyId,
          invoice_ids: invoiceIds,
          recipient_kind: recipientKind,
          channel,
          outcome_status,
        },
        { idempotencyKey: newIdempotencyKey() },
      );
      setPreviews((current) => ({ ...current, [recipientKind]: result.preview }));
      setRecordedStatus(outcome_status);
      return result;
    } catch {
      setError(
        recipientKind === "parent"
          ? "WhatsApp orang tua belum dapat dibuka. Pastikan nomor orang tua tersedia dan tagihan masih aktif."
          : "WhatsApp penghuni belum dapat dibuka. Pastikan nomor penghuni tersedia dan tagihan masih aktif.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function openWhatsApp() {
    const result = await record("external_opened", "whatsapp_manual");
    if (result?.action?.url) window.open(result.action.url, "_blank", "noopener,noreferrer");
  }
  async function recordManualSent() {
    if (!window.confirm("Catat bahwa pesan sudah dikirim manual?")) return;
    await record("manual_sent", "manual");
  }

  return (
    <>
      <Button
        className={cn("min-h-11", triggerClassName)}
        variant="info"
        disabled={!propertyId || eligible.length === 0}
        onClick={() => {
          const initial = eligible.map((invoice) => invoice.id);
          setSelected(initial);
          setRecipientKind("resident");
          setPreviews({});
          setError(null);
          setRecordedStatus(null);
          setOpen(true);
          void createPreview("resident", currentMonthInvoiceId ? [currentMonthInvoiceId] : initial);
        }}
      >
        <Send className="mr-2 h-4 w-4" />
        {currentMonthInvoiceId ? "Pengingat tagihan" : "Buat pengingat"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) resetDialog();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Susun pengingat tagihan</DialogTitle>
            <DialogDescription>
              {currentMonthInvoiceId
                ? "Tagihan bulan ini telah dipilih. Preview dibuat otomatis dari data tagihan terbaru."
                : "Pilih tagihan yang masih memiliki sisa. Preview dibuat otomatis dari data tagihan terbaru."}
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
                    {invoice.coverage_start} s.d. {invoice.coverage_end} · jatuh tempo{" "}
                    {invoice.due_date}
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
            {busy && !preview ? (
              <p className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm text-muted-foreground">
                Menyiapkan preview pesan...
              </p>
            ) : null}
            {preview ? (
              <section
                className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4"
                aria-label="Preview pengingat"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-primary">
                    <FileText className="h-4 w-4" />
                    <p className="font-semibold">Preview untuk {preview.recipient.display_name}</p>
                  </div>
                  <div className="inline-flex rounded-lg bg-background p-1 ring-1 ring-border">
                    {(Object.keys(recipientLabel) as RecipientKind[]).map((kind) => (
                      <Button
                        key={kind}
                        type="button"
                        size="sm"
                        variant={recipientKind === kind ? "default" : "ghost"}
                        className="min-h-8 px-3"
                        aria-pressed={recipientKind === kind}
                        disabled={busy}
                        onClick={() => void chooseRecipient(kind)}
                      >
                        {recipientLabel[kind]}
                      </Button>
                    ))}
                  </div>
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
                  WhatsApp dibuka secara manual. Email belum tersedia dan tidak akan dikirim.
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
            <Button variant="destructive" className="min-h-11" onClick={() => setOpen(false)}>
              Batal
            </Button>
            {preview ? (
              <Button
                className="min-h-11 bg-[#25D366] text-white hover:bg-[#1ebe5d] hover:text-white"
                disabled={busy || !preview.recipient.phone}
                onClick={() => void openWhatsApp()}
              >
                <WhatsAppIcon className="mr-2 h-4 w-4" />
                Buka WhatsApp
              </Button>
            ) : null}
            {preview ? (
              <Button className="min-h-11" disabled={busy} onClick={() => void recordManualSent()}>
                <Send className="mr-2 h-4 w-4" />
                Catat dikirim manual
              </Button>
            ) : null}
            <Button className="min-h-11" disabled title="Pengiriman email belum diaktifkan">
              <Mail className="mr-2 h-4 w-4" />
              Email belum tersedia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
