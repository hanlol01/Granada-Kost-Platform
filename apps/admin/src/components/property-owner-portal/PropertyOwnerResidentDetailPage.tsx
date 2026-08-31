import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BedDouble,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  UserRound,
  Wrench,
} from "lucide-react";
import { OwnerPortalShell } from "@/components/property-owner-portal/OwnerPortalShell";
import { ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import {
  formatOwnerMoney,
  propertyOwnerPortalApi,
  type OwnerOccupancyResidentDetail,
} from "@/lib/property-owner-portal";

const labels: Record<string, string> = {
  active: "Aktif",
  current: "Berjalan",
  partially_paid: "Sebagian dibayar",
  overdue: "Terlambat",
  settled: "Lunas",
  not_available: "Belum tersedia",
  vacant: "Kosong",
  reserved: "Dipesan",
  awaiting_check_in: "Menunggu check-in",
  occupied: "Terisi",
  maintenance: "Perawatan",
  inactive: "Tidak aktif",
  requires_review: "Perlu peninjauan",
  rukost: "Rumah Kost",
  apartkost: "Apart Kost",
};

function localDate(value: string | null): string {
  if (!value) return "Tanpa batas akhir";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function optionalDate(value: string | null): string {
  return value ? localDate(value) : "Belum ada jadwal";
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/75 bg-muted/20 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.09em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold leading-6 text-foreground">{value}</p>
    </div>
  );
}

function BillingBadge({ state }: { state: OwnerOccupancyResidentDetail["billing"]["state"] }) {
  const tone =
    state === "overdue"
      ? "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300"
      : state === "partially_paid"
        ? "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : state === "settled" || state === "current"
          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-border bg-muted/50 text-muted-foreground";
  return <Badge className={`border ${tone}`}>{labels[state]}</Badge>;
}

function money(value: string): string {
  return formatOwnerMoney(value);
}

function ResidentDetailContent({ detail }: { detail: OwnerOccupancyResidentDetail }) {
  if (!detail.resident || !detail.occupancy) {
    return (
      <Card className="border-dashed border-border/90 shadow-sm">
        <CardContent className="p-8 text-center">
          <UserRound className="mx-auto h-6 w-6 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold">Belum ada penghuni aktif</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Kamar ini berada dalam cakupan Anda, tetapi belum memiliki hunian aktif untuk
            ditampilkan.
          </p>
        </CardContent>
      </Card>
    );
  }

  const period = detail.lease
    ? `${localDate(detail.lease.startDate)} - ${localDate(detail.lease.endDate)}`
    : "Belum tercatat";
  const lifecycle =
    detail.operations.transferState ??
    detail.operations.renewalState ??
    detail.operations.checkoutState ??
    "Tidak ada proses khusus";

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border/85 bg-card shadow-sm">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border border-primary/30 bg-primary/10 text-primary">
                Penghuni aktif
              </Badge>
              <Badge variant="outline">{labels[detail.room.kostType]}</Badge>
              <Badge variant="outline">{detail.room.roomCode}</Badge>
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
              {detail.resident.displayName}
            </h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Menempati {detail.room.roomCode} - {detail.room.buildingName}
            </p>
          </div>
          <div className="rounded-xl border border-primary/25 bg-primary/[0.045] px-4 py-3 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Data penghuni dalam cakupan Anda</p>
            <p className="mt-1">
              Ringkasan hunian dan keuangan mengikuti catatan resmi pada periode kepemilikan yang
              berlaku.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/85 shadow-sm">
          <CardHeader className="border-b border-border/70 pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="h-4 w-4 text-primary" /> Hunian aktif
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
            <DetailItem label="Penghuni" value={detail.resident.displayName} />
            <DetailItem label="Status hunian" value={labels[detail.occupancy.status]} />
            <DetailItem label="Kamar" value={detail.room.roomCode} />
            <DetailItem label="Mulai hunian" value={localDate(detail.occupancy.startDate)} />
          </CardContent>
        </Card>

        <Card className="border-border/85 shadow-sm">
          <CardHeader className="border-b border-border/70 pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-primary" /> Penyewaan dan tagihan
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
            <DetailItem
              label="Status sewa"
              value={detail.lease ? labels[detail.lease.status] : "Tidak aktif"}
            />
            <DetailItem label="Periode sewa" value={period} />
            <div className="rounded-xl border border-primary/25 bg-primary/[0.045] p-4 sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                    Status tagihan
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {labels[detail.billing.state]}
                  </p>
                </div>
                <BillingBadge state={detail.billing.state} />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Nilai di bawah berasal dari tagihan dan alokasi pembayaran yang sudah diverifikasi;
                bukti transfer, kredensial, dan catatan internal tetap tidak ditampilkan.
              </p>
            </div>
            <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
              <DetailItem label="Total tagihan sewa" value={money(detail.billing.rentInvoiced)} />
              <DetailItem
                label="Pembayaran sewa terverifikasi"
                value={money(detail.billing.rentVerified)}
              />
              <DetailItem label="Sisa tagihan sewa" value={money(detail.billing.rentOutstanding)} />
              <DetailItem
                label="Invoice sewa"
                value={`${detail.billing.invoiceCount} invoice · ${detail.billing.overdueCount} terlambat`}
              />
              <DetailItem
                label="Progress angsuran"
                value={`${detail.billing.installmentPaid}/${detail.billing.installmentTotal} selesai`}
              />
              <DetailItem
                label="Jatuh tempo berikutnya"
                value={optionalDate(
                  detail.billing.nextDueDate ?? detail.billing.installmentNextDueDate,
                )}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-border/85 shadow-sm">
          <CardHeader className="border-b border-border/70 pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <CircleDollarSign className="h-4 w-4 text-primary" /> Ringkasan security deposit
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <DetailItem
              label="Ketentuan deposit"
              value={money(detail.billing.securityDepositRequired)}
            />
            <DetailItem label="Deposit terkumpul" value={money(detail.billing.depositCollected)} />
            <DetailItem label="Deposit dipotong" value={money(detail.billing.depositDeducted)} />
            <DetailItem label="Saldo deposit" value={money(detail.billing.depositBalance)} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/85 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BedDouble className="h-4 w-4 text-primary" /> Kamar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailItem label="Bangunan" value={detail.room.buildingName} />
            <DetailItem label="Status kamar" value={labels[detail.room.roomStatus]} />
          </CardContent>
        </Card>
        <Card className="border-border/85 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-primary" /> Proses hunian
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DetailItem label="Status proses" value={lifecycle} />
          </CardContent>
        </Card>
        <Card className="border-border/85 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4 text-primary" /> Ringkasan operasional
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <DetailItem label="Komplain terbuka" value={String(detail.operations.openComplaints)} />
            <DetailItem
              label="Maintenance aktif"
              value={String(detail.operations.openMaintenance)}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export function PropertyOwnerResidentDetailPage({ roomCode }: { roomCode: string }) {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const detail = useQuery({
    queryKey: ["property-owner", "occupancy-resident-detail", user?.id, roomCode],
    queryFn: () => propertyOwnerPortalApi.getOccupancyResidentDetail(roomCode),
    enabled: Boolean(user?.id && hasRole("property_owner")),
  });

  useEffect(() => {
    if (!hasRole("property_owner")) void navigate({ to: "/property-owners" });
  }, [hasRole, navigate]);
  if (!hasRole("property_owner")) return null;

  return (
    <OwnerPortalShell
      activeRoute="occupancy"
      ownerName={user?.email ?? "Property Owner"}
      historical={false}
      breadcrumbTail="Detail penghuni"
    >
      <Button asChild variant="outline" className="mb-6 min-h-10">
        <Link to="/property-owners/portal/occupancy">
          <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Hunian & Penyewaan
        </Link>
      </Button>
      {detail.isLoading ? (
        <LoadingState label="Memuat detail penghuni owner..." />
      ) : detail.error || !detail.data ? (
        <ErrorState
          error={detail.error}
          onRetry={() => void detail.refetch()}
          title="Detail penghuni tidak tersedia"
        />
      ) : (
        <ResidentDetailContent detail={detail.data} />
      )}
    </OwnerPortalShell>
  );
}
