import { Link, useNavigate } from "@tanstack/react-router";
import type { FileResponse } from "@granada-kost/domain";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BadgeInfo,
  Bell,
  Building2,
  CalendarCheck2,
  CalendarClock,
  Car,
  CircleAlert,
  Clock3,
  CreditCard,
  Download,
  FileText,
  Landmark,
  KeyRound,
  MessageSquare,
  Pencil,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RecordPaymentDialog } from "@/components/billing/W06PaymentsWorkspace";
import { BookingLeadCancellationDialog } from "@/components/booking-leads/BookingLeadCancellationDialog";
import { FileUploadField } from "@/components/file/FileUploadField";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
import { ResidentFormDialog } from "@/components/forms/ResidentFormDialog";
import { TransferPanel } from "@/components/leases/TransferPanel";
import { ErrorState } from "@/components/state/ErrorState";
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
import { NoticeAlert, type NoticeAlertTone } from "@/components/ui/notice-alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCancelLeaseTermination,
  useExtendContractSettlement,
  useFinalizeLeaseTermination,
  useStartLeaseTermination,
} from "@/hooks/useAdminW06Billing";
import { useLeaseActivation } from "@/hooks/useLeaseActivation";
import { useResidentDetail, useResidentTenancy } from "@/hooks/useResidents";
import { useBookingLeadProgress } from "@/hooks/useBookingLeads";
import { useResidentAccountSummary, useResetResidentPassword } from "@/hooks/useResidentMutations";
import { useResidentBilling } from "@/hooks/useAdminW06Billing";
import type { ResidentBilling } from "@/lib/admin-w06-billing";
import { downloadAdminReceiptDocument } from "@/lib/admin-w06-billing";
import type { ResidentDetail, ResidentTenancy } from "@/lib/admin-resident";
import { canRunTransferTopUp } from "@/lib/admin-ux-lease-helpers";
import { useAuth } from "@/lib/auth";
import { isAdminUxLeaseTransferEnabled } from "@/lib/features";
import { newIdempotencyKey } from "@/lib/idempotency";
import { useProperty } from "@/lib/property";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp-lead";
import { AccountStatusPill, formatResidentDate, ResidentStatusPill } from "@/routes/tenants";

type Props = { residentId: string };

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

const paymentPlan = {
  annual_full: "Pelunasan penuh sebelum tenggat",
  monthly_installments: "Pembayaran bertahap hingga tenggat",
  two_month_installments: "Pembayaran bertahap hingga tenggat",
} as const;

const gender = { male: "Putra", female: "Putri", other: "Lainnya" } as const;

function formatResidentDetailDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatResidentDetailTimestamp(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  })
    .format(new Date(value))
    .replace(".", ":");
}

function settlementStatusLabel(
  status: NonNullable<ResidentBilling["contract_settlement"]>["status"],
) {
  return {
    awaiting_activation: "Menunggu aktivasi",
    open: "Belum lunas",
    extended: "Tenggat diperpanjang",
    overdue: "Tunggakan",
    admin_action_required: "Tindakan admin diperlukan",
    termination_pending: "Pemberhentian diproses",
    terminated: "Sewa dihentikan",
    paid: "Lunas",
  }[status];
}

function jakartaStartOfDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatActivationDate(value: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  })
    .format(value)
    .replace(".", ":");
}

function formatRemainingActivationTime(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [days ? `${days} hari` : null, hours ? `${hours} jam` : null];
  if (days === 0) parts.push(`${minutes} menit`);
  return parts.filter(Boolean).join(" ");
}

function ActivationAvailabilityNotice({
  roomNumber,
  startDate,
  onDismiss,
}: {
  roomNumber: string;
  startDate: string;
  onDismiss: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const availableAt = jakartaStartOfDay(startDate);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = availableAt ? availableAt.getTime() - now : 0;
  const isWaitingForCheckIn = remaining > 0;

  return (
    <NoticeAlert
      tone={isWaitingForCheckIn ? "warning" : "success"}
      attention="subtle"
      title={isWaitingForCheckIn ? "Kamar dipesan — menunggu aktivasi" : "Kamar siap diaktivasi"}
      description={
        <div className="space-y-1.5">
          <p>Kamar {roomNumber} sudah dipesan, tetapi belum dianggap dihuni.</p>
          {availableAt && isWaitingForCheckIn ? (
            <p className="font-medium text-foreground">
              Aktivasi paling awal {formatActivationDate(availableAt)} WIB
              <span className="font-normal text-foreground/70">
                {" "}
                ({formatRemainingActivationTime(remaining)} lagi).
              </span>
            </p>
          ) : (
            <p>
              Tanggal mulai sewa telah tiba. Periksa kewajiban pembayaran, lalu lakukan aktivasi
              kamar.
            </p>
          )}
        </div>
      }
      onDismiss={onDismiss}
      dismissLabel="Tutup pengingat aktivasi kamar"
    />
  );
}

function ActivationRoomAction({
  startDate,
  onActivate,
}: {
  startDate: string;
  onActivate: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const availableAt = jakartaStartOfDay(startDate);
  const isWaitingForCheckIn = Boolean(availableAt && availableAt.getTime() > now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (isWaitingForCheckIn && availableAt) {
    return (
      <Button
        className="min-h-11"
        disabled
        title={`Aktivasi tersedia ${formatActivationDate(availableAt)} WIB`}
      >
        <CalendarClock className="mr-1 h-4 w-4" /> Aktivasi belum tersedia
      </Button>
    );
  }

  return (
    <Button className="min-h-11" onClick={onActivate}>
      <CalendarCheck2 className="mr-1 h-4 w-4" /> Aktivasi kamar
    </Button>
  );
}

type ResidentGuidanceItem = {
  id: string;
  tone: NoticeAlertTone;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
};

type SettlementGuidance = Omit<ResidentGuidanceItem, "id">;

function firstPaymentCheckpointGuidance(
  settlement: NonNullable<ResidentBilling["contract_settlement"]>,
): SettlementGuidance | null {
  const checkpoint = settlement.first_payment_checkpoint;
  if (checkpoint.status === "not_required" || !checkpoint.due_at) return null;
  const dueLabel = formatResidentDetailTimestamp(checkpoint.due_at);

  if (checkpoint.status === "met_early") {
    return {
      tone: "success",
      title: "Checkpoint pembayaran pertama sudah terpenuhi lebih awal",
      description: `Pembayaran sewa tambahan ${rupiah(checkpoint.additional_payment_received)} sudah memenuhi target minimal ${rupiah(checkpoint.required_additional_amount)} sebelum ${dueLabel} WIB. Tidak perlu mencatat pembayaran lagi khusus pada bulan checkpoint.`,
    };
  }
  if (checkpoint.status === "met") {
    return {
      tone: "success",
      title: "Checkpoint pembayaran pertama terpenuhi",
      description: `Pembayaran sewa tambahan ${rupiah(checkpoint.additional_payment_received)} telah memenuhi target minimal ${rupiah(checkpoint.required_additional_amount)}. Sisa kontrak tetap mengikuti tenggat pelunasan akhir.`,
    };
  }
  if (checkpoint.status === "overdue") {
    return {
      tone: "warning",
      title: "Checkpoint pembayaran pertama terlewat",
      description: `Target pembayaran tambahan ${rupiah(checkpoint.required_additional_amount)} seharusnya tercatat paling lambat ${dueLabel} WIB. Masih kurang ${rupiah(checkpoint.remaining_amount)}; tindak lanjuti sebelum tenggat pelunasan akhir.`,
    };
  }
  return {
    tone: "info",
    title: "Checkpoint pembayaran pertama",
    description: `Sebelum ${dueLabel} WIB, catat pembayaran sewa tambahan minimal ${rupiah(checkpoint.required_additional_amount)}. DP dan booking fee adalah pembayaran awal; security deposit tidak dihitung sebagai sewa.`,
  };
}

function openSettlementGuidance(
  settlement: NonNullable<ResidentBilling["contract_settlement"]>,
  dueLabel: string,
): SettlementGuidance {
  const checkpointGuidance = firstPaymentCheckpointGuidance(settlement);
  if (
    checkpointGuidance &&
    ["pending", "overdue"].includes(settlement.first_payment_checkpoint.status)
  )
    return checkpointGuidance;
  const totalRentReceived = settlement.initial_rent_credit + settlement.payment_allocated;
  const paymentProgress =
    settlement.payment_allocated > 0
      ? `Pembayaran tambahan sudah tercatat; total pembayaran sewa yang diterima ${rupiah(totalRentReceived)}.`
      : `Total pembayaran sewa yang diterima saat ini ${rupiah(totalRentReceived)}.`;

  if (settlement.reminder_stage === "H-30") {
    return {
      tone: "info",
      title: "Pelunasan sewa tersisa 30 hari",
      description: `${paymentProgress} Tidak ada cicilan bulanan wajib. Sisa ${rupiah(settlement.outstanding_amount)} tetap harus dilunasi paling lambat ${dueLabel} WIB.`,
    };
  }

  if (settlement.reminder_stage === "H-14") {
    return {
      tone: "warning",
      title: "Pelunasan sewa tersisa 14 hari",
      description: `${paymentProgress} Tidak ada cicilan bulanan wajib, tetapi sisa ${rupiah(settlement.outstanding_amount)} perlu segera ditindaklanjuti sebelum ${dueLabel} WIB.`,
    };
  }

  if (settlement.reminder_stage === "H-7") {
    return {
      tone: "warning",
      title: "Pelunasan sewa tersisa 7 hari",
      description: `Sisa ${rupiah(settlement.outstanding_amount)} belum lunas. Catat pembayaran bila penghuni membayar; tenggat akhir tetap ${dueLabel} WIB.`,
    };
  }

  if (settlement.reminder_stage === "H-0") {
    return {
      tone: "warning",
      title: "Hari ini adalah tenggat pelunasan",
      description: `Sisa ${rupiah(settlement.outstanding_amount)} harus dilunasi sebelum ${dueLabel} WIB. Setelah tenggat, status tunggakan akan mulai dipantau.`,
    };
  }

  return (
    checkpointGuidance ?? {
      tone: "info",
      title: "Pelunasan sewa masih berjalan",
      description: `${paymentProgress} Sisa ${rupiah(settlement.outstanding_amount)} tetap harus dilunasi paling lambat ${dueLabel} WIB.`,
    }
  );
}

function residentGuidanceItems(
  resident: ResidentDetail,
  tenancy: ResidentTenancy | null,
  billing: ResidentBilling | null,
): ResidentGuidanceItem[] {
  const items: ResidentGuidanceItem[] = [];
  const settlement = billing?.contract_settlement;

  if (resident.accountStatus !== "active") {
    items.push({
      id: `account-${resident.accountStatus}`,
      tone: "warning",
      title: "Akun Penghuni perlu diperiksa",
      description:
        resident.accountStatus === "not_provisioned"
          ? "Akun akses Penghuni belum dibuat. Lengkapi akun sebelum menyerahkan akses aplikasi."
          : "Status akun tidak aktif. Periksa status akun sebelum meminta penghuni menggunakan aplikasi.",
    });
  }

  if (settlement) {
    const dueLabel = settlement.effective_due_at
      ? formatResidentDetailTimestamp(settlement.effective_due_at)
      : "setelah kamar diaktivasi";

    if (settlement.status === "paid") {
      items.push({
        id: "settlement-paid",
        tone: "success",
        title: "Pelunasan sewa selesai",
        description: `Seluruh sewa kontrak sebesar ${rupiah(settlement.contract_rent_amount)} telah diterima. Pantau masa sewa hingga tanggal berakhir.`,
      });
    } else if (settlement.status === "termination_pending") {
      items.push({
        id: "settlement-termination",
        tone: "destructive",
        title: "Proses pemberhentian sewa sedang berjalan",
        description:
          "Tinjau proses pemberhentian, kewajiban sewa, inspeksi kamar, dan penyelesaian security deposit sebelum checkout.",
      });
    } else if (settlement.admin_action_required) {
      items.push({
        id: "settlement-admin-action",
        tone: "destructive",
        title: "Tindakan admin diperlukan",
        description: `Sisa sewa ${rupiah(settlement.outstanding_amount)} telah melewati batas pembayaran sebagian. Catat pelunasan penuh atau mulai proses pemberhentian sewa.`,
      });
    } else if (settlement.status === "overdue") {
      items.push({
        id: "settlement-overdue",
        tone: "warning",
        title: "Pelunasan sewa melewati jatuh tempo",
        description: `Sisa ${rupiah(settlement.outstanding_amount)} belum dilunasi. Pembayaran sebagian masih dapat dicatat sampai akhir masa toleransi yang berlaku.`,
      });
    } else if (settlement.status === "extended") {
      items.push({
        id: "settlement-extended",
        tone: "primary",
        title: "Tenggat pelunasan diperpanjang",
        description: `Sisa ${rupiah(settlement.outstanding_amount)} harus diselesaikan paling lambat ${dueLabel} WIB. Perpanjangan berikutnya tidak tersedia.`,
      });
    } else if (settlement.status === "open") {
      const guidance = openSettlementGuidance(settlement, dueLabel);

      items.push({
        id: "settlement-open",
        ...guidance,
      });
    }
  }

  const pendingTransfers =
    billing?.payments.filter((payment) => payment.payment_status === "pending_confirmation") ?? [];
  if (pendingTransfers.length > 0) {
    const total = pendingTransfers.reduce((sum, payment) => sum + payment.amount, 0);
    items.push({
      id: "payment-pending-confirmation",
      tone: "warning",
      title: `${pendingTransfers.length} transfer menunggu konfirmasi`,
      description: `Periksa bukti transfer senilai ${rupiah(total)}. Pembayaran belum mengurangi kewajiban sewa sampai diverifikasi.`,
      actionHref: "/payments#pending",
      actionLabel: "Buka verifikasi pembayaran",
    });
  }

  if (
    tenancy?.leaseStatus === "active" &&
    billing &&
    billing.summary.security_deposit_required > billing.summary.deposit_collected
  ) {
    items.push({
      id: "deposit-incomplete",
      tone: "info",
      title: "Security deposit belum lengkap",
      description: `Masih perlu dicatat ${rupiah(billing.summary.security_deposit_required - billing.summary.deposit_collected)} sebagai jaminan kamar. Nilai ini terpisah dari pembayaran sewa.`,
    });
  }

  return items;
}

function ResidentGuidanceCards({
  resident,
  tenancy,
  billing,
  focusId,
}: {
  resident: ResidentDetail;
  tenancy: ResidentTenancy | null;
  billing: ResidentBilling | null;
  focusId?: string | null;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const items = residentGuidanceItems(resident, tenancy, billing).filter(
    (item) => !dismissed.includes(item.id),
  );
  const showActivation =
    tenancy?.leaseStatus === "awaiting_activation" && !dismissed.includes("activation");

  if (!showActivation && items.length === 0) return null;

  const dismiss = (id: string) => setDismissed((current) => [...current, id]);

  return (
    <section className="mb-5 space-y-3" aria-labelledby="resident-guidance-heading">
      <div>
        <h2 id="resident-guidance-heading" className="text-base font-semibold">
          Yang perlu diperhatikan
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pengingat berikut mengikuti status penyewaan dan pembayaran terbaru.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {showActivation && tenancy ? (
          <ActivationAvailabilityNotice
            roomNumber={tenancy.roomNumber}
            startDate={tenancy.startDate}
            onDismiss={() => dismiss("activation")}
          />
        ) : null}
        {items.map((item) => (
          <NoticeAlert
            key={item.id}
            id={item.id}
            tone={item.tone}
            attention="subtle"
            className={
              focusId === item.id
                ? "ring-2 ring-warning ring-offset-2 ring-offset-background"
                : undefined
            }
            title={item.title}
            description={item.description}
            action={
              item.actionHref ? (
                <a
                  href={item.actionHref}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-warning/45 bg-warning/15 px-3 text-sm font-semibold text-warning transition-colors hover:bg-warning/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {item.actionLabel}
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </a>
              ) : null
            }
            onDismiss={() => dismiss(item.id)}
            dismissLabel={`Tutup pengingat: ${item.title}`}
          />
        ))}
      </div>
    </section>
  );
}

export function ResidentDetailWorkspace({ residentId }: Props) {
  const { currentPropertyId } = useProperty();
  const { user, hasPermission, hasRole } = useAuth();
  const navigate = useNavigate();
  const detail = useResidentDetail(residentId);
  const tenancy = useResidentTenancy(residentId);
  const bookingProgress = useBookingLeadProgress(tenancy.data?.bookingLeadId ?? null);
  const billing = useResidentBilling(currentPropertyId, tenancy.data ? residentId : null);
  const activation = useLeaseActivation();
  const [editOpen, setEditOpen] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [confirmActivation, setConfirmActivation] = useState(false);
  const [cancellationOpen, setCancellationOpen] = useState(false);
  // W07B B5: same TransferPanel + same API authority as LeaseDetailPage.
  const [transferOpen, setTransferOpen] = useState(false);
  const transferPanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!transferOpen) return;

    const frame = window.requestAnimationFrame(() => {
      const panel = transferPanelRef.current;
      panel?.scrollIntoView({ behavior: "smooth", block: "start" });
      panel?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [transferOpen]);
  const [guidanceFocusId, setGuidanceFocusId] = useState<string | null>(null);

  useEffect(() => {
    if (!guidanceFocusId || !billing.data) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(guidanceFocusId);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    });
    const timer = window.setTimeout(() => setGuidanceFocusId(null), 4_500);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [billing.data, guidanceFocusId]);

  if (detail.error)
    return (
      <AppShell title="Detail Penghuni">
        <ErrorState
          error={detail.error}
          onRetry={() => detail.refetch()}
          title="Gagal memuat detail penghuni"
        />
      </AppShell>
    );
  if (detail.isLoading || !detail.data) return <LoadingPage />;

  const resident = detail.data;
  const currentTenancy = tenancy.data ?? null;
  const canManage = hasPermission("resident.manage");
  const canActivate =
    hasPermission("lease.manage") && currentTenancy?.leaseStatus === "awaiting_activation";
  const canCancelAwaitingActivation = Boolean(
    hasPermission("room.manage") &&
    currentTenancy?.bookingLeadId &&
    currentTenancy.leaseStatus === "awaiting_activation" &&
    bookingProgress.data?.paymentCommitment &&
    bookingProgress.data.paymentCommitment.paymentType !== "full_settlement" &&
    !bookingProgress.data.cancellation,
  );
  const summary = billing.data?.summary;
  const settlement = billing.data?.contract_settlement ?? null;
  const canManageBilling = hasPermission("billing.manage");
  const canManageTermination = hasRole("admin") && hasPermission("lease.manage");
  const transferFlagEnabled = isAdminUxLeaseTransferEnabled();
  const canTransferEntry =
    transferFlagEnabled &&
    hasRole("admin") &&
    hasPermission("lease.manage") &&
    currentTenancy?.leaseStatus === "active";
  const paymentAllocationLabels =
    billing.data && settlement
      ? contractPaymentAllocationLabels(billing.data.payments, settlement)
      : new Map<string, string>();
  const contractSettlementReceipt =
    settlement?.status === "paid" && billing.data
      ? ([...billing.data.payments]
          .reverse()
          .find(
            (payment) =>
              payment.receipt_id &&
              paymentAllocationLabels.get(payment.id) === "Pelunasan penuh sewa kontrak",
          ) ?? null)
      : null;

  return (
    <AppShell
      title="Detail Penghuni"
      subtitle="Informasi penghuni, penyewaan, tagihan, dan aktivitas terkait"
      actions={
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <Button
              variant="outline"
              className="min-h-11 border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => setCredentialsOpen(true)}
            >
              <KeyRound className="mr-1 h-4 w-4" /> Lihat kredensial penghuni
            </Button>
          ) : null}
          {canManage ? (
            <Button variant="info" className="min-h-11" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1 h-4 w-4" /> Edit
            </Button>
          ) : null}
          {canCancelAwaitingActivation && currentTenancy?.bookingLeadId ? (
            <Button
              variant="destructive"
              className="min-h-11"
              onClick={() => setCancellationOpen(true)}
            >
              <RotateCcw className="mr-1 h-4 w-4" /> Batalkan dan Refund
            </Button>
          ) : null}
          {canActivate ? (
            <ActivationRoomAction
              startDate={currentTenancy.startDate}
              onActivate={() => setConfirmActivation(true)}
            />
          ) : null}
          {canTransferEntry && currentTenancy ? (
            <Button
              variant={transferOpen ? "destructive" : "info"}
              className="min-h-11"
              onClick={() => setTransferOpen((open) => !open)}
            >
              {transferOpen ? (
                <XCircle className="mr-1 h-4 w-4" />
              ) : (
                <ArrowLeftRight className="mr-1 h-4 w-4" />
              )}
              {transferOpen ? "Batal Pindah Kamar" : "Pindah Kamar"}
            </Button>
          ) : null}
        </div>
      }
    >
      <nav
        aria-label="Breadcrumb"
        className="mb-5 flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
      >
        <Link to="/tenants" className="inline-flex min-h-11 items-center hover:text-foreground">
          <ArrowLeft className="mr-1 h-4 w-4" /> Data Penghuni
        </Link>
        <span aria-hidden="true">/</span>
        <span className="truncate text-foreground">{resident.fullName}</span>
      </nav>

      <ResidentGuidanceCards
        key={resident.id}
        resident={resident}
        tenancy={currentTenancy}
        billing={billing.data ?? null}
        focusId={guidanceFocusId}
      />

      {transferOpen && currentTenancy?.leaseStatus === "active" ? (
        <section
          ref={transferPanelRef}
          tabIndex={-1}
          aria-label="Pindah kamar"
          className="scroll-mt-24 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <TransferPanel
            leaseId={currentTenancy.leaseId}
            leaseStatus="active"
            canManage={hasRole("admin") && hasPermission("lease.manage")}
            canFinancial={canRunTransferTopUp({
              roles: user?.roles ?? [],
              permissions: user?.permissions ?? [],
            })}
            transferFlagEnabled={transferFlagEnabled}
            residentGender={resident.gender ?? undefined}
            onClose={() => setTransferOpen(false)}
            onOpenLease={(leaseId) =>
              void navigate({ to: "/penyewaan/$leaseId", params: { leaseId } })
            }
          />
        </section>
      ) : null}

      <div className="space-y-5">
        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-soft text-2xl font-semibold text-primary">
              {resident.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="break-words text-xl font-semibold">{resident.fullName}</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <AccountStatusPill status={resident.accountStatus} />
                <ResidentStatusPill status={resident.residentStatus} />
                {settlement ? <ContractPaymentBadges settlement={settlement} /> : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <section aria-labelledby="tenancy-summary" className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
          <Card>
            <CardHeader>
              <CardTitle id="tenancy-summary" className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-primary" /> Penyewaan dan kamar
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tenancy.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : currentTenancy ? (
                <DefinitionGrid
                  rows={[
                    ["No unit kamar", currentTenancy.roomNumber],
                    ["Tipe kost", currentTenancy.kostTypeName],
                    ["Bangunan", currentTenancy.buildingCode],
                    [
                      "Status penyewaan",
                      currentTenancy.leaseStatus === "active" ? "Aktif" : "Menunggu aktivasi",
                    ],
                    ["Tanggal mulai", formatResidentDetailDate(currentTenancy.startDate)],
                    ["Tanggal berakhir", formatResidentDetailDate(currentTenancy.endDate)],
                    ["Durasi sewa", `${currentTenancy.termMonths} bulan`],
                    ["Skema pelunasan", paymentPlan[currentTenancy.paymentPlanType]],
                  ]}
                />
              ) : (
                <HonestEmpty
                  icon={<Building2 className="h-5 w-5" />}
                  title="Belum ada penyewaan"
                  description="Penghuni ini belum memiliki commitment atau penyewaan aktif pada properti ini."
                />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <WalletCards className="h-4 w-4 text-primary" /> Ringkasan Penyewaan dan Pembayaran
              </CardTitle>
            </CardHeader>
            <CardContent>
              {billing.isLoading && currentTenancy ? (
                <Skeleton className="h-40 w-full" />
              ) : summary && settlement ? (
                <ContractSettlementSummary
                  settlement={settlement}
                  summary={summary}
                  propertyId={currentPropertyId}
                  finalPayment={contractSettlementReceipt}
                />
              ) : summary ? (
                <DefinitionGrid
                  rows={[
                    ["Total sewa kontrak", rupiah(billing.data!.lease.contract_rent)],
                    ["Sewa sudah dibayar", rupiah(summary.rent_paid)],
                    ["Sisa pembayaran sewa", rupiah(summary.rent_outstanding)],
                    [
                      "Deposit keamanan",
                      `${rupiah(summary.deposit_collected)} / ${rupiah(summary.security_deposit_required)}`,
                    ],
                    [
                      "Tagihan berikutnya",
                      summary.next_due_date
                        ? formatResidentDate(summary.next_due_date)
                        : "Tidak ada",
                    ],
                  ]}
                />
              ) : (
                <HonestEmpty
                  icon={<WalletCards className="h-5 w-5" />}
                  title="Ringkasan belum tersedia"
                  description={
                    currentTenancy
                      ? "Data tagihan sedang belum tersedia untuk penyewaan ini."
                      : "Ringkasan pembayaran muncul setelah commitment atau penyewaan dibuat."
                  }
                />
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="identity-heading">
          <h2 id="identity-heading" className="mb-3 text-base font-semibold">
            Identitas, pendidikan, dan keluarga
          </h2>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <DefinitionGrid
                  rows={[
                    [
                      "Nomor Telepon / WhatsApp",
                      <WhatsAppPhoneValue key="resident-phone" phone={resident.phone} />,
                    ],
                    ["Email", resident.email ?? "Belum diisi"],
                    ["Jenis kelamin", resident.gender ? gender[resident.gender] : "Belum diisi"],
                    ["NIK", resident.ktpNumber ? maskKtp(resident.ktpNumber) : "Belum diisi"],
                    [
                      "Tempat / Tanggal lahir",
                      [
                        resident.placeOfBirth,
                        resident.dateOfBirth ? formatResidentDate(resident.dateOfBirth) : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "Belum diisi",
                    ],
                    ["Alamat", resident.address ?? "Belum diisi"],
                    ["Foto KTP", resident.ktpDocument ? "Dokumen tersimpan" : "Belum diunggah"],
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <DefinitionGrid
                  rows={[
                    ["Universitas", resident.university ?? "Belum diisi"],
                    [
                      "Fakultas / Jurusan",
                      [resident.faculty, resident.major].filter(Boolean).join(" · ") ||
                        "Belum diisi",
                    ],
                    ["Angkatan", resident.cohort ?? "Belum diisi"],
                    ["Instagram", resident.instagram ?? "Belum diisi"],
                    ["Nama orang tua", resident.parentName ?? "Belum diisi"],
                    ["Telepon orang tua", resident.parentPhone ?? "Belum diisi"],
                    [
                      "Kontak darurat",
                      resident.emergencyContacts
                        .map((item) => `${item.contactName} · ${item.phone}`)
                        .join("; ") ||
                        resident.emergencyPhone ||
                        "Belum diisi",
                    ],
                  ]}
                />
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="space-y-5" aria-label="Tagihan dan pembayaran">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-primary" /> Tagihan
              </CardTitle>
            </CardHeader>
            <CardContent>
              {billing.data && settlement ? (
                <ContractInvoicePanel
                  data={billing.data}
                  propertyId={currentPropertyId}
                  canManageBilling={canManageBilling}
                  canManageTermination={canManageTermination}
                  onChanged={() => void billing.refetch()}
                  onPaymentRecorded={(status) => {
                    void billing.refetch();
                    if (status === "pending_confirmation") {
                      setGuidanceFocusId("payment-pending-confirmation");
                    }
                  }}
                />
              ) : billing.data?.invoices.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="pb-2">Kode</th>
                        <th className="pb-2">Periode</th>
                        <th className="pb-2">Sisa</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billing.data.invoices.map((invoice) => (
                        <tr key={invoice.id} className="border-t border-border">
                          <td className="py-3 font-medium">{invoice.invoice_code}</td>
                          <td className="py-3">
                            {formatResidentDate(invoice.coverage_start)} –{" "}
                            {formatResidentDate(invoice.coverage_end)}
                          </td>
                          <td className="py-3">{rupiah(invoice.outstanding_amount)}</td>
                          <td className="py-3">{invoice.invoice_status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <HonestEmpty
                  icon={<FileText className="h-5 w-5" />}
                  title="Belum ada tagihan"
                  description="Tagihan yang telah diterbitkan akan tampil di sini."
                />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptText className="h-4 w-4 text-primary" /> Riwayat pembayaran
              </CardTitle>
            </CardHeader>
            <CardContent>
              {billing.data?.payments.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="pb-2">No.</th>
                        <th className="pb-2">Tanggal</th>
                        <th className="pb-2">Kode</th>
                        <th className="pb-2">Jenis</th>
                        <th className="pb-2">Metode</th>
                        <th className="pb-2">Nominal</th>
                        <th className="pb-2">Status verifikasi</th>
                        <th className="pb-2">Keterangan pembayaran</th>
                        <th className="pb-2 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billing.data.payments.map((payment, index) => (
                        <tr key={payment.id} className="border-t border-border">
                          <td className="py-3 text-muted-foreground">{index + 1}</td>
                          <td className="py-3 whitespace-nowrap">
                            {payment.paid_at
                              ? formatResidentDetailTimestamp(payment.paid_at)
                              : "Belum dicatat"}
                          </td>
                          <td className="py-3 font-medium">{payment.payment_code}</td>
                          <td className="py-3">
                            {paymentPurposeLabel(
                              payment.payment_purpose,
                              paymentAllocationLabels.get(payment.id),
                            )}
                          </td>
                          <td className="py-3">
                            {payment.payment_method === "cash" ? "Tunai" : "Transfer bank"}
                          </td>
                          <td className="py-3">{rupiah(payment.amount)}</td>
                          <td className="py-3">{paymentStatusLabel(payment.payment_status)}</td>
                          <td className="py-3">
                            {paymentAllocationLabel(
                              payment,
                              settlement?.invoice_id ?? null,
                              paymentAllocationLabels.get(payment.id),
                            )}
                          </td>
                          <td className="py-3 text-right">
                            <PaymentDetailDialog
                              payment={payment}
                              propertyId={currentPropertyId}
                              isContractSettled={
                                settlement?.status === "paid" &&
                                paymentAllocationLabels.get(payment.id) ===
                                  "Pelunasan penuh sewa kontrak"
                              }
                              typeLabel={paymentPurposeLabel(
                                payment.payment_purpose,
                                paymentAllocationLabels.get(payment.id),
                              )}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <HonestEmpty
                  icon={<ReceiptText className="h-5 w-5" />}
                  title="Belum ada pembayaran"
                  description="Pembayaran terverifikasi atau menunggu konfirmasi akan tampil di sini."
                />
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-5 md:grid-cols-3" aria-label="Operasional terkait">
          <DeferredPanel
            icon={<Car className="h-5 w-5" />}
            title="Kendaraan & parkir"
            description="Riwayat kendaraan terhubung pada pekerjaan operasional berikutnya."
          />
          <DeferredPanel
            icon={<MessageSquare className="h-5 w-5" />}
            title="Komplain"
            description="Komplain penghuni akan terhubung pada pekerjaan operasional berikutnya."
          />
          <DeferredPanel
            icon={<Bell className="h-5 w-5" />}
            title="Notifikasi & reminder"
            description="Riwayat pengingat tersedia setelah modul reminder diaktifkan."
          />
        </section>
      </div>

      <ResidentFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={resident}
        onSaved={() => void detail.refetch()}
      />
      <ResidentCredentialsDialog
        open={credentialsOpen}
        onOpenChange={setCredentialsOpen}
        residentId={resident.id}
        residentName={resident.fullName}
        residentPhone={resident.phone}
      />
      {currentTenancy?.bookingLeadId ? (
        <BookingLeadCancellationDialog
          open={cancellationOpen}
          leadId={currentTenancy.bookingLeadId}
          residentName={resident.fullName}
          roomNumber={currentTenancy.roomNumber}
          onOpenChange={setCancellationOpen}
          onCancelled={async () => {
            await Promise.all([
              detail.refetch(),
              tenancy.refetch(),
              billing.refetch(),
              bookingProgress.refetch(),
            ]);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={confirmActivation}
        onOpenChange={setConfirmActivation}
        title="Aktivasi kamar dan penyewaan"
        description="Aktivasi membuat occupancy aktif dan menandai kamar sebagai dihuni. Lanjutkan hanya setelah kewajiban awal telah diperiksa."
        confirmLabel="Aktivasi sekarang"
        pending={activation.isPending}
        onConfirm={async () => {
          if (!currentTenancy) return;
          await activation.mutateAsync({
            leaseId: currentTenancy.leaseId,
            idempotencyKey: newIdempotencyKey(),
          });
          setConfirmActivation(false);
          await Promise.all([detail.refetch(), tenancy.refetch(), billing.refetch()]);
        }}
      />
    </AppShell>
  );
}

function ResidentCredentialsDialog({
  open,
  onOpenChange,
  residentId,
  residentName,
  residentPhone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  residentId: string;
  residentName: string;
  residentPhone: string | null;
}) {
  const account = useResidentAccountSummary(open ? residentId : null);
  const resetPassword = useResetResidentPassword();
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setTemporaryPassword(null);
      setCopied(false);
    }
  }, [open]);

  const loginIdentifier = account.data?.loginEmail ?? account.data?.loginPhone ?? null;
  const whatsAppPhone = residentPhone ? normalizeWhatsAppPhone(residentPhone) : null;
  const sendCredentials = () => {
    if (!whatsAppPhone || !loginIdentifier || !temporaryPassword) return;
    const message = [
      `Halo ${residentName}, berikut kredensial sementara akun Kostation Anda:`,
      `Login: ${loginIdentifier}`,
      `Password sementara: ${temporaryPassword}`,
      "Silakan login dan segera ganti password pada akses pertama. Jangan bagikan kredensial ini kepada orang lain.",
    ].join("\n");
    window.open(
      `https://wa.me/${whatsAppPhone}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Kredensial Penghuni</DialogTitle>
          <DialogDescription>
            Identitas login dapat dilihat, tetapi password lama tidak pernah disimpan atau
            ditampilkan kembali oleh sistem.
          </DialogDescription>
        </DialogHeader>

        {account.isLoading ? <Skeleton className="h-40 w-full" /> : null}
        {account.error ? (
          <NoticeAlert
            tone="destructive"
            title="Kredensial belum dapat dimuat"
            description="Periksa koneksi lalu coba kembali."
          />
        ) : null}
        {account.data ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Email login</p>
                <p className="mt-1 break-all font-medium">
                  {account.data.loginEmail ?? "Belum tersedia"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Nomor telepon login</p>
                <p className="mt-1 break-all font-medium">
                  {account.data.loginPhone ?? "Belum tersedia"}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Keamanan akun</p>
                <p className="mt-1 font-medium">
                  {account.data.passwordChangeRequired
                    ? "Wajib mengganti password saat login berikutnya"
                    : "Password pribadi sudah dibuat penghuni"}
                </p>
              </div>
            </div>

            {temporaryPassword ? (
              <NoticeAlert
                tone="warning"
                title="Password sementara baru"
                description={
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <code className="min-w-0 flex-1 rounded-lg bg-background px-3 py-2 font-semibold">
                      {temporaryPassword}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        await navigator.clipboard.writeText(temporaryPassword);
                        setCopied(true);
                      }}
                    >
                      {copied ? "Tersalin" : "Salin"}
                    </Button>
                  </div>
                }
              />
            ) : (
              <NoticeAlert
                tone="info"
                title="Password tidak dapat dilihat ulang"
                description="Gunakan reset password bila penghuni kehilangan akses. Reset akan mencabut sesi lama dan membuat password sementara baru."
              />
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="warning"
                disabled={resetPassword.isPending || account.data.status === "not_provisioned"}
                onClick={async () => {
                  const receipt = await resetPassword.mutateAsync({ residentId });
                  setTemporaryPassword(receipt.temporaryPassword);
                  setCopied(false);
                }}
              >
                <KeyRound className="mr-2 h-4 w-4" />
                {resetPassword.isPending ? "Mereset..." : "Reset password"}
              </Button>
              <Button
                type="button"
                className="bg-[#25D366] text-black hover:bg-[#20bd5a]"
                disabled={!temporaryPassword || !whatsAppPhone || !loginIdentifier}
                onClick={sendCredentials}
              >
                <WhatsAppIcon className="mr-2 h-4 w-4 fill-black" /> Kirim ke WhatsApp
              </Button>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoadingPage() {
  return (
    <AppShell title="Detail Penghuni" subtitle="Memuat...">
      {" "}
      <div className="space-y-5" role="status" aria-label="Memuat detail penghuni">
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    </AppShell>
  );
}

function DefinitionGrid({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-lg bg-muted/35 p-3">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-words font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function WhatsAppPhoneValue({ phone }: { phone: string | null }) {
  const normalizedPhone = phone ? normalizeWhatsAppPhone(phone) : null;
  const whatsAppUrl = normalizedPhone ? `https://wa.me/${normalizedPhone}` : null;

  if (!phone) return <>Belum diisi</>;

  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className="break-all">{phone}</span>
      {whatsAppUrl ? (
        <a
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-[#25D366] transition-colors hover:bg-[#25D366]/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          href={whatsAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Buka chat WhatsApp untuk ${phone}`}
          title="Buka WhatsApp"
        >
          <WhatsAppIcon className="h-5 w-5" />
        </a>
      ) : null}
    </div>
  );
}

function WhatsAppIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

function paymentPurposeLabel(
  purpose: ResidentBilling["payments"][number]["payment_purpose"],
  settlementLabel?: string,
) {
  if (purpose === "rent") {
    if (settlementLabel === "Pelunasan penuh sewa kontrak") return "Pelunasan Sewa";
    if (settlementLabel?.startsWith("Bayar sebagian")) return "Pembayaran Sebagian Sewa";
    if (settlementLabel?.startsWith("Menunggu konfirmasi")) {
      return "Pembayaran Sewa (Menunggu Konfirmasi)";
    }
    return "Pembayaran Sewa";
  }
  if (purpose === "dp") return "DP / uang muka sewa";
  if (purpose === "security_deposit") return "Security deposit";
  if (purpose === "other_charge") return "Tagihan lainnya";
  return "Pembayaran";
}

function paymentAllocationLabel(
  payment: ResidentBilling["payments"][number],
  contractSettlementInvoiceId: string | null,
  settlementLabel?: string,
) {
  if (settlementLabel) return settlementLabel;
  if (payment.payment_purpose === "dp") return "Pembayaran awal sewa (DP)";
  if (payment.payment_purpose === "security_deposit") return "Deposit jaminan kamar";
  if (
    contractSettlementInvoiceId &&
    payment.allocations.some((allocation) => allocation.invoice_id === contractSettlementInvoiceId)
  )
    return "Pembayaran untuk sewa kontrak";
  if (payment.allocations.length) return `${payment.allocations.length} tagihan terkait`;
  return "Belum dialokasikan";
}

function contractPaymentAllocationLabels(
  payments: ResidentBilling["payments"],
  settlement: NonNullable<ResidentBilling["contract_settlement"]>,
) {
  const labels = new Map<string, string>();
  let remainingBeforePayment = settlement.contract_rent_amount;
  const chronologicalPayments = [...payments].sort((left, right) => {
    const leftTime = left.paid_at ? Date.parse(left.paid_at) : 0;
    const rightTime = right.paid_at ? Date.parse(right.paid_at) : 0;
    return leftTime - rightTime || left.id.localeCompare(right.id);
  });

  for (const payment of chronologicalPayments) {
    const contractAmount = payment.allocations
      .filter((allocation) => allocation.invoice_id === settlement.invoice_id)
      .reduce((total, allocation) => total + allocation.amount, 0);
    if (!contractAmount) continue;

    if (payment.payment_status === "pending_confirmation") {
      labels.set(payment.id, "Menunggu konfirmasi untuk pelunasan sewa kontrak");
      continue;
    }
    if (payment.payment_status === "rejected" || payment.payment_status === "reversed") {
      labels.set(payment.id, "Tidak diperhitungkan pada pelunasan sewa kontrak");
      continue;
    }
    if (payment.payment_purpose === "dp") {
      labels.set(payment.id, "DP awal untuk pelunasan sewa kontrak");
    } else if (contractAmount >= remainingBeforePayment) {
      labels.set(payment.id, "Pelunasan penuh sewa kontrak");
    } else {
      labels.set(payment.id, "Bayar sebagian untuk pelunasan sewa kontrak");
    }
    remainingBeforePayment = Math.max(0, remainingBeforePayment - contractAmount);
  }

  return labels;
}

function paymentStatusLabel(status: ResidentBilling["payments"][number]["payment_status"]) {
  return {
    pending_confirmation: "Menunggu konfirmasi",
    verified: "Terverifikasi",
    rejected: "Ditolak",
    reversed: "Dibalikkan",
  }[status];
}

function SettlementStatusPill({
  status,
}: {
  status: NonNullable<ResidentBilling["contract_settlement"]>["status"];
}) {
  const className = {
    awaiting_activation: "bg-warning/15 text-warning",
    open: "bg-primary/15 text-primary",
    extended: "bg-primary/15 text-primary",
    overdue: "bg-destructive/15 text-destructive",
    admin_action_required: "bg-destructive/15 text-destructive",
    termination_pending: "bg-warning/15 text-warning",
    terminated: "bg-muted text-muted-foreground",
    paid: "bg-success/15 text-success",
  }[status];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      {settlementStatusLabel(status)}
    </span>
  );
}

function ContractPaymentBadges({
  settlement,
}: {
  settlement: NonNullable<ResidentBilling["contract_settlement"]>;
}) {
  return (
    <>
      <SettlementStatusPill status={settlement.status} />
      {settlement.status !== "paid" && settlement.partial_payment_allowed ? (
        <span className="inline-flex rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
          Bayar sebagian
        </span>
      ) : null}
    </>
  );
}

function ContractSettlementSummary({
  settlement,
  summary,
  propertyId,
  finalPayment,
}: {
  settlement: NonNullable<ResidentBilling["contract_settlement"]>;
  summary: ResidentBilling["summary"];
  propertyId: string | null;
  finalPayment: ResidentBilling["payments"][number] | null;
}) {
  const dueLabel = settlement.effective_due_at
    ? formatResidentDetailTimestamp(settlement.effective_due_at)
    : "Dihitung setelah aktivasi";
  const paidCredit = settlement.initial_rent_credit + settlement.payment_allocated;
  const directGuidance =
    settlement.status === "open" ? openSettlementGuidance(settlement, dueLabel) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Pelunasan sewa kontrak</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pelunasan kontrak dijadwalkan dua bulan sejak kamar diaktivasi.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SettlementStatusPill status={settlement.status} />
          {finalPayment?.receipt_id && propertyId ? (
            <ReceiptDownloadButton
              propertyId={propertyId}
              receiptId={finalPayment.receipt_id}
              paymentCode={finalPayment.payment_code}
              isContractSettled
            />
          ) : null}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryMetric label="Total sewa kontrak" value={rupiah(settlement.contract_rent_amount)} />
        <SummaryMetric
          label="Total pembayaran sewa yang sudah diterima"
          value={rupiah(paidCredit)}
        />
        <SummaryMetric
          label="Sisa yang wajib dilunasi"
          value={rupiah(settlement.outstanding_amount)}
          highlight
        />
        <SummaryMetric label="Tenggat jatuh tempo pelunasan" value={dueLabel} />
      </div>
      <FirstPaymentCheckpointCard settlement={settlement} />
      {directGuidance ? (
        <NoticeAlert
          density="compact"
          tone={directGuidance.tone}
          attention="subtle"
          title={directGuidance.title}
          description={directGuidance.description}
        />
      ) : settlement.reminder_stage ? (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/35 p-3 text-xs text-muted-foreground">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            Tahap pengingat saat ini:{" "}
            <strong className="text-foreground">{settlement.reminder_stage}</strong>.
          </span>
        </div>
      ) : null}
      {settlement.extension_reason ? (
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
          <p className="font-medium text-primary">Perpanjangan pelunasan tercatat</p>
          <p className="mt-1 text-muted-foreground">{settlement.extension_reason}</p>
        </div>
      ) : null}
      {!settlement.admin_action_required && settlement.outstanding_amount > 0 ? (
        <div className="rounded-lg border border-border bg-muted/35 p-3 text-xs leading-5 text-muted-foreground">
          <p className="font-medium text-foreground">Keterangan periode pembayaran</p>
          <p className="mt-1">
            Bukan tagihan sewa bulanan. Pembayaran sebagian hanya mengurangi sisa kontrak dan tidak
            mengubah tenggat {dueLabel}.
          </p>
          <p className="mt-1">
            {settlement.extension_due_at
              ? `Pembayaran sebagian dapat dicatat sampai ${dueLabel}.`
              : "Pembayaran sebagian dapat dicatat hingga tujuh hari setelah tenggat jatuh tempo."}
          </p>
        </div>
      ) : null}
      {settlement.admin_action_required ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Tunggakan telah melewati tenggat. Admin perlu memilih pelunasan penuh atau memulai
            proses pemberhentian sewa.
          </span>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Security deposit terpisah dari kewajiban sewa. Terkumpul {rupiah(summary.deposit_collected)}
        ; deposit yang masih tercatat {rupiah(summary.deposit_balance)}.
      </p>
    </div>
  );
}

function FirstPaymentCheckpointCard({
  settlement,
}: {
  settlement: NonNullable<ResidentBilling["contract_settlement"]>;
}) {
  const checkpoint = settlement.first_payment_checkpoint;
  if (checkpoint.status === "not_required" || !checkpoint.due_at) return null;
  const complete = checkpoint.status === "met" || checkpoint.status === "met_early";
  const late = checkpoint.status === "overdue";
  return (
    <div
      className={`rounded-lg border p-3 text-xs leading-5 ${
        late
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : complete
            ? "border-emerald-500/35 bg-emerald-500/10"
            : "border-primary/30 bg-primary/5"
      }`}
    >
      <p className="font-semibold text-foreground">Checkpoint pembayaran pertama</p>
      <p className="mt-1 text-muted-foreground">
        Minimal pembayaran sewa tambahan {rupiah(checkpoint.required_additional_amount)} paling
        lambat {formatResidentDetailTimestamp(checkpoint.due_at)} WIB.
      </p>
      <p className="mt-1 text-muted-foreground">
        {complete
          ? `Sudah terpenuhi${checkpoint.status === "met_early" ? " lebih awal" : ""}: ${rupiah(checkpoint.additional_payment_received)} tercatat.`
          : `Masih perlu dicatat: ${rupiah(checkpoint.remaining_amount)}. DP/booking fee tidak menggantikan pembayaran checkpoint; security deposit tidak dihitung sebagai sewa.`}
      </p>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/25 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 break-words font-semibold ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

function ContractInvoicePanel({
  data,
  propertyId,
  canManageBilling,
  canManageTermination,
  onChanged,
  onPaymentRecorded,
}: {
  data: ResidentBilling;
  propertyId: string | null;
  canManageBilling: boolean;
  canManageTermination: boolean;
  onChanged: () => void;
  onPaymentRecorded: (status: string) => void;
}) {
  const settlement = data.contract_settlement;
  if (!settlement) return null;
  const invoice = data.invoices.find((item) => item.id === settlement.invoice_id) ?? null;
  const termination = settlement.termination_case;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Tagihan utama
            </p>
            <p className="mt-1 text-base font-semibold">Pelunasan Sewa Kontrak</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {invoice ? `${invoice.invoice_code} · ` : ""}Total{" "}
              {rupiah(settlement.contract_rent_amount)}
            </p>
          </div>
          <SettlementStatusPill status={settlement.status} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SummaryMetric
            label="Pembayaran awal saat penyewaan dibuat"
            value={rupiah(settlement.initial_rent_credit)}
          />
          <SummaryMetric
            label="Pembayaran tambahan yang sudah diterima"
            value={rupiah(settlement.payment_allocated)}
          />
          <SummaryMetric
            label="Sisa yang wajib dilunasi"
            value={rupiah(settlement.outstanding_amount)}
            highlight
          />
          <SummaryMetric
            label="Tenggat jatuh tempo pelunasan"
            value={
              settlement.effective_due_at
                ? formatResidentDetailTimestamp(settlement.effective_due_at)
                : "Menunggu aktivasi"
            }
          />
        </div>
        <div className="mt-3">
          <FirstPaymentCheckpointCard settlement={settlement} />
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Pembayaran awal mencakup DP dan/atau booking fee yang telah terverifikasi saat penyewaan
          dibuat. Pembayaran berikutnya tercatat setelah admin menerima uang sewa tambahan dari
          penghuni. Tidak ada tagihan sewa bulanan baru: pembayaran sebagian tetap mengurangi satu
          sisa pelunasan kontrak yang sama dan tidak mengubah tenggat resmi.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {canManageBilling && settlement.partial_payment_allowed && invoice ? (
          <RecordPaymentDialog
            data={data}
            propertyId={propertyId}
            triggerLabel="Catat Pembayaran"
            triggerVariant="default"
            contractSettlementInvoiceId={invoice?.id ?? null}
            contractSettlementMode="choose"
            onRecorded={onPaymentRecorded}
          />
        ) : null}
        {canManageBilling && settlement.full_payment_required && invoice ? (
          <RecordPaymentDialog
            data={data}
            propertyId={propertyId}
            triggerLabel="Lunasi Sisa"
            contractSettlementInvoiceId={invoice.id}
            contractSettlementMode="full"
            onRecorded={onPaymentRecorded}
          />
        ) : null}
        {canManageTermination && settlement.extension_available ? (
          <ExtendSettlementDialog
            leaseId={data.lease.id}
            propertyId={propertyId}
            onChanged={onChanged}
          />
        ) : null}
        {canManageTermination && settlement.full_payment_required && !termination ? (
          <StartTerminationDialog
            leaseId={data.lease.id}
            propertyId={propertyId}
            onChanged={onChanged}
          />
        ) : null}
        {canManageTermination &&
        termination?.status === "pending" &&
        settlement.outstanding_amount === 0 ? (
          <CancelTerminationDialog
            leaseId={data.lease.id}
            propertyId={propertyId}
            onChanged={onChanged}
          />
        ) : null}
        {canManageTermination &&
        termination?.status === "pending" &&
        settlement.outstanding_amount > 0 ? (
          <FinalizeTerminationDialog
            leaseId={data.lease.id}
            propertyId={propertyId}
            settlement={settlement}
            summary={data.summary}
            onChanged={onChanged}
          />
        ) : null}
      </div>

      {termination?.status === "pending" ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-warning">Proses pemberhentian sewa sedang berjalan</p>
            <p className="mt-1 text-muted-foreground">
              Checkout direncanakan pada{" "}
              {formatResidentDetailDate(termination.planned_checkout_date)}. Kamar tetap dihuni
              sampai checkout diselesaikan.
            </p>
          </div>
        </div>
      ) : null}
      {!canManageBilling && !canManageTermination && settlement.outstanding_amount > 0 ? (
        <p className="text-sm text-muted-foreground">
          Anda dapat melihat sisa sewa, tetapi tidak memiliki izin untuk mencatat pembayaran atau
          mengelola pemberhentian sewa.
        </p>
      ) : null}
    </div>
  );
}

function ExtendSettlementDialog({
  leaseId,
  propertyId,
  onChanged,
}: {
  leaseId: string;
  propertyId: string | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(14);
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());
  const mutation = useExtendContractSettlement(propertyId);
  const submit = () => {
    if (!propertyId || reason.trim().length < 3) return;
    mutation.mutate(
      { leaseId, input: { property_id: propertyId, extension_days: days, reason }, idempotencyKey },
      {
        onSuccess: () => {
          setOpen(false);
          setReason("");
          setIdempotencyKey(newIdempotencyKey());
          onChanged();
        },
      },
    );
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button className="min-h-11" variant="warning" onClick={() => setOpen(true)}>
        <Clock3 className="mr-2 h-4 w-4" /> Beri perpanjangan
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Perpanjang tenggat pelunasan</DialogTitle>
          <DialogDescription>
            Satu kali perpanjangan saja, paling lama 14 hari. Alasan akan tercatat dalam riwayat.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block text-sm font-medium">
            Lama perpanjangan
            <Input
              className="mt-2 min-h-11"
              type="number"
              min={1}
              max={14}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            />
          </label>
          <label className="block text-sm font-medium">
            Alasan perpanjangan
            <textarea
              className="mt-2 min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
            />
          </label>
          {mutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Perpanjangan belum dapat dicatat. Pastikan tagihan telah jatuh tempo dan alasan telah
              diisi.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button className="min-h-11" variant="secondary" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            className="min-h-11"
            disabled={mutation.isPending || reason.trim().length < 3 || days < 1 || days > 14}
            onClick={submit}
          >
            {mutation.isPending ? "Menyimpan..." : "Simpan perpanjangan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StartTerminationDialog({
  leaseId,
  propertyId,
  onChanged,
}: {
  leaseId: string;
  propertyId: string | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [plannedCheckoutDate, setPlannedCheckoutDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());
  const mutation = useStartLeaseTermination(propertyId);
  const submit = () => {
    if (!propertyId || reason.trim().length < 3 || !plannedCheckoutDate) return;
    mutation.mutate(
      {
        leaseId,
        input: {
          property_id: propertyId,
          reason,
          notes: notes || undefined,
          planned_checkout_date: plannedCheckoutDate,
        },
        idempotencyKey,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setIdempotencyKey(newIdempotencyKey());
          onChanged();
        },
      },
    );
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button className="min-h-11" variant="destructive" onClick={() => setOpen(true)}>
        <TriangleAlert className="mr-2 h-4 w-4" /> Mulai pemberhentian sewa
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mulai pemberhentian sewa</DialogTitle>
          <DialogDescription>
            Kamar tetap dihuni sampai checkout difinalkan. Proses ini hanya untuk tunggakan yang
            sudah melewati tenggat akhir.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block text-sm font-medium">
            Alasan
            <textarea
              className="mt-2 min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
            />
          </label>
          <label className="block text-sm font-medium">
            Catatan internal (opsional)
            <textarea
              className="mt-2 min-h-20 w-full rounded-md border border-input bg-background p-3 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={2000}
            />
          </label>
          <label className="block text-sm font-medium">
            Rencana tanggal checkout
            <Input
              className="mt-2 min-h-11"
              type="date"
              value={plannedCheckoutDate}
              onChange={(event) => setPlannedCheckoutDate(event.target.value)}
            />
          </label>
          {mutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Proses belum dapat dimulai. Periksa bahwa saldo tetap tertunggak dan tenggat akhir
              telah lewat.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button className="min-h-11" variant="secondary" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            className="min-h-11"
            variant="destructive"
            disabled={mutation.isPending || reason.trim().length < 3 || !plannedCheckoutDate}
            onClick={submit}
          >
            {mutation.isPending ? "Menyimpan..." : "Mulai proses"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelTerminationDialog({
  leaseId,
  propertyId,
  onChanged,
}: {
  leaseId: string;
  propertyId: string | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());
  const mutation = useCancelLeaseTermination(propertyId);
  const submit = () => {
    if (!propertyId || reason.trim().length < 3) return;
    mutation.mutate(
      { leaseId, input: { property_id: propertyId, reason }, idempotencyKey },
      {
        onSuccess: () => {
          setOpen(false);
          setIdempotencyKey(newIdempotencyKey());
          onChanged();
        },
      },
    );
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button className="min-h-11" variant="warning" onClick={() => setOpen(true)}>
        Batalkan pemberhentian
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan proses pemberhentian</DialogTitle>
          <DialogDescription>
            Proses hanya dapat dibatalkan setelah seluruh saldo sewa telah lunas.
          </DialogDescription>
        </DialogHeader>
        <label className="block text-sm font-medium">
          Alasan pembatalan
          <textarea
            className="mt-2 min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
          />
        </label>
        {mutation.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Proses belum dapat dibatalkan. Pastikan seluruh saldo sewa telah dilunasi.
          </p>
        ) : null}
        <DialogFooter>
          <Button className="min-h-11" variant="secondary" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            className="min-h-11"
            disabled={mutation.isPending || reason.trim().length < 3}
            onClick={submit}
          >
            {mutation.isPending ? "Menyimpan..." : "Batalkan proses"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FinalizeTerminationDialog({
  leaseId,
  propertyId,
  settlement,
  summary,
  onChanged,
}: {
  leaseId: string;
  propertyId: string | null;
  settlement: NonNullable<ResidentBilling["contract_settlement"]>;
  summary: ResidentBilling["summary"];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [roomOutcome, setRoomOutcome] = useState<"vacant" | "maintenance">("vacant");
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [damageAmount, setDamageAmount] = useState(0);
  const [damageReason, setDamageReason] = useState("");
  const [damageEvidence, setDamageEvidence] = useState<FileResponse | null>(null);
  const [damageEvidenceBusy, setDamageEvidenceBusy] = useState(false);
  const [refundMethod, setRefundMethod] = useState<"cash" | "bank_transfer">("bank_transfer");
  const [refundedAt, setRefundedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [refundNote, setRefundNote] = useState("");
  const [refundEvidence, setRefundEvidence] = useState<FileResponse | null>(null);
  const [refundEvidenceBusy, setRefundEvidenceBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());
  const mutation = useFinalizeLeaseTermination(propertyId);
  const estimatedRentOffset = Math.min(summary.deposit_balance, settlement.outstanding_amount);
  const availableAfterArrears = Math.max(0, summary.deposit_balance - estimatedRentOffset);
  const estimatedRefund = Math.max(0, availableAfterArrears - damageAmount);
  const submit = () => {
    if (!propertyId) return;
    mutation.mutate(
      {
        leaseId,
        input: {
          property_id: propertyId,
          inspection_notes: inspectionNotes || undefined,
          room_status_after_checkout: roomOutcome,
          damage_deduction_amount: damageAmount,
          damage_reason: damageAmount > 0 ? damageReason : undefined,
          damage_evidence_file_id: damageAmount > 0 ? (damageEvidence?.id ?? undefined) : undefined,
          refund_amount: estimatedRefund,
          refund_method: estimatedRefund > 0 ? refundMethod : undefined,
          refunded_at: estimatedRefund > 0 ? refundedAt : undefined,
          refund_note: estimatedRefund > 0 ? refundNote || undefined : undefined,
          refund_evidence_file_id:
            estimatedRefund > 0 ? (refundEvidence?.id ?? undefined) : undefined,
        },
        idempotencyKey,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setIdempotencyKey(newIdempotencyKey());
          onChanged();
        },
      },
    );
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button className="min-h-11" variant="destructive" onClick={() => setOpen(true)}>
        Finalkan checkout
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Finalkan pemberhentian dan checkout</DialogTitle>
          <DialogDescription>
            Security deposit terverifikasi akan digunakan terlebih dahulu untuk menutup tunggakan.
            Catat kerusakan dan pengembalian deposit dengan bukti.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
            <p className="font-medium text-warning">
              Saldo sewa sebelum settlement: {rupiah(settlement.outstanding_amount)}
            </p>
            <p className="mt-1 text-muted-foreground">
              Estimasi potongan deposit untuk tunggakan: {rupiah(estimatedRentOffset)}. Server akan
              menghitung ulang seluruh settlement saat disimpan.
            </p>
          </div>
          <label className="block text-sm font-medium">
            Hasil inspeksi kamar
            <select
              className="mt-2 min-h-11 w-full rounded-md border border-input bg-background px-3"
              value={roomOutcome}
              onChange={(event) => setRoomOutcome(event.target.value as "vacant" | "maintenance")}
            >
              <option value="vacant">Kamar kosong</option>
              <option value="maintenance">Masuk maintenance</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Catatan inspeksi (opsional)
            <textarea
              className="mt-2 min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm"
              value={inspectionNotes}
              onChange={(event) => setInspectionNotes(event.target.value)}
              maxLength={4000}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Potongan kerusakan
              <Input
                className="mt-2 min-h-11"
                type="number"
                min={0}
                value={damageAmount || ""}
                onChange={(event) => setDamageAmount(Math.max(0, Number(event.target.value)))}
              />
            </label>
            {damageAmount > 0 ? (
              <>
                <label className="block text-sm font-medium">
                  Alasan potongan kerusakan
                  <Input
                    className="mt-2 min-h-11"
                    value={damageReason}
                    onChange={(event) => setDamageReason(event.target.value)}
                    maxLength={1000}
                  />
                </label>
                {propertyId ? (
                  <FileUploadField
                    propertyId={propertyId}
                    filePurpose="payment_proof"
                    label="Bukti kerusakan"
                    description="Wajib bila ada potongan kerusakan. File dapat dilihat kembali sebelum checkout diselesaikan."
                    value={damageEvidence}
                    onChange={setDamageEvidence}
                    onBusyChange={setDamageEvidenceBusy}
                    required
                  />
                ) : null}
              </>
            ) : null}
          </div>
          {estimatedRefund > 0 ? (
            <div className="space-y-4 rounded-lg border border-success/30 bg-success/10 p-3">
              <div>
                <p className="font-medium text-success">
                  Pengembalian security deposit: {rupiah(estimatedRefund)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Nilai ini adalah estimasi setelah offset tunggakan dan potongan kerusakan. Bukti
                  pengembalian wajib dilampirkan.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Metode pengembalian
                  <select
                    className="mt-2 min-h-11 w-full rounded-md border border-input bg-background px-3"
                    value={refundMethod}
                    onChange={(event) =>
                      setRefundMethod(event.target.value as "cash" | "bank_transfer")
                    }
                  >
                    <option value="bank_transfer">Transfer bank</option>
                    <option value="cash">Tunai</option>
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Tanggal pengembalian
                  <Input
                    className="mt-2 min-h-11"
                    type="date"
                    value={refundedAt}
                    onChange={(event) => setRefundedAt(event.target.value)}
                  />
                </label>
              </div>
              <label className="block text-sm font-medium">
                Catatan pengembalian (opsional)
                <Input
                  className="mt-2 min-h-11"
                  value={refundNote}
                  onChange={(event) => setRefundNote(event.target.value)}
                  maxLength={1000}
                />
              </label>
              {propertyId ? (
                <FileUploadField
                  propertyId={propertyId}
                  filePurpose="payment_proof"
                  label="Bukti pengembalian deposit"
                  description="Wajib sebagai bukti pengembalian kepada penghuni."
                  value={refundEvidence}
                  onChange={setRefundEvidence}
                  onBusyChange={setRefundEvidenceBusy}
                  required
                />
              ) : null}
            </div>
          ) : null}
          {mutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Checkout belum dapat diselesaikan. Periksa bukti kerusakan, saldo deposit, dan data
              pengembalian.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button className="min-h-11" variant="secondary" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            className="min-h-11"
            variant="destructive"
            disabled={
              mutation.isPending ||
              damageEvidenceBusy ||
              refundEvidenceBusy ||
              (damageAmount > 0 && (!damageReason.trim() || !damageEvidence)) ||
              (estimatedRefund > 0 && (!refundEvidence || !refundedAt))
            }
            onClick={submit}
          >
            {mutation.isPending ? "Menyelesaikan..." : "Selesaikan checkout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDetailDialog({
  payment,
  propertyId,
  isContractSettled,
  typeLabel,
}: {
  payment: ResidentBilling["payments"][number];
  propertyId: string | null;
  isContractSettled: boolean;
  typeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button className="min-h-9" size="sm" variant="info" onClick={() => setOpen(true)}>
        Rincian
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isContractSettled ? "Kuitansi pelunasan kontrak" : "Rincian pembayaran"}
          </DialogTitle>
          <DialogDescription>
            {isContractSettled
              ? "Pembayaran ini menyelesaikan seluruh kewajiban sewa kontrak."
              : "Riwayat transaksi disajikan apa adanya. Kuitansi tersedia setelah dokumen diterbitkan."}
          </DialogDescription>
        </DialogHeader>
        <DefinitionGrid
          rows={[
            ["Kode pembayaran", payment.payment_code],
            ["Jenis", typeLabel],
            ["Metode", payment.payment_method === "cash" ? "Tunai" : "Transfer bank"],
            ["Nominal", rupiah(payment.amount)],
            ["Status", paymentStatusLabel(payment.payment_status)],
            [
              "Dicatat",
              payment.paid_at ? formatResidentDetailTimestamp(payment.paid_at) : "Belum dicatat",
            ],
            [
              "Terverifikasi",
              payment.verified_at
                ? formatResidentDetailTimestamp(payment.verified_at)
                : "Belum diverifikasi",
            ],
            [
              "Alokasi",
              payment.allocations.length
                ? payment.allocations
                    .map((item) => `${item.invoice_id.slice(0, 8)} · ${rupiah(item.amount)}`)
                    .join("; ")
                : "Tidak dialokasikan ke invoice",
            ],
          ]}
        />
        <DialogFooter>
          {payment.receipt_id && propertyId ? (
            <ReceiptDownloadButton
              propertyId={propertyId}
              receiptId={payment.receipt_id}
              paymentCode={payment.payment_code}
              isContractSettled={isContractSettled}
            />
          ) : null}
          <Button className="min-h-11" variant="secondary" onClick={() => setOpen(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptDownloadButton({
  propertyId,
  receiptId,
  paymentCode,
  isContractSettled,
}: {
  propertyId: string | null;
  receiptId: string;
  paymentCode: string;
  isContractSettled: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(false);

  const download = () => {
    if (!propertyId || downloading) return;
    setDownloading(true);
    setError(false);
    void downloadAdminReceiptDocument(
      propertyId,
      receiptId,
      `KWT-${paymentCode}${isContractSettled ? "-LUNAS" : ""}`,
    )
      .catch(() => setError(true))
      .finally(() => setDownloading(false));
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        className="min-h-9"
        variant="success"
        disabled={!propertyId || downloading}
        onClick={download}
      >
        <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {downloading ? "Menyiapkan..." : isContractSettled ? "Kuitansi lunas" : "Unduh kuitansi"}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          Kuitansi belum dapat diunduh.
        </span>
      ) : null}
    </span>
  );
}
function HonestEmpty({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 text-center">
      <div className="mb-2 text-muted-foreground">{icon}</div>
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
function DeferredPanel({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="flex min-h-40 flex-col justify-center pt-6">
        <div className="mb-3 text-muted-foreground">{icon}</div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <p className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <BadgeInfo className="h-3.5 w-3.5" /> Belum ada data yang dihubungkan.
        </p>
      </CardContent>
    </Card>
  );
}
function maskKtp(value: string): string {
  return value.length <= 8 ? value : `${value.slice(0, 4)}********${value.slice(-4)}`;
}
