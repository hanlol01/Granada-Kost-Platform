import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BedDouble,
  CalendarClock,
  CarFront,
  CircleDollarSign,
  ClipboardList,
  FileClock,
  History,
  MessageSquareWarning,
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
  type OwnerCollectionProgress,
  type OwnerOccupancyResidentDetail,
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
    vacant: "Kosong", reserved: "Dipesan", occupied: "Terisi", maintenance: "Perawatan",
    inactive: "Tidak aktif", requires_review: "Perlu peninjauan", active: "Aktif", draft: "Draf",
    awaiting_activation: "Menunggu aktivasi", ended: "Berakhir", completed: "Selesai", cancelled: "Dibatalkan",
    transferred: "Dialihkan", male: "Putra", female: "Putri", rukost: "Rumah Kost", apartkost: "Apart Kost",
    building_assignment: "Penugasan bangunan Rumah Kost", room_assignment: "Penugasan kamar Apart Kost",
    current: "Berjalan", partially_paid: "Sebagian dibayar", overdue: "Terlambat", settled: "Lunas",
    not_available: "Belum tersedia", scheduled: "Terjadwal", inspection_required: "Menunggu inspeksi",
  };
  return values[value] ?? value;
};

function StatusPill({ value }: { value: string }) {
  const muted = ["vacant", "inactive", "ended", "cancelled"].includes(value);
  const warning = ["maintenance", "requires_review", "awaiting_activation"].includes(value);
  return <Badge variant="outline" className={`rounded-full px-2.5 py-1 text-xs font-semibold ${warning ? "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300" : muted ? "border-border bg-muted/50 text-muted-foreground" : "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>{label(value)}</Badge>;
}

function DataItem({ label: title, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{title}</p><p className="mt-1 break-words text-sm font-semibold leading-6 text-foreground">{value}</p></div>;
}

function Metric({ label: title, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border/70 bg-muted/25 p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{title}</p><p className="mt-2 text-base font-semibold leading-6 text-foreground">{value}</p></div>;
}

function DetailContent({
  asset,
  residentDetail,
  collection,
}: {
  asset: OwnerAssetDetail;
  residentDetail?: OwnerOccupancyResidentDetail;
  collection?: OwnerCollectionProgress;
}) {
  const billing = residentDetail?.billing;
  const collectionItem = collection?.items.find((item) => item.room.code === asset.roomCode);
  const operations = residentDetail?.operations;
  const lease = residentDetail?.lease ?? asset.lease;
  const resident = residentDetail?.resident ?? asset.resident;
  const activity = [
    lease ? `Sewa ${label(lease.status).toLowerCase()}` : null,
    resident ? `Hunian dimulai ${date(resident.occupancyStartDate)}` : null,
    asset.lifecycle.transferState ? `Pindah kamar: ${label(asset.lifecycle.transferState)}` : null,
    asset.lifecycle.renewalState ? `Perpanjangan: ${label(asset.lifecycle.renewalState)}` : null,
    asset.lifecycle.checkoutState ? `Checkout: ${label(asset.lifecycle.checkoutState)}` : null,
  ].filter((item): item is string => item !== null);
  return <div className="space-y-6">
    <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm"><div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><StatusPill value={asset.roomStatus} /><Badge variant="secondary">{label(asset.kostType)}</Badge><Badge variant="secondary">{label(asset.genderPolicy)}</Badge></div><h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">Kamar {asset.roomCode}</h1><p className="mt-1 text-sm leading-6 text-muted-foreground">{asset.building.name} · {asset.building.code}</p></div><div className="rounded-xl border border-primary/20 bg-primary/[0.045] px-4 py-3 text-sm text-muted-foreground"><p className="font-semibold text-foreground">Cakupan owner aktif</p><p className="mt-1">Data mengikuti assignment kepemilikan yang berlaku.</p></div></div></section>
    <section className="grid items-stretch gap-4 xl:grid-cols-3">
      <Card className="border-border/80 shadow-sm"><CardHeader className="border-b border-border/70 pb-4"><CardTitle className="flex items-center gap-2 text-base"><BedDouble className="h-4 w-4 text-primary" /> Inventori fisik</CardTitle></CardHeader><CardContent className="grid gap-5 pt-6 sm:grid-cols-2 xl:grid-cols-1"><DataItem label="Nomor kamar" value={asset.roomCode} /><DataItem label="Kode kamar" value={asset.roomCode} /><DataItem label="Bangunan" value={asset.building.name} /><DataItem label="Kategori" value={label(asset.kostType)} /><DataItem label="Unit" value={asset.building.floorLabel || asset.building.unitCode || "Belum dicatat"} /><DataItem label="Jenis hunian" value={label(asset.genderPolicy)} /></CardContent></Card>
      <Card className="border-border/80 shadow-sm"><CardHeader className="border-b border-border/70 pb-4"><CardTitle className="flex items-center gap-2 text-base"><CircleDollarSign className="h-4 w-4 text-primary" /> Sumber komersial kategori</CardTitle></CardHeader><CardContent className="grid gap-5 pt-6 sm:grid-cols-2 xl:grid-cols-1"><DataItem label="Harga bulanan" value={formatOwnerMoney(asset.commercial.monthlyPrice)} /><DataItem label="Nilai kontrak tahunan" value={formatOwnerMoney(asset.commercial.annualContractValue)} /><DataItem label="DP rekomendasi" value="Rekomendasi 25% dari nilai kontrak tahunan" /><DataItem label="Deposit keamanan" value={collectionItem ? formatOwnerMoney(collectionItem.securityDeposit.required) : billing ? formatOwnerMoney(billing.securityDepositRequired) : "Belum ditentukan"} /><p className="rounded-lg border border-border/70 bg-muted/30 p-3 text-xs leading-5 text-muted-foreground sm:col-span-2 xl:col-span-1">Nilai komersial berasal dari konfigurasi kategori dan hanya dapat diubah melalui Admin.</p></CardContent></Card>
      <Card className="border-border/80 shadow-sm"><CardHeader className="border-b border-border/70 pb-4"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" /> Kepemilikan</CardTitle></CardHeader><CardContent className="grid gap-5 pt-6"><DataItem label="Otoritas saat ini" value={asset.ownership.source === "building_assignment" ? asset.building.name : "Owner Property"} /><DataItem label="Sumber" value={label(asset.ownership.source)} /><DataItem label="Periode efektif" value={`${date(asset.ownership.effectiveFrom)} — ${date(asset.ownership.effectiveUntil)}`} /><DataItem label="Status" value="Aktif" /></CardContent></Card>
    </section>
    <section className="grid items-stretch gap-4 lg:grid-cols-2">
      <Card className="border-border/80 shadow-sm"><CardHeader className="border-b border-border/70 pb-4"><CardTitle className="flex items-center gap-2 text-base"><UserRound className="h-4 w-4 text-primary" /> Penghuni aktif</CardTitle></CardHeader><CardContent className="grid gap-5 pt-6 sm:grid-cols-2"><DataItem label="Nama penghuni" value={resident?.displayName ?? "Tidak ada penghuni aktif"} /><DataItem label="Status akun" value={resident ? "Aktif" : "—"} /><DataItem label="Mulai hunian" value={resident ? date(resident.occupancyStartDate) : "Tidak tercatat"} /><DataItem label="Status hunian" value={residentDetail?.occupancy ? label(residentDetail.occupancy.status) : "Tidak aktif"} />{resident ? <Button asChild className="min-h-10 sm:col-span-2"><Link to="/property-owners/portal/occupancy/$roomCode" params={{ roomCode: asset.roomCode }}><UserRound className="mr-2 h-4 w-4" /> Buka detail penghuni</Link></Button> : null}</CardContent></Card>
      <Card className="border-border/80 shadow-sm"><CardHeader className="border-b border-border/70 pb-4"><CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4 text-primary" /> Penyewaan dan hunian</CardTitle></CardHeader><CardContent className="grid gap-5 pt-6 sm:grid-cols-2"><DataItem label="Kode penyewaan" value={lease ? "Tersedia pada data sewa" : "Tidak tercatat"} /><DataItem label="Status penyewaan" value={lease ? label(lease.status) : "Tidak aktif"} /><DataItem label="Mulai" value={lease ? date(lease.startDate) : "Tidak tercatat"} /><DataItem label="Selesai" value={lease ? date(lease.endDate) : "Tidak tercatat"} /><DataItem label="Durasi" value={lease ? "Mengikuti periode sewa" : "Tidak tercatat"} /><DataItem label="Status hunian" value={residentDetail?.occupancy ? label(residentDetail.occupancy.status) : "Tidak aktif"} /></CardContent></Card>
    </section>
    <Card className="border-border/80 shadow-sm"><CardHeader className="border-b border-border/70 pb-4"><CardTitle className="flex items-center gap-2 text-base"><CircleDollarSign className="h-4 w-4 text-primary" /> Ringkasan penyewaan dan pembayaran</CardTitle></CardHeader><CardContent className="pt-6">{collectionItem ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Nilai kontrak" value={formatOwnerMoney(asset.commercial.annualContractValue)} /><Metric label="Sewa ditagihkan" value={formatOwnerMoney(collectionItem.billing.rentInvoiced)} /><Metric label="Sewa terverifikasi" value={formatOwnerMoney(collectionItem.billing.rentVerified)} /><Metric label="Sewa belum dibayar" value={formatOwnerMoney(collectionItem.billing.rentOutstanding)} /><Metric label="Status tagihan" value={label(collectionItem.billing.state)} /><Metric label="Jumlah invoice" value={`${collectionItem.billing.invoiceCount} invoice`} /><Metric label="Invoice terlambat" value={`${collectionItem.billing.overdueCount} invoice`} /><Metric label="Tagihan berikutnya" value={date(collectionItem.billing.nextDueDate)} /><Metric label="Angsuran" value={`${collectionItem.billing.installmentPaid}/${collectionItem.billing.installmentTotal} dibayar`} /><Metric label="Deposit wajib" value={formatOwnerMoney(collectionItem.securityDeposit.required)} /><Metric label="Deposit terkumpul" value={formatOwnerMoney(collectionItem.securityDeposit.collected)} /><Metric label="Saldo deposit" value={formatOwnerMoney(collectionItem.securityDeposit.balance)} /><Metric label="Checkpoint pembayaran" value={collectionItem.settlement.checkpoint.status === "not_available" ? "Belum tersedia" : `${formatOwnerMoney(collectionItem.settlement.checkpoint.remainingAmount)} tersisa`} /><Metric label="Pengingat tagihan" value={collectionItem.settlement.reminderStage ?? "Tidak ada"} /></div> : billing ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Nilai kontrak" value={formatOwnerMoney(asset.commercial.annualContractValue)} /><Metric label="Sewa ditagihkan" value={formatOwnerMoney(billing.rentInvoiced)} /><Metric label="Sewa terverifikasi" value={formatOwnerMoney(billing.rentVerified)} /><Metric label="Sewa belum dibayar" value={formatOwnerMoney(billing.rentOutstanding)} /><Metric label="Status tagihan" value={label(billing.state)} /><Metric label="Jumlah invoice" value={`${billing.invoiceCount} invoice`} /><Metric label="Invoice terlambat" value={`${billing.overdueCount} invoice`} /><Metric label="Tagihan berikutnya" value={date(billing.nextDueDate)} /><Metric label="Angsuran" value={`${billing.installmentPaid}/${billing.installmentTotal} dibayar`} /><Metric label="Deposit wajib" value={formatOwnerMoney(billing.securityDepositRequired)} /><Metric label="Deposit terkumpul" value={formatOwnerMoney(billing.depositCollected)} /><Metric label="Saldo deposit" value={formatOwnerMoney(billing.depositBalance)} /></div> : <p className="rounded-xl border border-border/70 bg-muted/25 p-4 text-sm text-muted-foreground">Data billing belum tersedia untuk penghuni aktif.</p>}</CardContent></Card>
    <section className="grid gap-4 lg:grid-cols-2"><Card className="border-border/80 shadow-sm"><CardHeader className="border-b border-border/70 pb-4"><CardTitle className="flex items-center gap-2 text-base"><CarFront className="h-4 w-4 text-primary" /> Kendaraan dan parkir</CardTitle></CardHeader><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Ringkasan kendaraan aktif dan slot parkir dalam cakupan kamar ini.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Metric label="Kendaraan aktif" value={`${operations?.activeVehicleCount ?? 0}`} /><Metric label="Slot parkir terhubung" value={`${operations?.assignedParkingCount ?? 0}`} /></div></CardContent></Card><Card className="border-border/80 shadow-sm"><CardHeader className="border-b border-border/70 pb-4"><CardTitle className="flex items-center gap-2 text-base"><MessageSquareWarning className="h-4 w-4 text-primary" /> Komplain dan work order</CardTitle></CardHeader><CardContent className="pt-6"><div className="grid gap-3 sm:grid-cols-2"><Metric label="Komplain terbuka" value={`${asset.issues.openComplaints}`} /><Metric label="Maintenance aktif" value={`${asset.issues.openMaintenance}`} /></div><p className="mt-4 text-sm text-muted-foreground">Rincian pekerjaan operasional dikelola melalui Admin.</p></CardContent></Card></section>
    <Card className="border-border/80 shadow-sm"><CardHeader className="border-b border-border/70 pb-4"><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-primary" /> Aktivitas kamar</CardTitle></CardHeader><CardContent className="pt-6">{activity.length ? <div className="space-y-4">{activity.map((item) => <div key={item} className="flex items-start gap-3"><FileClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p className="text-sm leading-6 text-foreground">{item}</p></div>)}</div> : <p className="text-sm text-muted-foreground">Belum ada aktivitas ringkas untuk kamar ini.</p>}</CardContent></Card>
  </div>;
}

export function PropertyOwnerAssetDetailPage({ roomCode }: { roomCode: string }) {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const detail = useQuery({ queryKey: ["property-owner", "asset-detail", user?.id, roomCode], queryFn: () => propertyOwnerPortalApi.getAssetDetail(roomCode), enabled: Boolean(user?.id && hasRole("property_owner")) });
  const residentDetail = useQuery({ queryKey: ["property-owner", "occupancy-resident-detail", user?.id, roomCode], queryFn: () => propertyOwnerPortalApi.getOccupancyResidentDetail(roomCode), enabled: Boolean(user?.id && hasRole("property_owner") && detail.data?.resident) });
  const collection = useQuery({ queryKey: ["property-owner", "collection-progress", user?.id], queryFn: () => propertyOwnerPortalApi.collectionProgress(), enabled: Boolean(user?.id && hasRole("property_owner") && detail.data?.resident), staleTime: 30_000 });
  useEffect(() => { if (!hasRole("property_owner")) void navigate({ to: "/property-owners" }); }, [hasRole, navigate]);
  if (!hasRole("property_owner")) return null;
  return <OwnerPortalShell activeRoute="assets" ownerName={user?.email ?? "Property Owner"} historical={false} breadcrumbTail={roomCode}><Button asChild variant="outline" className="mb-6 min-h-10"><Link to="/property-owners/portal/assets"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Aset Saya</Link></Button>{detail.isLoading ? <LoadingState label="Memuat detail aset owner..." /> : detail.error || !detail.data ? <ErrorState error={detail.error} onRetry={() => void detail.refetch()} title="Detail aset tidak tersedia" /> : <><div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock className="h-4 w-4 text-primary" /> Diperbarui {date(detail.data.updatedAt)}</div><DetailContent asset={detail.data} residentDetail={residentDetail.data} collection={collection.data} /></>}</OwnerPortalShell>;
}
