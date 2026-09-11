import { useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, FileText, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import { formatIDR } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";
import { cn } from "@/lib/utils";

export type LeaseReminderMilestone = "h60" | "h30" | "h14";
type ReminderOutcome = "previewed" | "external_opened" | "manual_sent";
type RecipientKind = "resident" | "parent";

type LeaseReminderPreview = {
  recipient: {
    kind: RecipientKind;
    display_name: string;
    room_number: string;
    phone: string | null;
  };
  lease: { start_date: string; end_date: string; days_remaining: number };
  total_outstanding_amount: number;
  rendered: { title: string; body: string };
  template: { key: string; version: number };
  channels: { whatsapp: string; email: string };
};

type LeaseReminderResponse = {
  preview: LeaseReminderPreview;
  action: { channel: "whatsapp_manual"; url: string } | null;
};

const milestoneCopy: Record<
  LeaseReminderMilestone,
  { title: string; description: string; label: string }
> = {
  h60: {
    title: "Pengingat niat perpanjangan",
    description: "Mulai tanyakan rencana penghuni sebelum masa sewa berakhir.",
    label: "H-60 · Niat perpanjangan",
  },
  h30: {
    title: "Pengingat keputusan perpanjangan",
    description: "Minta keputusan penghuni agar persiapan pembayaran atau checkout jelas.",
    label: "H-30 · Prioritas",
  },
  h14: {
    title: "Pengingat akhir masa sewa",
    description: "Pastikan perpanjangan atau persiapan checkout segera dikonfirmasi.",
    label: "H-14 · Checkout",
  },
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(
    new Date(`${value.slice(0, 10)}T00:00:00+07:00`),
  );
}

export function LeaseReminderDialog({
  propertyId,
  leaseId,
  milestone,
  residentName,
  roomNumber,
  leaseEndDate,
  daysRemaining,
  outstandingAmount,
  triggerClassName,
  onRecorded,
}: {
  propertyId: string | null;
  leaseId: string;
  milestone: LeaseReminderMilestone;
  residentName: string;
  roomNumber: string;
  leaseEndDate: string;
  daysRemaining: number;
  outstandingAmount: number;
  triggerClassName?: string;
  onRecorded?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<LeaseReminderPreview | null>(null);
  const [recipientKind, setRecipientKind] = useState<RecipientKind>("resident");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recordedStatus, setRecordedStatus] = useState<ReminderOutcome | null>(null);
  const copy = milestoneCopy[milestone];

  function resetDialog() {
    setPreview(null);
    setRecipientKind("resident");
    setError(null);
    setRecordedStatus(null);
  }

  async function record(
    outcome_status: ReminderOutcome,
    channel: "whatsapp_manual" | "manual",
    recipient: RecipientKind = recipientKind,
  ) {
    if (!propertyId) return null;
    setBusy(true);
    setError(null);
    try {
      const result = await adminUxV2Requester.post<LeaseReminderResponse>(
        `/admin/reminders/leases/${encodeURIComponent(leaseId)}/attempts`,
        {
          property_id: propertyId,
          milestone,
          recipient_kind: recipient,
          channel,
          outcome_status,
        },
        { idempotencyKey: newIdempotencyKey() },
      );
      if (result.preview) setPreview(result.preview);
      setRecordedStatus(outcome_status);
      onRecorded?.();
      return result;
    } catch {
      setError(
        "Pengingat belum dapat dicatat. Kondisi masa sewa mungkin sudah berubah; segarkan halaman lalu coba lagi.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createPreview(recipient: RecipientKind = "resident") {
    setRecipientKind(recipient);
    await record("previewed", "whatsapp_manual", recipient);
  }

  async function openWhatsApp() {
    const result = await record("external_opened", "whatsapp_manual");
    if (result?.action?.url) window.open(result.action.url, "_blank", "noopener,noreferrer");
  }

  async function recordManualSent() {
    if (!window.confirm("Catat bahwa pengingat sudah dikirim manual?")) return;
    await record("manual_sent", "manual");
  }

  async function chooseRecipient(nextRecipient: RecipientKind) {
    if (nextRecipient === recipientKind) return;
    await createPreview(nextRecipient);
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="success"
        className={cn("min-h-10 rounded-lg", triggerClassName)}
        disabled={!propertyId}
        onClick={() => {
          resetDialog();
          setOpen(true);
        }}
      >
        <Send className="mr-2 h-4 w-4" /> Kirim reminder
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
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>
              {copy.description} Pesan dirender dari data terbaru dan setiap tindakan tercatat di
              riwayat pengingat.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Penghuni
                </p>
                <p className="mt-1 font-semibold">{residentName}</p>
                <p className="text-sm text-muted-foreground">Kamar {roomNumber}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Milestone
                </p>
                <Badge
                  variant="outline"
                  className="mt-1 border-primary/35 bg-primary/10 text-primary"
                >
                  {copy.label}
                </Badge>
                <p className="mt-1 text-sm text-muted-foreground">
                  Berakhir {dateLabel(leaseEndDate)} · {daysRemaining} hari lagi
                </p>
              </div>
              <div className="sm:col-span-2 flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">Sisa kewajiban saat ini</span>
                <strong>{formatIDR(outstandingAmount)}</strong>
              </div>
            </div>
            {!preview ? (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>
                    Tinjau pesan terlebih dahulu. Email tidak dikirim otomatis; Admin dapat membuka
                    WhatsApp atau mencatat pengiriman manual.
                  </p>
                </div>
              </div>
            ) : (
              <section
                className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4"
                aria-label="Preview pengingat masa sewa"
              >
                <div className="flex items-center gap-2 text-primary">
                  <FileText className="h-4 w-4" />
                  <p className="font-semibold">
                    Preview pesan untuk {preview.recipient.display_name}
                  </p>
                </div>
                <div className="inline-flex rounded-lg bg-background p-1 ring-1 ring-border">
                  <Button
                    type="button"
                    size="sm"
                    variant={recipientKind === "resident" ? "default" : "ghost"}
                    className="min-h-8 px-3"
                    aria-pressed={recipientKind === "resident"}
                    disabled={busy}
                    onClick={() => void chooseRecipient("resident")}
                  >
                    Preview Penghuni
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={recipientKind === "parent" ? "default" : "ghost"}
                    className="min-h-8 px-3"
                    aria-pressed={recipientKind === "parent"}
                    disabled={busy}
                    onClick={() => void chooseRecipient("parent")}
                  >
                    Preview Orang Tua
                  </Button>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="font-semibold">{preview.rendered.title}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {preview.rendered.body}
                  </p>
                </div>
                {recordedStatus ? (
                  <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    {recordedStatus === "previewed"
                      ? "Preview tercatat"
                      : recordedStatus === "external_opened"
                        ? "WhatsApp dibuka"
                        : "Dikirim manual"}
                  </Badge>
                ) : null}
              </section>
            )}
            {error ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              onClick={() => setOpen(false)}
            >
              Tutup
            </Button>
            {!preview ? (
              <Button
                type="button"
                className="min-h-11"
                disabled={busy}
                onClick={() => void createPreview()}
              >
                <FileText className="mr-2 h-4 w-4" /> {busy ? "Menyiapkan..." : "Tinjau pesan"}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  className="min-h-11 bg-[#25D366] text-white hover:bg-[#1ebe5d] hover:text-white"
                  disabled={busy || !preview.recipient.phone}
                  onClick={() => void openWhatsApp()}
                >
                  <WhatsAppIcon className="mr-2 h-4 w-4" /> Buka WhatsApp
                </Button>
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => void recordManualSent()}
                >
                  <Send className="mr-2 h-4 w-4" /> Catat dikirim manual
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
