import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BedDouble,
  Building2,
  CircleDollarSign,
  ClipboardList,
  ShieldCheck,
  UserRound,
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
  type OwnerAssetDetail,
} from "@/lib/property-owner-portal";

const date = (value: string | null): string => {
  if (!value) return "Tanpa batas akhir";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
};

const label = (value: string): string => {
  const values: Record<string, string> = {
    vacant: "Kosong",
    reserved: "Dipesan",
    occupied: "Terisi",
    maintenance: "Perawatan",
    inactive: "Tidak aktif",
    requires_review: "Perlu peninjauan",
    active: "Aktif",
    draft: "Draf",
    awaiting_activation: "Menunggu aktivasi",
    ended: "Berakhir",
    completed: "Selesai",
    cancelled: "Dibatalkan",
    transferred: "Dialihkan",
    male: "Putra",
    female: "Putri",
    rukost: "Rumah Kost",
    apartkost: "Apart Kost",
    building_assignment: "Penugasan bangunan Rumah Kost",
    room_assignment: "Penugasan kamar Apart Kost",
    current: "Berjalan",
    partially_paid: "Sebagian dibayar",
    overdue: "Terlambat",
    settled: "Lunas",
    not_available: "Belum tersedia",
    approved: "Disetujui",
    scheduled: "Terjadwal",
    notice_received: "Pemberitahuan diterima",
    inspection_required: "Menunggu inspeksi",
    settlement_pending: "Menunggu penyelesaian",
  };
  return values[value] ?? value;
};

function StatusPill({ value }: { value: string }) {
  const muted = ["vacant", "inactive", "ended", "cancelled"].includes(value);
  const warning = ["maintenance", "requires_review", "awaiting_activation"].includes(value);
  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
        warning
          ? "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : muted
            ? "border-border bg-muted/50 text-muted-foreground"
            : "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      }`}
    >
      {label(value)}
    </Badge>
  );
}

function DataItem({ label: title, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </p>
      <p className="mt-1 break-words text-sm font-semibold leading-6 text-foreground">{value}</p>
    </div>
  );
}

function DetailContent({ asset }: { asset: OwnerAssetDetail }) {
  const roomLabel = label(asset.kostType);
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill value={asset.roomStatus} />
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {roomLabel}
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                {label(asset.genderPolicy)}
              </span>
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
              Kamar {asset.roomCode}
            </h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {asset.building.name} · {asset.building.code}
            </p>
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary/[0.045] px-4 py-3 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Cakupan owner aktif</p>
            <p className="mt-1">Data ditampilkan dari assignment kepemilikan yang berlaku.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <BedDouble className="h-4 w-4 text-primary" /> Inventori fisik
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
            <DataItem label="Kode kamar" value={asset.roomCode} />
            <DataItem label="Bangunan" value={asset.building.name} />
            <DataItem
              label="Lantai / unit"
              value={asset.building.floorLabel || asset.building.unitCode || "Belum dicatat"}
            />
            <DataItem label="Jenis hunian" value={label(asset.genderPolicy)} />
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <CircleDollarSign className="h-4 w-4 text-primary" /> Ketentuan komersial
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
            <DataItem
              label="Harga bulanan"
              value={formatOwnerMoney(asset.commercial.monthlyPrice)}
            />
            <DataItem
              label="Nilai kontrak tahunan"
              value={formatOwnerMoney(asset.commercial.annualContractValue)}
            />
            <p className="rounded-lg border border-border/70 bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
              Nilai komersial bersumber dari konfigurasi kategori dan tidak dapat diubah dari portal
              ini.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" /> Kepemilikan
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
            <DataItem label="Sumber otoritas" value={label(asset.ownership.source)} />
            <DataItem label="Berlaku sejak" value={date(asset.ownership.effectiveFrom)} />
            <DataItem label="Berakhir pada" value={date(asset.ownership.effectiveUntil)} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="h-4 w-4 text-primary" /> Penyewaan dan hunian
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <DataItem
              label="Status sewa"
              value={asset.lease ? label(asset.lease.status) : "Tidak aktif"}
            />
            <DataItem
              label="Periode sewa"
              value={
                asset.lease
                  ? `${date(asset.lease.startDate)} — ${date(asset.lease.endDate)}`
                  : "Tidak tercatat"
              }
            />
            <DataItem
              label="Penghuni aktif"
              value={asset.resident?.displayName ?? "Tidak ada penghuni aktif"}
            />
            <DataItem
              label="Mulai hunian"
              value={asset.resident ? date(asset.resident.occupancyStartDate) : "Tidak tercatat"}
            />
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-primary" /> Ringkasan operasional
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/[0.045] p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Status tagihan
                </p>
                <p className="mt-1 font-semibold text-foreground">{label(asset.billing.state)}</p>
              </div>
              <StatusPill value={asset.billing.state} />
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/25 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Komplain terbuka
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                {asset.issues.openComplaints}
              </p>
            </div>
            <DataItem
              label="Pindah kamar"
              value={
                asset.lifecycle.transferState
                  ? label(asset.lifecycle.transferState)
                  : "Tidak ada proses"
              }
            />
            <DataItem
              label="Perpanjangan"
              value={
                asset.lifecycle.renewalState
                  ? label(asset.lifecycle.renewalState)
                  : "Tidak ada proses"
              }
            />
            <DataItem
              label="Checkout"
              value={
                asset.lifecycle.checkoutState
                  ? label(asset.lifecycle.checkoutState)
                  : "Tidak ada proses"
              }
            />
            <div className="rounded-xl border border-border/70 bg-muted/25 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Maintenance aktif
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                {asset.issues.openMaintenance}
              </p>
            </div>
            <p className="sm:col-span-2 text-sm leading-6 text-muted-foreground">
              Hanya jumlah ringkasan yang ditampilkan. Catatan internal dan data pribadi tidak
              tersedia di portal owner.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export function PropertyOwnerAssetDetailPage({ roomCode }: { roomCode: string }) {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const detail = useQuery({
    queryKey: ["property-owner", "asset-detail", user?.id, roomCode],
    queryFn: () => propertyOwnerPortalApi.getAssetDetail(roomCode),
    enabled: Boolean(user?.id && hasRole("property_owner")),
  });

  useEffect(() => {
    if (!hasRole("property_owner")) void navigate({ to: "/property-owners" });
  }, [hasRole, navigate]);

  if (!hasRole("property_owner")) {
    return null;
  }

  return (
    <OwnerPortalShell
      activeRoute="assets"
      ownerName={user?.email ?? "Property Owner"}
      historical={false}
      breadcrumbTail={roomCode}
    >
      <Button asChild variant="outline" className="mb-6 min-h-10">
        <Link to="/property-owners/portal/assets">
          <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Aset Saya
        </Link>
      </Button>
      {detail.isLoading ? (
        <LoadingState label="Memuat detail aset owner..." />
      ) : detail.error || !detail.data ? (
        <ErrorState
          error={detail.error}
          onRetry={() => void detail.refetch()}
          title="Detail aset tidak tersedia"
        />
      ) : (
        <DetailContent asset={detail.data} />
      )}
    </OwnerPortalShell>
  );
}
