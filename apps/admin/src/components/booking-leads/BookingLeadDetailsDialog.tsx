import { useMemo } from "react";
import {
  CalendarClock,
  CircleDollarSign,
  Globe2,
  House,
  Loader2,
  LockKeyhole,
  MonitorSmartphone,
  ReceiptText,
  UserRoundCheck,
} from "lucide-react";
import { BookingLeadStatusBadge } from "@/components/booking-leads/BookingLeadStatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BOOKING_LEAD_CATEGORY_LABEL,
  BOOKING_LEAD_GENDER_LABEL,
  BOOKING_LEAD_SOURCE_LABEL,
  BOOKING_LEAD_STATUS_LABEL,
  useBookingLeadProgress,
  type BookingLeadRecord,
  type BookingLeadProgress,
} from "@/hooks/useBookingLeads";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  lead: BookingLeadRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewResident?: (residentId: string) => void;
  onViewRoom?: (roomNumber: string) => void;
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-muted/20 p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-foreground">
        {value || "Belum tersedia"}
      </dd>
    </div>
  );
}

function SourceBadge({ source }: { source: BookingLeadRecord["source"] }) {
  const isPublic = source === "public_kamar";
  const Icon = isPublic ? Globe2 : MonitorSmartphone;
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        isPublic
          ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
          : "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {BOOKING_LEAD_SOURCE_LABEL[source]}
    </span>
  );
}

function HoldLabel(progress: BookingLeadProgress | undefined) {
  if (!progress?.hold) return "Belum ada kamar yang ditahan";
  if (progress.hold.status === "active") return "Kamar ditahan";
  if (progress.hold.status === "expired") return "Tahan kamar kedaluwarsa";
  return "Tahan kamar dilepaskan";
}

function PaymentTypeLabel(
  type: NonNullable<BookingLeadProgress["paymentCommitment"]>["paymentType"],
) {
  return {
    booking_fee: "Booking Fee",
    down_payment: "DP / Uang Muka Sewa",
    full_settlement: "Pelunasan Langsung",
  }[type];
}

function PaymentMethodLabel(
  method: NonNullable<BookingLeadProgress["paymentCommitment"]>["paymentMethod"],
) {
  return method === "cash" ? "Tunai" : "Transfer Bank";
}

function ProgressTimeline({ progress }: { progress: BookingLeadProgress }) {
  const occupied = progress.tenancy?.occupancyStatus === "active";
  const steps = [
    {
      icon: CalendarClock,
      title: "Minat booking dicatat",
      detail: formatDate(progress.recordedAt),
      done: true,
    },
    {
      icon: LockKeyhole,
      title: HoldLabel(progress),
      detail: progress.hold
        ? `${progress.hold.roomNumber ?? "Kamar"} · ${
            progress.hold.status === "active"
              ? `berlaku hingga ${formatDate(progress.hold.expiresAt)}`
              : formatDate(progress.hold.releasedAt ?? progress.hold.expiresAt)
          }`
        : "Admin perlu menahan kamar sebelum proses berikutnya.",
      done: Boolean(progress.hold),
      current: progress.hold?.status === "active",
    },
    {
      icon: ReceiptText,
      title: progress.paymentCommitment
        ? "Pembayaran awal dicatat"
        : "Pembayaran awal belum dicatat",
      detail: progress.paymentCommitment
        ? `${PaymentTypeLabel(progress.paymentCommitment.paymentType)} · ${rupiah.format(
            progress.paymentCommitment.rentCreditAmount,
          )} · ${
            progress.paymentCommitment.verificationStatus === "verified"
              ? "terverifikasi"
              : "menunggu konfirmasi"
          }`
        : "Selesaikan minat booking untuk mencatat komitmen pembayaran.",
      done: Boolean(progress.paymentCommitment),
      current: Boolean(progress.paymentCommitment && !progress.paymentCommitment.materializedAt),
    },
    {
      icon: UserRoundCheck,
      title: progress.onboarding ? "Data penyewaan dikomit" : "Data penyewaan belum dilengkapi",
      detail: progress.onboarding
        ? progress.onboarding.committedAt
          ? `Dikomit ${formatDate(progress.onboarding.committedAt)}`
          : "Sedang diproses"
        : "Lengkapi data penyewaan setelah pembayaran awal dicatat.",
      done: Boolean(progress.onboarding),
      current: Boolean(progress.onboarding && !progress.tenancy),
    },
    {
      icon: House,
      title: occupied
        ? "Sudah dihuni"
        : progress.tenancy
          ? "Menunggu aktivasi kamar"
          : "Kamar belum dihuni",
      detail: occupied
        ? `Aktif sejak ${formatDate(progress.tenancy?.occupancyStartedAt ?? progress.tenancy!.startDate)}`
        : progress.tenancy
          ? "Aktivasi kamar adalah perintah terpisah setelah kewajiban terverifikasi."
          : "Occupancy belum dibuat.",
      done: occupied,
      current: Boolean(progress.tenancy && !occupied),
    },
  ];
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => {
        const Icon = step.icon;
        return (
          <li key={step.title} className="relative flex gap-3">
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute top-9 bottom-[-14px] left-[17px] w-px bg-border"
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                step.done
                  ? "border-success/40 bg-success/15 text-success"
                  : step.current
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-muted/40 text-muted-foreground",
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
            </span>
            <div className="min-w-0 pb-3">
              <p className="text-sm font-semibold text-foreground">{step.title}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{step.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function BookingLeadDetailsDialog({
  lead,
  open,
  onOpenChange,
  onViewResident,
  onViewRoom,
}: Props) {
  const progressQuery = useBookingLeadProgress(open ? (lead?.id ?? null) : null);
  const progress = progressQuery.data;
  const roomTarget = lead?.roomNumber
    ? [lead.roomNumber, lead.buildingCode, lead.floorCode ? `Lantai ${lead.floorCode}` : null]
        .filter(Boolean)
        .join(" · ")
    : "Belum dipilih";
  const activeTenancy = progress?.tenancy?.occupancyStatus === "active";
  const activeRoomNumber = progress?.targetRoomNumber ?? lead?.roomNumber ?? null;

  const leadJourney = useMemo(() => {
    if (!progress) return "Memuat progres minat, pembayaran, dan tenancy terkait.";
    if (progress.tenancy?.occupancyStatus === "active") {
      return "Data ini telah melewati proses minat booking dan penghuni sudah menempati kamar.";
    }
    if (progress.tenancy) return "Penyewaan telah dikomit dan masih menunggu aktivasi kamar.";
    if (progress.onboarding) return "Data penyewaan sedang menunggu pembentukan lease.";
    return "Minat booking tetap terpisah dari hold, komitmen pembayaran, lease, dan occupancy.";
  }, [progress]);

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto p-0">
        <div className="border-b border-border px-6 py-5">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2 pr-8">
              <DialogTitle>
                {activeTenancy ? "Detail Penyewa Aktif" : "Detail calon penyewa"}
              </DialogTitle>
              <SourceBadge source={lead.source} />
            </div>
            <DialogDescription>{leadJourney}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-6 px-6 py-5">
          {activeTenancy ? (
            <section
              aria-label="Aksi cepat penyewa aktif"
              className="flex flex-col gap-3 rounded-xl border border-success/35 bg-success/5 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Aksi cepat penyewa aktif</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Buka detail operasional penghuni atau kamar tanpa meninggalkan konteks minat
                  booking.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="min-h-11"
                  type="button"
                  variant="outline"
                  disabled={!progress?.tenancy?.residentId}
                  onClick={() =>
                    progress?.tenancy?.residentId && onViewResident?.(progress.tenancy.residentId)
                  }
                >
                  <UserRoundCheck className="mr-2 h-4 w-4" aria-hidden="true" /> Lihat Detail
                  Penghuni Penghuni
                </Button>
                <Button
                  className="min-h-11"
                  type="button"
                  variant="outline"
                  disabled={!activeRoomNumber}
                  onClick={() => activeRoomNumber && onViewRoom?.(activeRoomNumber)}
                >
                  <House className="mr-2 h-4 w-4" aria-hidden="true" /> Lihat Detail Kamar
                </Button>
              </div>
            </section>
          ) : null}
          <section
            aria-labelledby="booking-progress-heading"
            className="rounded-xl border border-border bg-muted/10 p-4"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2
                  id="booking-progress-heading"
                  className="text-base font-semibold text-foreground"
                >
                  Progres minat booking
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Status hanya berubah berdasarkan hold, komitmen pembayaran, lease, dan occupancy
                  yang tercatat.
                </p>
              </div>
              <BookingLeadStatusBadge
                label={BOOKING_LEAD_STATUS_LABEL[lead.status]}
                status={lead.status}
              />
            </div>
            {progressQuery.isPending ? (
              <div className="flex min-h-36 items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Memuat riwayat progres...
              </div>
            ) : progressQuery.isError || !progress ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Riwayat progres belum dapat dimuat. Informasi calon penyewa di bawah tetap tersedia.
                <Button
                  className="ml-3 min-h-9"
                  size="sm"
                  variant="outline"
                  onClick={() => void progressQuery.refetch()}
                >
                  Coba lagi
                </Button>
              </div>
            ) : (
              <ProgressTimeline progress={progress} />
            )}
          </section>

          {progress ? (
            <section aria-labelledby="payment-progress-heading">
              <div className="mb-3 flex items-center gap-2">
                <CircleDollarSign aria-hidden="true" className="h-4 w-4 text-primary" />
                <h2
                  id="payment-progress-heading"
                  className="text-base font-semibold text-foreground"
                >
                  Ringkasan pembayaran dan sewa
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Detail
                  label="Kredit sewa awal"
                  value={
                    progress.paymentCommitment
                      ? rupiah.format(progress.paymentCommitment.rentCreditAmount)
                      : "Belum dicatat"
                  }
                />
                <Detail
                  label="Total sewa kontrak"
                  value={
                    progress.tenancy
                      ? rupiah.format(progress.tenancy.contractRentAmount)
                      : "Belum dikomit"
                  }
                />
                <Detail
                  label="Pembayaran ledger"
                  value={`${progress.paymentSummary.paymentCount} transaksi`}
                />
                <Detail
                  label="Terverifikasi di ledger"
                  value={rupiah.format(progress.paymentSummary.verifiedAmount)}
                />
              </div>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Detail
                  label="Jenis dan metode pembayaran awal"
                  value={
                    progress.paymentCommitment
                      ? `${PaymentTypeLabel(progress.paymentCommitment.paymentType)} · ${PaymentMethodLabel(progress.paymentCommitment.paymentMethod)}`
                      : null
                  }
                />
                <Detail
                  label="Status pembayaran awal"
                  value={
                    progress.paymentCommitment
                      ? progress.paymentCommitment.verificationStatus === "verified"
                        ? "Terverifikasi"
                        : "Menunggu konfirmasi"
                      : null
                  }
                />
                <Detail
                  label="Security deposit tercatat"
                  value={
                    progress.paymentCommitment
                      ? rupiah.format(progress.paymentCommitment.securityDepositAmount)
                      : "Belum dicatat"
                  }
                />
                <Detail
                  label="Saldo security deposit"
                  value={
                    progress.tenancy
                      ? rupiah.format(progress.paymentSummary.securityDepositBalance)
                      : "Belum menjadi ledger"
                  }
                />
                <Detail
                  label="Menunggu konfirmasi di ledger"
                  value={rupiah.format(progress.paymentSummary.pendingAmount)}
                />
                <Detail
                  label="Status penyewaan"
                  value={
                    progress.tenancy
                      ? progress.tenancy.occupancyStatus === "active"
                        ? "Sudah dihuni"
                        : "Menunggu aktivasi kamar"
                      : "Belum menjadi penyewaan"
                  }
                />
              </dl>
            </section>
          ) : null}

          <section aria-labelledby="lead-data-heading">
            <h2 id="lead-data-heading" className="mb-3 text-base font-semibold text-foreground">
              {activeTenancy ? "Data penyewa aktif" : "Data minat booking"}
            </h2>
            <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Detail label="Calon Penyewa" value={lead.visitorName} />
              <Detail label="Nomor WhatsApp" value={lead.visitorPhone} />
              <Detail label="Kategori Kost" value={BOOKING_LEAD_CATEGORY_LABEL[lead.category]} />
              <Detail label="Jenis Kelamin" value={BOOKING_LEAD_GENDER_LABEL[lead.gender]} />
              <Detail label="Universitas/Pendidikan" value={lead.visitorUniversity} />
              <div className="min-w-0 rounded-xl border border-border bg-muted/20 p-3">
                <dt className="text-xs font-medium text-muted-foreground">Sumber</dt>
                <dd className="mt-2">
                  <SourceBadge source={lead.source} />
                </dd>
              </div>
              <Detail label="Kamar/Target" value={progress?.hold?.roomNumber ?? roomTarget} />
              <Detail
                label={activeTenancy ? "Tanggal mulai sewa" : "Rencana Masuk"}
                value={
                  activeTenancy
                    ? progress?.tenancy?.startDate
                      ? formatDate(progress.tenancy.startDate)
                      : null
                    : lead.preferredMoveInDate
                      ? formatDate(lead.preferredMoveInDate)
                      : null
                }
              />
              <Detail label="Status minat booking" value={BOOKING_LEAD_STATUS_LABEL[lead.status]} />
              <Detail label="Dicatat" value={formatDate(lead.createdAt)} />
              <div className="sm:col-span-2">
                <Detail label="Alamat" value={lead.visitorAddress} />
              </div>
              <div className="sm:col-span-2">
                <Detail label="Catatan calon penyewa" value={lead.visitorMessage} />
              </div>
            </dl>
          </section>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button className="min-h-11" variant="outline" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
