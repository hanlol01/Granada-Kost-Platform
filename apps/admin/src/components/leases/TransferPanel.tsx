// W07B transfer panel: single authority for room transfers. The same
// component renders inside LeaseDetailPage and ResidentDetailWorkspace so
// both entries share one API surface and one server-side permission check.
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  CalendarClock,
  CheckCircle2,
  FileText,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useM6LeaseAvailableRooms,
  useM6LeaseMutation,
  useM6TransferCommands,
} from "@/hooks/useAdminUxLeases";
import {
  adminUxLeaseApi,
  type TransferInput,
  type TransferScheduleInput,
} from "@/lib/admin-ux-lease-api";
import {
  hasRequiredLeasePaymentReference,
  jakartaToday,
  TRANSFER_COMMAND_STATE_LABEL,
  TRANSFER_REASON_LABEL,
} from "@/lib/admin-ux-lease-helpers";
import type {
  PaymentMethod,
  TransferCommand,
  TransferPath,
  TransferPreview,
  TransferReasonCode,
  TransferResult,
} from "@/lib/admin-ux-lease-types";
import { formatIDR } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";
import { PAYMENT_METHOD_LABEL } from "./transfer-shared";

function nextDate(value: string): string {
  const parsed = new Date(value + "T00:00:00.000Z");
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-100">{value}</span>
    </div>
  );
}

export function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-slate-200">
        {label}
        {required ? <span className="ml-1 text-rose-300">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

export function FeatureOffPanel({
  title,
  description,
  onClose,
}: {
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900/80">
      <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldAlert className="h-8 w-8 text-slate-400" />
        <p className="font-semibold text-slate-100">{title}</p>
        <p className="max-w-md text-sm text-slate-400">{description}</p>
        <Button variant="secondary" onClick={onClose}>
          Kembali ke detail
        </Button>
      </CardContent>
    </Card>
  );
}

export function ActionDeniedPanel({ title, description }: { title: string; description: string }) {
  return (
    <Card className="border-amber-500/25 bg-amber-500/10">
      <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldAlert className="h-7 w-7 text-amber-300" />
        <p className="font-semibold text-amber-100">{title}</p>
        <p className="max-w-md text-sm text-amber-100/80">{description}</p>
      </CardContent>
    </Card>
  );
}

export function TransferResultCard({
  result,
  onOpenLease,
  onClose,
}: {
  result: TransferResult;
  onOpenLease: (leaseId: string) => void;
  onClose: () => void;
}) {
  return (
    <Card className="border-emerald-500/30 bg-emerald-500/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-100">
          <CheckCircle2 className="h-5 w-5" /> Transfer berhasil
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-emerald-50">
        <p>
          Lease sumber {result.sourceLease.leaseCode} telah dipindahkan ke kamar{" "}
          {result.targetLease.room.number}. Carry-forward dan invoice diputuskan server.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <KeyValue
            label="Deposit dibawa"
            value={formatIDR(result.transferRecord.carriedDepositAmount)}
          />
          <KeyValue label="Top-up" value={formatIDR(result.transferRecord.topUpAmount)} />
          <KeyValue label="Tunggakan lama" value={formatIDR(result.oldOutstandingAmount)} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-100/80">
          <Badge variant="outline">
            {result.transferRecord.transferPath === "same_day_exception"
              ? "Pengecualian hari yang sama"
              : "Batas periode tagihan"}
          </Badge>
          <Badge variant="outline">
            {TRANSFER_REASON_LABEL[result.transferRecord.reasonCode] ??
              result.transferRecord.reasonCode}
          </Badge>
          {result.transferRecord.executedLate ? (
            <Badge variant="outline">Dieksekusi terlambat</Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onOpenLease(result.targetLease.id)}>Buka Lease Target</Button>
          <Button variant="secondary" onClick={onClose}>
            Kembali ke Detail
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReasonFields({
  reasonCode,
  reasonDetail,
  onReasonCode,
  onReasonDetail,
}: {
  reasonCode: TransferReasonCode;
  reasonDetail: string;
  onReasonCode: (value: TransferReasonCode) => void;
  onReasonDetail: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Field label="Alasan transfer" required>
        <Select
          value={reasonCode}
          onValueChange={(value) => onReasonCode(value as TransferReasonCode)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pilih alasan" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TRANSFER_REASON_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {reasonCode === "other" ? (
        <Field label="Detail alasan (wajib untuk 'Lainnya')" required>
          <Textarea
            value={reasonDetail}
            maxLength={2000}
            rows={3}
            onChange={(event) => onReasonDetail(event.target.value)}
            placeholder="Jelaskan alasan operasional transfer"
          />
        </Field>
      ) : (
        <Field label="Detail alasan (opsional)">
          <Textarea
            value={reasonDetail}
            maxLength={2000}
            rows={3}
            onChange={(event) => onReasonDetail(event.target.value)}
            placeholder="Konteks tambahan untuk audit"
          />
        </Field>
      )}
    </div>
  );
}

function CommandStateBadge({ command }: { command: TransferCommand }) {
  const tone =
    command.state === "scheduled"
      ? "border-blue-500/40 bg-blue-500/15 text-blue-100"
      : command.state === "executed"
        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100"
        : command.state === "cancelled"
          ? "border-slate-500/40 bg-slate-500/15 text-slate-200"
          : "border-rose-500/40 bg-rose-500/15 text-rose-100";
  return (
    <Badge variant="outline" className={tone}>
      {TRANSFER_COMMAND_STATE_LABEL[command.state] ?? command.state}
      {command.executedLate && command.state === "executed" ? " · terlambat" : ""}
    </Badge>
  );
}

export function TransferPanel({
  leaseId,
  leaseStatus,
  canManage,
  canFinancial,
  transferFlagEnabled,
  onClose,
  onOpenLease,
}: {
  leaseId: string;
  leaseStatus: "active" | "ended" | "cancelled" | "transferred";
  canManage: boolean;
  canFinancial: boolean;
  transferFlagEnabled: boolean;
  onClose: () => void;
  onOpenLease: (leaseId: string) => void;
}) {
  const rooms = useM6LeaseAvailableRooms();
  const [path, setPath] = useState<TransferPath>("end_period");
  const [topUpReferenceNumber, setTopUpReferenceNumber] = useState("");
  const [targetRoomId, setTargetRoomId] = useState("");
  const [reasonCode, setReasonCode] = useState<TransferReasonCode>("resident_request");
  const [reasonDetail, setReasonDetail] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank_transfer");
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [previewError, setPreviewError] = useState<unknown>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<TransferResult | null>(null);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<TransferCommand | null>(null);
  const intentKey = useRef<string | null>(null);

  const commands = useM6TransferCommands(leaseId, transferFlagEnabled && leaseStatus === "active");
  const scheduledCommand = (commands.data?.items ?? []).find(
    (command) => command.state === "scheduled",
  );

  const transfer = useM6LeaseMutation(
    "lease-transfer",
    "Transfer kamar berhasil diproses",
    (_propertyId, input: TransferInput & { idempotencyKey: string }) =>
      adminUxLeaseApi.transfer.command(leaseId, input, input.idempotencyKey),
  );
  const schedule = useM6LeaseMutation(
    "lease-transfer-schedule",
    "Transfer terjadwal dicatat dan menunggu batas tagihan",
    (_propertyId, input: TransferScheduleInput & { idempotencyKey: string }) =>
      adminUxLeaseApi.transfer.schedule(leaseId, input, input.idempotencyKey),
  );
  const cancel = useM6LeaseMutation(
    "lease-transfer-cancel",
    "Transfer terjadwal dibatalkan",
    (_propertyId, input: { commandId: string; reason: string; idempotencyKey: string }) =>
      adminUxLeaseApi.transfer.cancel(leaseId, input.commandId, input.reason, input.idempotencyKey),
  );

  const allowed = transferFlagEnabled && canManage && leaseStatus === "active";
  const topUpRequiredAmount = preview?.deposit.topUpRequiredAmount ?? 0;
  const topUpPaymentValid =
    topUpRequiredAmount === 0 ||
    hasRequiredLeasePaymentReference(topUpRequiredAmount, topUpReferenceNumber);
  const today = useMemo(() => jakartaToday(), []);
  const tomorrow = useMemo(() => nextDate(today), [today]);
  const reasonValid = reasonCode !== "other" || reasonDetail.trim().length > 0;
  const sameDayValid = exceptionReason.trim().length > 0;

  const effectiveDate = path === "same_day_exception" ? today : scheduledDate;
  const canPreview = allowed && Boolean(targetRoomId) && Boolean(effectiveDate);

  const previewTransfer = async () => {
    if (!canPreview) return;
    setPreviewError(null);
    setResult(null);
    setScheduleNotice(null);
    try {
      setPreview(
        await adminUxLeaseApi.transfer.preview(leaseId, {
          targetRoomId,
          effectiveDate,
          transferPath: path,
        }),
      );
    } catch (error) {
      setPreviewError(error);
      setPreview(null);
    }
  };

  const submitSameDay = async () => {
    if (!preview || !sameDayValid || !reasonValid) return;
    const needsTopUp = topUpRequiredAmount > 0;
    if (needsTopUp && (!canFinancial || !topUpPaymentValid)) return;
    const idempotencyKey = intentKey.current ?? newIdempotencyKey();
    intentKey.current = idempotencyKey;
    try {
      const response = await transfer.mutateAsync({
        targetRoomId,
        effectiveDate: today,
        transferPath: "same_day_exception",
        reasonCode,
        reasonDetail: reasonDetail.trim() || undefined,
        exceptionReason: exceptionReason.trim(),
        topUp: needsTopUp
          ? {
              amount: topUpRequiredAmount,
              payment: {
                paymentMethod,
                referenceNumber: topUpReferenceNumber.trim(),
              },
            }
          : undefined,
        idempotencyKey,
      });
      intentKey.current = null;
      setResult(response);
      setConfirmOpen(false);
    } catch {
      /* safe toast from mutation; key remains available for a retry */
    }
  };

  const submitSchedule = async () => {
    if (!preview || !reasonValid) return;
    const idempotencyKey = intentKey.current ?? newIdempotencyKey();
    intentKey.current = idempotencyKey;
    try {
      const response = await schedule.mutateAsync({
        targetRoomId,
        effectiveDate: scheduledDate,
        reasonCode,
        reasonDetail: reasonDetail.trim() || undefined,
        idempotencyKey,
      });
      intentKey.current = null;
      setConfirmOpen(false);
      setPreview(null);
      setScheduleNotice(
        `Transfer terjadwal untuk ${response.scheduledTransfer.effectiveDate}. Eksekusi hanya terjadi pada batas periode tagihan oleh scheduler.`,
      );
      void commands.refetch();
    } catch {
      /* safe toast from mutation; key remains available for a retry */
    }
  };

  const submitCancel = async (reasonText?: string) => {
    if (!cancelTarget || !reasonText?.trim()) return;
    const idempotencyKey = newIdempotencyKey();
    try {
      await cancel.mutateAsync({
        commandId: cancelTarget.id,
        reason: reasonText.trim(),
        idempotencyKey,
      });
      setCancelTarget(null);
      void commands.refetch();
    } catch {
      /* safe toast from mutation */
    }
  };

  if (!transferFlagEnabled)
    return (
      <FeatureOffPanel
        title="Transfer belum diaktifkan"
        description="Flag transfer frontend tetap default-off hingga rollout property dan capability backend siap."
        onClose={onClose}
      />
    );
  if (!canManage || leaseStatus !== "active")
    return (
      <ActionDeniedPanel
        title="Transfer tidak tersedia"
        description="Transfer hanya untuk lease aktif dan dijalankan admin dengan capability lease.manage."
      />
    );
  if (rooms.isLoading) return <LoadingState label="Memuat kamar tujuan..." />;
  if (rooms.error)
    return (
      <ErrorState
        error={rooms.error}
        title="Gagal memuat kamar tujuan"
        onRetry={() => void rooms.refetch()}
      />
    );
  if (result)
    return <TransferResultCard result={result} onOpenLease={onOpenLease} onClose={onClose} />;

  return (
    <Card className="border-slate-800 bg-slate-900/80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-100">
          <ArrowLeftRight className="h-5 w-5 text-blue-300" /> Transfer kamar
        </CardTitle>
        <p className="text-sm text-slate-400">
          Preview berasal dari server. Tidak ada proration atau perhitungan saldo di browser.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <Tabs
          value={path}
          onValueChange={(value) => {
            setPath(value as TransferPath);
            setPreview(null);
            setPreviewError(null);
            setScheduleNotice(null);
            intentKey.current = null;
          }}
        >
          <TabsList>
            <TabsTrigger value="end_period">Batas periode tagihan</TabsTrigger>
            <TabsTrigger value="same_day_exception">Pengecualian hari yang sama</TabsTrigger>
          </TabsList>
        </Tabs>
        {path === "same_day_exception" ? (
          <p className="text-xs text-amber-200/90">
            Jalur pengecualian hanya untuk admin, berlaku hari ini (Asia/Jakarta), dan langsung
            memutakhirkan kamar, lease, serta deposit.
          </p>
        ) : (
          <p className="text-xs text-slate-400">
            Jalur normal hanya mencatat perintah terjadwal. Mutasi kamar, lease, dan deposit baru
            terjadi saat scheduler mengeksekusi pada batas periode tagihan.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {path === "same_day_exception" ? (
            <Field label="Tanggal efektif">
              <Input value={today} readOnly aria-readonly="true" />
              <p className="text-xs text-slate-500">Hanya hari ini Asia/Jakarta.</p>
            </Field>
          ) : (
            <Field label="Tanggal efektif (batas tagihan)" required>
              <Input
                type="date"
                min={tomorrow}
                value={scheduledDate}
                onChange={(event) => {
                  setScheduledDate(event.target.value);
                  setPreview(null);
                  intentKey.current = null;
                }}
              />
              <p className="text-xs text-slate-500">
                Harus tanggal mulai siklus tagihan berikutnya, setelah hari ini.
              </p>
            </Field>
          )}
          <Field label="Kamar tujuan" required>
            <Select
              value={targetRoomId || "none"}
              onValueChange={(value) => {
                setTopUpReferenceNumber("");
                setTargetRoomId(value === "none" ? "" : value);
                setPreview(null);
                intentKey.current = null;
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih kamar kosong" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Pilih kamar kosong</SelectItem>
                {(rooms.data?.items ?? []).map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.number} · {room.kostType.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {path === "end_period" && scheduledCommand ? (
          <ActionDeniedPanel
            title="Sudah ada transfer terjadwal"
            description={`Lease ini sudah memiliki perintah terjadwal untuk ${scheduledCommand.effectiveDate}. Batalkan terlebih dahulu sebelum menjadwalkan yang baru.`}
          />
        ) : null}
        {scheduleNotice ? (
          <p
            className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-100"
            role="status"
          >
            {scheduleNotice}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!canPreview} onClick={() => void previewTransfer()}>
            <FileText className="mr-2 h-4 w-4" /> Buat Preview Server
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
        </div>
        {previewError ? (
          <ErrorState
            error={previewError}
            title="Preview transfer tidak tersedia"
            onRetry={() => void previewTransfer()}
          />
        ) : null}
        {preview ? (
          <div className="space-y-4 rounded-lg border border-blue-500/25 bg-blue-500/10 p-4">
            <p className="font-semibold text-blue-100">Konsekuensi transfer</p>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <KeyValue
                label="Kamar tujuan"
                value={preview.targetRoom.number + " · " + preview.targetRoom.kostType.name}
              />
              <KeyValue
                label="Tanggal efektif"
                value={
                  preview.effectiveDate +
                  (preview.transferPath === "end_period" ? " (batas tagihan)" : " (hari yang sama)")
                }
              />
              <KeyValue label="Deposit dibawa" value={formatIDR(preview.deposit.carriedAmount)} />
              <KeyValue
                label="Deposit tujuan"
                value={formatIDR(preview.deposit.targetRequiredAmount)}
              />
              <KeyValue label="Tunggakan lama" value={formatIDR(preview.oldOutstandingAmount)} />
              <KeyValue
                label="Tagihan target"
                value={
                  preview.billing.targetInvoiceWillBeIssued
                    ? "Diterbitkan sesuai hasil server"
                    : "Mulai siklus berikutnya"
                }
              />
              <KeyValue label="Anchor tagihan" value={String(preview.billing.billingAnchorDay)} />
              <KeyValue
                label="Batas akhir kontrak (diwariskan)"
                value={preview.billing.contractualEndDate ?? "Tanpa batas"}
              />
            </div>
            {preview.transferPath === "end_period" && preview.validEffectiveDates.length > 0 ? (
              <Field label="Tanggal batas yang valid menurut server">
                <Select
                  value={
                    preview.validEffectiveDates.includes(scheduledDate) ? scheduledDate : "none"
                  }
                  onValueChange={(value) => {
                    if (value === "none") return;
                    setScheduledDate(value);
                    setPreview(null);
                    intentKey.current = null;
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih tanggal batas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Pilih tanggal batas</SelectItem>
                    {preview.validEffectiveDates.map((date) => (
                      <SelectItem key={date} value={date}>
                        {date}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <p className="text-xs text-blue-100">
              Lease sumber berakhir transferred dan lease target mulai pada tanggal efektif dalam
              interval half-open. Invoice lama tetap pada lease sumber. Kamar lama masuk status
              inspection_required sampai diselesaikan admin.
            </p>
            {path === "same_day_exception" && topUpRequiredAmount > 0 ? (
              canFinancial ? (
                <div className="space-y-3 border-t border-blue-500/20 pt-4">
                  <p className="text-sm font-medium text-blue-100">
                    Top-up deposit diperlukan: {formatIDR(topUpRequiredAmount)}
                  </p>
                  <Field label="Metode pembayaran top-up" required>
                    <Select
                      value={paymentMethod}
                      onValueChange={(value) => {
                        setPaymentMethod(value as PaymentMethod);
                        intentKey.current = null;
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Referensi pembayaran top-up" required>
                    <Input
                      value={topUpReferenceNumber}
                      maxLength={256}
                      onChange={(event) => {
                        setTopUpReferenceNumber(event.target.value);
                        intentKey.current = null;
                      }}
                      placeholder="Referensi pembayaran terverifikasi"
                    />
                  </Field>
                </div>
              ) : (
                <ActionDeniedPanel
                  title="Top-up memerlukan otorisasi finansial"
                  description="Anda dapat melihat preview, tetapi transfer dengan top-up hanya dapat dijalankan admin dengan lease.manage dan billing.manage."
                />
              )
            ) : null}
            {path === "end_period" && topUpRequiredAmount > 0 ? (
              <ActionDeniedPanel
                title="Transfer terjadwal tidak dapat menagih top-up deposit"
                description="Jalur terjadwal ditolak saat masih ada kekurangan deposit. Selesaikan selisih deposit melalui jalur pengecualian hari yang sama (admin dengan lease.manage dan billing.manage) sebelum menjadwalkan, atau pilih kamar tujuan dengan deposit yang sama."
              />
            ) : null}
            <ReasonFields
              reasonCode={reasonCode}
              reasonDetail={reasonDetail}
              onReasonCode={(value) => {
                setReasonCode(value);
                intentKey.current = null;
              }}
              onReasonDetail={(value) => {
                setReasonDetail(value);
                intentKey.current = null;
              }}
            />
            {path === "same_day_exception" ? (
              <Field label="Alasan pengecualian hari yang sama" required>
                <Textarea
                  value={exceptionReason}
                  maxLength={2000}
                  rows={2}
                  onChange={(event) => {
                    setExceptionReason(event.target.value);
                    intentKey.current = null;
                  }}
                  placeholder="Mengapa transfer tidak dapat menunggu batas tagihan?"
                />
              </Field>
            ) : null}
            <Button
              type="button"
              disabled={
                !reasonValid ||
                (path === "same_day_exception" &&
                  (!sameDayValid ||
                    (topUpRequiredAmount > 0 && (!canFinancial || !topUpPaymentValid)))) ||
                (path === "end_period" && (Boolean(scheduledCommand) || topUpRequiredAmount > 0)) ||
                transfer.isPending ||
                schedule.isPending
              }
              onClick={() => setConfirmOpen(true)}
            >
              {path === "same_day_exception" ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Konfirmasi Transfer Hari Ini
                </>
              ) : (
                <>
                  <CalendarClock className="mr-2 h-4 w-4" /> Jadwalkan Transfer
                </>
              )}
            </Button>
          </div>
        ) : null}
        <section aria-label="Perintah transfer terjadwal" className="space-y-3">
          <p className="font-semibold text-slate-100">Perintah transfer pada lease ini</p>
          {commands.isLoading ? (
            <LoadingState label="Memuat perintah transfer..." />
          ) : commands.error ? (
            <ErrorState
              error={commands.error}
              title="Gagal memuat perintah transfer"
              onRetry={() => void commands.refetch()}
            />
          ) : (commands.data?.items ?? []).length === 0 ? (
            <EmptyState title="Belum ada perintah transfer" />
          ) : (
            <ul className="space-y-2">
              {(commands.data?.items ?? []).map((command) => (
                <li
                  key={command.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700/60 bg-slate-900/60 p-3"
                >
                  <div className="space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-100">{command.effectiveDate}</span>
                      <CommandStateBadge command={command} />
                      <Badge variant="outline">
                        {TRANSFER_REASON_LABEL[command.reasonCode] ?? command.reasonCode}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400">
                      {command.transferPath === "same_day_exception"
                        ? "Pengecualian hari yang sama"
                        : "Batas periode tagihan"}
                      {command.sourceEndDate ? ` · batas kontrak: ${command.sourceEndDate}` : ""}
                      {command.cancelReason ? ` · dibatalkan: ${command.cancelReason}` : ""}
                      {command.failureCode ? ` · gagal: ${command.failureCode}` : ""}
                    </p>
                  </div>
                  {command.state === "scheduled" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setCancelTarget(command)}
                    >
                      <XCircle className="mr-2 h-4 w-4" /> Batalkan
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          path === "same_day_exception" ? "Konfirmasi transfer kamar" : "Jadwalkan transfer kamar"
        }
        description={
          path === "same_day_exception" ? (
            <span>
              Server akan menutup lease sumber dan membuat lease target pada hari ini. Tunggakan
              lama tidak dipindahkan. Kamar lama masuk inspection_required.
            </span>
          ) : (
            <span>
              Perintah hanya dicatat sekarang. Mutasi baru terjadi saat scheduler mengeksekusi pada
              {scheduledDate ? ` ${scheduledDate}` : " batas tagihan"}, selama prasyarat masih
              terpenuhi.
            </span>
          )
        }
        confirmLabel={path === "same_day_exception" ? "Proses Transfer" : "Jadwalkan"}
        pending={transfer.isPending || schedule.isPending}
        onConfirm={path === "same_day_exception" ? submitSameDay : submitSchedule}
      />
      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        title="Batalkan transfer terjadwal"
        description={
          <span>
            Pembatalan hanya menghapus perintah terjadwal dan tidak mengubah status kamar, lease,
            maupun deposit.
          </span>
        }
        confirmLabel="Batalkan Perintah"
        pending={cancel.isPending}
        reason={{
          label: "Alasan pembatalan",
          placeholder: "Mengapa transfer terjadwal dibatalkan?",
        }}
        onConfirm={submitCancel}
      />
    </Card>
  );
}
