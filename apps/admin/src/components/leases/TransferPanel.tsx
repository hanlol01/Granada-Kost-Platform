// W07B transfer panel: single authority for room transfers. The same
// component renders inside LeaseDetailPage and ResidentDetailWorkspace so
// both entries share one API surface and one server-side permission check.
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { ApiError } from "@granada-kost/api-client";
import {
  ArrowLeftRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  CircleHelp,
  FileText,
  Info,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  LeaseRoomOption,
  TransferCommand,
  TransferPath,
  TransferPreview,
  TransferReasonCode,
  TransferResult,
} from "@/lib/admin-ux-lease-types";
import { formatIDR } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";
import { cn } from "@/lib/utils";
import {
  genderPolicyLabel,
  isTransferRoomGenderCompatible,
  normalizeRoomSearch,
  PAYMENT_METHOD_LABEL,
  type ResidentGender,
} from "./transfer-shared";

function formatDate(value: string | null | undefined): string {
  if (!value) return "Belum ditentukan";
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return "Belum ditentukan";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/80 bg-background/70 p-3">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      <span className="mt-1 block font-semibold text-foreground">{value}</span>
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
      <Label className="text-foreground">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function RoomPicker({
  rooms,
  value,
  onChange,
}: {
  rooms: LeaseRoomOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = rooms.find((room) => room.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="min-h-11 w-full justify-between border-input bg-background px-3 font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected
              ? `${selected.number} · ${selected.kostType.name} · ${genderPolicyLabel(selected.genderPolicy)}`
              : "Cari dan pilih kamar kosong"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Cari nomor kamar, mis. ak1802..." />
          <CommandList>
            <CommandEmpty>Tidak ada kamar yang sesuai.</CommandEmpty>
            <CommandGroup heading={`${rooms.length} kamar sesuai jenis kelamin penghuni`}>
              {rooms.map((room) => (
                <CommandItem
                  key={room.id}
                  value={`${room.number} ${normalizeRoomSearch(room.number)} ${room.kostType.name} ${genderPolicyLabel(room.genderPolicy)}`}
                  onSelect={() => {
                    onChange(room.id);
                    setOpen(false);
                  }}
                  className="min-h-12"
                >
                  <Check
                    className={cn("mr-1 h-4 w-4", value === room.id ? "opacity-100" : "opacity-0")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{room.number}</span>
                    <span className="block text-xs text-muted-foreground">
                      {room.kostType.name} · {genderPolicyLabel(room.genderPolicy)}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PreviewErrorNotice({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const code = ApiError.isApiError(error) ? error.code : null;
  const content =
    code === "LEASE_BILLING_NOT_CURRENT"
      ? {
          title: "Jadwal tagihan belum siap untuk perpindahan",
          description:
            "Perbarui status tagihan penyewaan ini terlebih dahulu. Setelah tanggal tagihan berikutnya sudah sesuai, coba tinjau kembali.",
        }
      : code === "TRANSFER_EFFECTIVE_DATE_NOT_BOUNDARY" ||
          code === "TRANSFER_EFFECTIVE_DATE_MUST_BE_FUTURE" ||
          code === "TRANSFER_EFFECTIVE_DATE_INVALID" ||
          code === "TRANSFER_BOUNDARY_INVALID"
        ? {
            title: "Tanggal perpindahan belum sesuai jadwal tagihan",
            description:
              "Gunakan tanggal rekomendasi yang ditampilkan sistem atau pilih salah satu tanggal perpindahan yang tersedia.",
          }
        : code === "TRANSFER_TARGET_ROOM_GENDER_INCOMPATIBLE"
          ? {
              title: "Kamar tidak sesuai jenis kelamin penghuni",
              description:
                "Pilih kamar Putra, Putri, atau Campuran yang sesuai dengan data penghuni.",
            }
          : {
              title: "Rencana pindah kamar belum dapat ditampilkan",
              description:
                "Data mungkin berubah saat diperiksa. Muat ulang data, pilih kamar kembali, lalu coba lagi.",
            };

  return (
    <div className="rounded-xl border border-destructive/35 bg-destructive/10 p-4" role="alert">
      <div className="flex gap-3">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="space-y-2">
          <p className="font-semibold text-foreground">{content.title}</p>
          <p className="text-sm text-muted-foreground">{content.description}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Coba lagi
          </Button>
        </div>
      </div>
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
    <Card className="border-border bg-card shadow-sm">
      <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldAlert className="h-8 w-8 text-muted-foreground" />
        <p className="font-semibold text-foreground">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        <Button variant="secondary" onClick={onClose}>
          Kembali ke detail
        </Button>
      </CardContent>
    </Card>
  );
}

export function ActionDeniedPanel({ title, description }: { title: string; description: string }) {
  return (
    <Card className="border-amber-500/35 bg-amber-500/10 shadow-sm">
      <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldAlert className="h-7 w-7 text-amber-600 dark:text-amber-300" />
        <p className="font-semibold text-foreground">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
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
    <Card className="border-emerald-500/35 bg-emerald-500/10 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-300" /> Pindah kamar
          berhasil
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-foreground">
        <p>
          Penghuni telah dipindahkan ke kamar {result.targetLease.room.number}. Riwayat kamar lama,
          tagihan, dan security deposit tetap tersimpan.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <KeyValue
            label="Security deposit yang dialihkan"
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
          <Button onClick={() => onOpenLease(result.targetLease.id)}>Buka penyewaan baru</Button>
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
      <Field label="Alasan pindah kamar" required>
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
            placeholder="Jelaskan alasan pindah kamar"
          />
        </Field>
      ) : (
        <Field label="Detail alasan (opsional)">
          <Textarea
            value={reasonDetail}
            maxLength={2000}
            rows={3}
            onChange={(event) => onReasonDetail(event.target.value)}
            placeholder="Keterangan tambahan bila diperlukan"
          />
        </Field>
      )}
    </div>
  );
}

function CommandStateBadge({ command }: { command: TransferCommand }) {
  const tone =
    command.state === "scheduled"
      ? "border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-200"
      : command.state === "executed"
        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200"
        : command.state === "cancelled"
          ? "border-border bg-muted text-muted-foreground"
          : "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-200";
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
  residentGender,
  onClose,
  onOpenLease,
}: {
  leaseId: string;
  leaseStatus: "active" | "ended" | "cancelled" | "transferred";
  canManage: boolean;
  canFinancial: boolean;
  transferFlagEnabled: boolean;
  residentGender?: ResidentGender;
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
  const compatibleRooms = useMemo(
    () =>
      (rooms.data?.items ?? []).filter((room) =>
        isTransferRoomGenderCompatible(room.genderPolicy, residentGender),
      ),
    [residentGender, rooms.data?.items],
  );

  const transfer = useM6LeaseMutation(
    "lease-transfer",
    "Pindah kamar berhasil diproses",
    (_propertyId, input: TransferInput & { idempotencyKey: string }) =>
      adminUxLeaseApi.transfer.command(leaseId, input, input.idempotencyKey),
  );
  const schedule = useM6LeaseMutation(
    "lease-transfer-schedule",
    "Jadwal pindah kamar berhasil dibuat",
    (_propertyId, input: TransferScheduleInput & { idempotencyKey: string }) =>
      adminUxLeaseApi.transfer.schedule(leaseId, input, input.idempotencyKey),
  );
  const cancel = useM6LeaseMutation(
    "lease-transfer-cancel",
    "Jadwal pindah kamar dibatalkan",
    (_propertyId, input: { commandId: string; reason: string; idempotencyKey: string }) =>
      adminUxLeaseApi.transfer.cancel(leaseId, input.commandId, input.reason, input.idempotencyKey),
  );

  const allowed = transferFlagEnabled && canManage && leaseStatus === "active";
  const topUpRequiredAmount = preview?.deposit.topUpRequiredAmount ?? 0;
  const topUpPaymentValid =
    topUpRequiredAmount === 0 ||
    hasRequiredLeasePaymentReference(topUpRequiredAmount, topUpReferenceNumber);
  const today = useMemo(() => jakartaToday(), []);
  const reasonValid = reasonCode !== "other" || reasonDetail.trim().length > 0;
  const sameDayValid = exceptionReason.trim().length > 0;

  const canPreview = allowed && Boolean(targetRoomId);

  const previewTransfer = async (options?: { targetRoomId?: string; effectiveDate?: string }) => {
    const roomId = options?.targetRoomId ?? targetRoomId;
    const requestedDate =
      path === "same_day_exception"
        ? today
        : (options?.effectiveDate ?? scheduledDate) || undefined;
    if (!allowed || !roomId) return;
    setPreviewError(null);
    setResult(null);
    setScheduleNotice(null);
    try {
      const response = await adminUxLeaseApi.transfer.preview(leaseId, {
        targetRoomId: roomId,
        effectiveDate: requestedDate,
        transferPath: path,
      });
      setPreview(response);
      if (path === "end_period") setScheduledDate(response.effectiveDate);
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
        `Pindah kamar dijadwalkan pada ${formatDate(response.scheduledTransfer.effectiveDate)}. Perubahan akan diproses otomatis pada tanggal tersebut.`,
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
        title="Pindah kamar belum tersedia"
        description="Fitur ini belum diaktifkan untuk properti yang sedang dipilih."
        onClose={onClose}
      />
    );
  if (!canManage || leaseStatus !== "active")
    return (
      <ActionDeniedPanel
        title="Pindah kamar tidak tersedia"
        description="Pindah kamar hanya dapat dilakukan oleh Admin pada penyewaan yang masih aktif."
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
    <Card className="border-border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <ArrowLeftRight className="h-5 w-5 text-primary" /> Pindah Kamar
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Pilih kamar tujuan. Sistem akan memeriksa tagihan, tanggal perpindahan, dan security
          deposit sebelum perubahan disimpan.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex gap-3">
            <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="space-y-2">
              <p className="font-semibold text-foreground">Sebelum memindahkan penghuni</p>
              <ol className="list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
                <li>Pilih cara perpindahan dan kamar kosong yang sesuai.</li>
                <li>Tinjau tanggal rekomendasi, tagihan, dan security deposit.</li>
                <li>Isi alasan, lalu jadwalkan atau proses perpindahan hari ini.</li>
              </ol>
              <p className="text-xs text-muted-foreground">
                Data penghuni, masa sewa, pembayaran, dan riwayat kamar tidak dihapus.
              </p>
            </div>
          </div>
        </div>
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
          <TabsList className="grid h-auto w-full grid-cols-1 gap-1 bg-muted p-1 sm:grid-cols-2">
            <TabsTrigger
              value="end_period"
              className="min-h-11 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Batas periode tagihan
            </TabsTrigger>
            <TabsTrigger
              value="same_day_exception"
              className="min-h-11 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Pengecualian hari yang sama
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {path === "same_day_exception" ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">
            Perpindahan diproses hari ini. Gunakan pilihan ini hanya bila penghuni tidak dapat
            menunggu tanggal tagihan berikutnya, lalu catat alasannya.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Ini pilihan yang disarankan. Sistem akan memilih tanggal tagihan terdekat agar riwayat
            sewa dan tagihan tetap rapi.
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {path === "same_day_exception" ? (
            <Field label="Tanggal efektif">
              <div className="flex min-h-11 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-medium text-foreground">
                {formatDate(today)}
              </div>
              <p className="text-xs text-muted-foreground">
                Perpindahan langsung berlaku hari ini.
              </p>
            </Field>
          ) : (
            <HeroUiDatePicker
              id="transfer-effective-date"
              label="Tanggal pindah yang direkomendasikan"
              required
              disabled
              value={scheduledDate}
              placeholder="Dipilih otomatis oleh sistem"
              description={
                scheduledDate
                  ? "Tanggal ini dipilih dari batas periode tagihan terdekat. Tanggal alternatif hanya dapat dipilih dari daftar tanggal yang disahkan sistem."
                  : "Pilih kamar tujuan; sistem akan mengisi tanggal sah yang paling dekat."
              }
              onChange={() => undefined}
            />
          )}
          <Field label="Kamar tujuan" required>
            <RoomPicker
              rooms={compatibleRooms}
              value={targetRoomId}
              onChange={(value) => {
                setTopUpReferenceNumber("");
                setTargetRoomId(value);
                setScheduledDate("");
                setPreview(null);
                intentKey.current = null;
                void previewTransfer({ targetRoomId: value, effectiveDate: undefined });
              }}
            />
            <p className="text-xs text-muted-foreground">
              Hanya kamar kosong yang sesuai jenis kelamin penghuni yang ditampilkan.
            </p>
          </Field>
        </div>
        {path === "end_period" && scheduledCommand ? (
          <ActionDeniedPanel
            title="Sudah ada jadwal pindah kamar"
            description={`Perpindahan sudah dijadwalkan pada ${formatDate(scheduledCommand.effectiveDate)}. Batalkan jadwal tersebut sebelum membuat jadwal baru.`}
          />
        ) : null}
        {scheduleNotice ? (
          <p
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-foreground"
            role="status"
          >
            {scheduleNotice}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!canPreview} onClick={() => void previewTransfer()}>
            <FileText className="mr-2 h-4 w-4" /> Tinjau Perpindahan
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
        </div>
        {previewError ? (
          <PreviewErrorNotice error={previewError} onRetry={() => void previewTransfer()} />
        ) : null}
        {preview ? (
          <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div>
              <p className="font-semibold text-foreground">Ringkasan Pindah Kamar</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Periksa kembali kamar, tanggal, tagihan, dan security deposit sebelum melanjutkan.
              </p>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <KeyValue
                label="Kamar tujuan"
                value={preview.targetRoom.number + " · " + preview.targetRoom.kostType.name}
              />
              <KeyValue
                label="Tanggal efektif"
                value={
                  formatDate(preview.effectiveDate) +
                  (preview.transferPath === "end_period"
                    ? " · mengikuti jadwal tagihan"
                    : " · berlaku hari ini")
                }
              />
              <KeyValue
                label="Security deposit yang sudah tercatat"
                value={formatIDR(preview.deposit.carriedAmount)}
              />
              <KeyValue
                label="Ketentuan security deposit kamar tujuan"
                value={
                  preview.deposit.targetRequiredAmount > 0
                    ? formatIDR(preview.deposit.targetRequiredAmount)
                    : "Belum ditentukan"
                }
              />
              <KeyValue
                label="Tagihan kamar lama yang belum dibayar"
                value={formatIDR(preview.oldOutstandingAmount)}
              />
              <KeyValue
                label="Tagihan setelah pindah"
                value={
                  preview.billing.targetInvoiceWillBeIssued
                    ? "Dibuat pada tanggal perpindahan"
                    : "Mulai siklus berikutnya"
                }
              />
              <KeyValue
                label="Tanggal rutin tagihan"
                value={`Setiap tanggal ${preview.billing.billingAnchorDay}`}
              />
              <KeyValue
                label="Sewa tetap berakhir"
                value={formatDate(preview.billing.contractualEndDate)}
              />
            </div>
            {preview.transferPath === "end_period" && preview.validEffectiveDates.length > 0 ? (
              <Field label="Pilihan tanggal perpindahan">
                <Select
                  value={
                    preview.validEffectiveDates.includes(scheduledDate) ? scheduledDate : "none"
                  }
                  onValueChange={(value) => {
                    if (value === "none") return;
                    setScheduledDate(value);
                    setPreview(null);
                    intentKey.current = null;
                    void previewTransfer({ effectiveDate: value });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih tanggal batas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Pilih tanggal perpindahan</SelectItem>
                    {preview.validEffectiveDates.map((date) => (
                      <SelectItem key={date} value={date}>
                        {formatDate(date)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Tanggal alternatif hanya dapat dipilih dari daftar tanggal yang disahkan sistem
                  dan tetap mengikuti jadwal tagihan penghuni.
                </p>
              </Field>
            ) : null}
            <div className="flex gap-2 rounded-lg border border-border bg-background/60 p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>
                Masa sewa tidak diperpanjang. Tagihan lama tetap tercatat pada kamar sebelumnya,
                sedangkan kamar lama perlu diperiksa sebelum dapat dipakai kembali.
              </p>
            </div>
            {path === "same_day_exception" && topUpRequiredAmount > 0 ? (
              canFinancial ? (
                <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground">
                      Selisih security deposit: {formatIDR(topUpRequiredAmount)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Nominal ini melengkapi security deposit kamar tujuan. Nilainya terpisah dari
                      DP dan pembayaran sewa.
                    </p>
                  </div>
                  <Field label="Metode pembayaran selisih deposit" required>
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
                  <Field label="Referensi pembayaran selisih deposit" required>
                    <Input
                      value={topUpReferenceNumber}
                      maxLength={256}
                      onChange={(event) => {
                        setTopUpReferenceNumber(event.target.value);
                        intentKey.current = null;
                      }}
                      placeholder="Masukkan nomor referensi pembayaran"
                    />
                  </Field>
                </div>
              ) : (
                <ActionDeniedPanel
                  title="Selisih security deposit memerlukan izin pembayaran"
                  description="Akun ini dapat meninjau rencana, tetapi tidak memiliki izin untuk mencatat pembayaran selisih security deposit."
                />
              )
            ) : null}
            {path === "end_period" && topUpRequiredAmount > 0 ? (
              <ActionDeniedPanel
                title="Security deposit kamar tujuan belum terpenuhi"
                description="Security deposit yang sudah tercatat lebih kecil daripada ketentuan kamar tujuan. Pilih kamar dengan ketentuan deposit yang sama, atau gunakan perpindahan hari ini agar Admin berizin dapat mencatat selisihnya."
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
                  placeholder="Jelaskan mengapa perpindahan harus dilakukan hari ini"
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
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Proses Pindah Kamar Hari Ini
                </>
              ) : (
                <>
                  <CalendarClock className="mr-2 h-4 w-4" /> Jadwalkan Pindah Kamar
                </>
              )}
            </Button>
          </div>
        ) : null}
        <section aria-label="Riwayat rencana pindah kamar" className="space-y-3">
          <p className="font-semibold text-foreground">Riwayat rencana pindah kamar</p>
          {commands.isLoading ? (
            <LoadingState label="Memuat rencana pindah kamar..." />
          ) : commands.error ? (
            <ErrorState
              error={commands.error}
              title="Gagal memuat rencana pindah kamar"
              onRetry={() => void commands.refetch()}
            />
          ) : (commands.data?.items ?? []).length === 0 ? (
            <EmptyState title="Belum ada rencana pindah kamar" />
          ) : (
            <ul className="space-y-2">
              {(commands.data?.items ?? []).map((command) => (
                <li
                  key={command.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/70 p-3"
                >
                  <div className="space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">
                        {formatDate(command.effectiveDate)}
                      </span>
                      <CommandStateBadge command={command} />
                      <Badge variant="outline">
                        {TRANSFER_REASON_LABEL[command.reasonCode] ?? command.reasonCode}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {command.transferPath === "same_day_exception"
                        ? "Pengecualian hari yang sama"
                        : "Batas periode tagihan"}
                      {command.sourceEndDate
                        ? ` · sewa berakhir: ${formatDate(command.sourceEndDate)}`
                        : ""}
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
          path === "same_day_exception"
            ? "Konfirmasi pindah kamar hari ini"
            : "Jadwalkan pindah kamar"
        }
        description={
          path === "same_day_exception" ? (
            <span>
              Penghuni akan berpindah kamar hari ini. Masa sewa tetap berakhir pada tanggal semula,
              tagihan lama tetap tercatat, dan kamar sebelumnya perlu diperiksa sebelum digunakan
              kembali.
            </span>
          ) : (
            <span>
              Rencana akan dicatat sekarang dan perpindahan diproses otomatis pada
              {scheduledDate ? ` ${formatDate(scheduledDate)}` : " tanggal yang dipilih"}. Sistem
              akan memeriksa kembali ketersediaan kamar dan tagihan sebelum memindahkan penghuni.
            </span>
          )
        }
        confirmLabel={
          path === "same_day_exception" ? "Proses Pindah Kamar" : "Jadwalkan Pindah Kamar"
        }
        pending={transfer.isPending || schedule.isPending}
        onConfirm={path === "same_day_exception" ? submitSameDay : submitSchedule}
      />
      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        title="Batalkan rencana pindah kamar"
        description={
          <span>
            Pembatalan hanya menghapus jadwal perpindahan. Kamar, masa sewa, tagihan, dan security
            deposit tidak berubah.
          </span>
        }
        confirmLabel="Batalkan Rencana"
        pending={cancel.isPending}
        reason={{
          label: "Alasan pembatalan",
          placeholder: "Jelaskan alasan pembatalan rencana pindah kamar",
        }}
        onConfirm={submitCancel}
      />
    </Card>
  );
}
