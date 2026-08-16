import { useEffect, useRef, useState } from "react";
import { AlertCircle, CalendarCheck2, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { adminUxLeaseApi } from "@/lib/admin-ux-lease-api";
import type { CheckoutCommand } from "@/lib/admin-ux-lease-types";
import { jakartaToday } from "@/lib/admin-ux-lease-helpers";
import { newIdempotencyKey } from "@/lib/idempotency";

type Props = { leaseId: string; onClose: () => void };
type HandoverConfirmation = { keyAccess: boolean; inventory: boolean; parking: boolean };

const openCheckout = (commands: CheckoutCommand[]) =>
  commands.find((item) => !["completed", "cancelled"].includes(item.state)) ?? null;

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Checkout tidak dapat diproses. Coba lagi.";
}

/** W07D command UI. It never invokes compatibility close/refund endpoints. */
export function CheckoutPanel({ leaseId, onClose }: Props) {
  const [command, setCommand] = useState<CheckoutCommand | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(jakartaToday());
  const [reason, setReason] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  const [roomResult, setRoomResult] = useState<"inspection_required" | "maintenance">(
    "inspection_required",
  );
  const [handover, setHandover] = useState<HandoverConfirmation>({
    keyAccess: false,
    inventory: false,
    parking: false,
  });
  const [notes, setNotes] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intentKey = useRef<string | null>(null);
  const key = () => (intentKey.current ??= newIdempotencyKey());

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    void adminUxLeaseApi.checkout
      .list(leaseId)
      .then(({ commands }) => {
        if (current) setCommand(openCheckout(commands));
      })
      .catch((loadError: unknown) => {
        if (current) setError(messageFrom(loadError));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [leaseId]);

  const perform = async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
      intentKey.current = null;
    } catch (actionError) {
      setError(messageFrom(actionError));
    } finally {
      setPending(false);
    }
  };

  const submitNotice = () =>
    perform(async () => {
      const result = await adminUxLeaseApi.checkout.notice(
        leaseId,
        { effectiveDate, reason, noticeExceptionReason: exceptionReason || undefined },
        key(),
      );
      setCommand(result.checkout);
    });

  const advance = () => {
    if (!command) return;
    return perform(async () => {
      if (command.state === "notice_received") {
        setCommand((await adminUxLeaseApi.checkout.schedule(leaseId, command.id, key())).checkout);
      } else if (command.state === "scheduled") {
        setCommand(
          (
            await adminUxLeaseApi.checkout.handover(
              leaseId,
              command.id,
              {
                keyAccessConfirmed: handover.keyAccess,
                inventoryConfirmed: handover.inventory,
                parkingConfirmed: handover.parking,
                notes: notes || undefined,
              },
              key(),
            )
          ).checkout,
        );
      } else if (command.state === "inspection_required") {
        setCommand(
          (
            await adminUxLeaseApi.checkout.inspection(
              leaseId,
              command.id,
              { roomStatusAfter: roomResult, notes: notes || undefined },
              key(),
            )
          ).checkout,
        );
      } else if (command.state === "settlement_pending") {
        await adminUxLeaseApi.checkout.complete(
          leaseId,
          command.id,
          { roomStatusAfter: roomResult },
          key(),
        );
        onClose();
      }
    });
  };

  const cancel = () => {
    if (!command) return;
    return perform(async () => {
      await adminUxLeaseApi.checkout.cancel(leaseId, command.id, cancellationReason, key());
      setCommand(null);
    });
  };

  const canRecordHandover = handover.keyAccess && handover.inventory && handover.parking;
  const next =
    command?.state === "notice_received"
      ? "Jadwalkan checkout"
      : command?.state === "scheduled"
        ? "Catat serah-terima"
        : command?.state === "inspection_required"
          ? "Catat inspeksi"
          : command?.state === "settlement_pending"
            ? "Selesaikan checkout"
            : null;

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="space-y-2 border-b border-border pb-5">
        <CardTitle className="flex items-center gap-2 text-foreground">
          <CalendarCheck2 className="h-5 w-5 text-primary" />
          Checkout
        </CardTitle>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Penutupan sewa melalui pemberitahuan, serah-terima, inspeksi, dan rekonsiliasi deposit.
          Kamar tidak pernah menjadi kosong secara langsung.
        </p>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        {error ? (
          <div
            role="alert"
            className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Memuat status checkout…
          </div>
        ) : !command ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Tanggal efektif
              <Input
                type="date"
                value={effectiveDate}
                onChange={(event) => setEffectiveDate(event.target.value)}
              />
            </label>
            <p className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-5 text-muted-foreground">
              Pemberitahuan minimal 14 hari. Jika lebih singkat, alasan pengecualian tercatat pada
              audit.
            </p>
            <label className="grid gap-2 text-sm font-medium text-foreground md:col-span-2">
              Alasan pemberitahuan
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground md:col-span-2">
              Alasan pengecualian pemberitahuan 14 hari{" "}
              <span className="font-normal text-muted-foreground">(jika ada)</span>
              <Textarea
                value={exceptionReason}
                onChange={(event) => setExceptionReason(event.target.value)}
              />
            </label>
            <div className="md:col-span-2">
              <Button disabled={!reason.trim() || pending} onClick={submitNotice}>
                {pending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CalendarCheck2 className="mr-2 h-4 w-4" />
                )}
                Catat pemberitahuan
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Status checkout
              </p>
              <p className="mt-1 text-base font-semibold capitalize text-foreground">
                {command.state.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Efektif {command.effectiveDate} · Pemberitahuan {command.noticeRecordedDate}
              </p>
            </div>
            {command.state === "scheduled" ? (
              <fieldset className="space-y-3 rounded-md border border-border p-4">
                <legend className="px-1 text-sm font-semibold text-foreground">
                  Konfirmasi serah-terima
                </legend>
                <p className="text-sm text-muted-foreground">
                  Seluruh konfirmasi wajib sebelum bukti serah-terima disimpan.
                </p>
                {(
                  [
                    ["keyAccess", "Kunci dan akses telah dikembalikan atau didokumentasikan."],
                    ["inventory", "Inventaris kamar telah diperiksa dan dicatat."],
                    [
                      "parking",
                      "Parkir sudah direkonsiliasi, termasuk bila penghuni tidak memiliki kendaraan.",
                    ],
                  ] as const
                ).map(([field, label]) => (
                  <label
                    key={field}
                    className="flex cursor-pointer items-start gap-3 rounded-md p-2 text-sm text-foreground hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={handover[field]}
                      onCheckedChange={(checked) =>
                        setHandover((current) => ({ ...current, [field]: checked === true }))
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
                <Textarea
                  placeholder="Catatan serah-terima (opsional)"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </fieldset>
            ) : null}
            {["inspection_required", "settlement_pending"].includes(command.state) ? (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Hasil kondisi kamar
                  <Select
                    value={roomResult}
                    onValueChange={(value) => setRoomResult(value as typeof roomResult)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inspection_required">Perlu inspeksi lanjutan</SelectItem>
                      <SelectItem value="maintenance">Masuk maintenance</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                {command.state === "inspection_required" ? (
                  <Textarea
                    placeholder="Catatan inspeksi (opsional)"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3">
              {next ? (
                <Button
                  disabled={pending || (command.state === "scheduled" && !canRecordHandover)}
                  onClick={advance}
                >
                  {pending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  {next}
                </Button>
              ) : null}
              {["notice_received", "scheduled"].includes(command.state) ? (
                <div className="flex min-w-72 flex-1 gap-2">
                  <Input
                    aria-label="Alasan pembatalan checkout"
                    placeholder="Alasan pembatalan"
                    value={cancellationReason}
                    onChange={(event) => setCancellationReason(event.target.value)}
                  />
                  <Button
                    variant="destructive"
                    disabled={pending || !cancellationReason.trim()}
                    onClick={cancel}
                  >
                    Batalkan
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        )}
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          Tutup
        </Button>
      </CardContent>
    </Card>
  );
}
