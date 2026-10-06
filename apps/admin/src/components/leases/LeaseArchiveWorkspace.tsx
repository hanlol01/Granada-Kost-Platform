import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingState } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NoticeAlert } from "@/components/ui/notice-alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/lib/auth";
import { adminErrorNotice } from "@/lib/error-normalizer";
import { formatIDR, formatRecordedAt } from "@/lib/format";
import { leaseArchiveApi } from "@/lib/lease-archive-api";
import type { LeaseArchiveFilters } from "@/lib/lease-archive-contract";
import { useProperty } from "@/lib/property";
import { LeaseArchiveRestorePanel } from "./LeaseArchiveRestorePanel";
import { LeaseArchiveFilePanel } from "./LeaseArchiveFilePanel";

const PAGE_SIZE = 20;
export function LeaseArchiveWorkspace({ archiveId }: { archiveId?: string }) {
  const { currentPropertyId } = useProperty();
  const { hasRole, hasPermission } = useAuth();
  const authorized = hasRole("admin") && hasPermission("lease.read");
  return <AppShell title={archiveId ? "Rincian Arsip Penyewaan" : "Arsip Penyewaan"}
    subtitle="Pencatatan yang dibatalkan tetap dapat ditinjau tanpa menghapus riwayat transaksi.">
    {!authorized ? <NoticeAlert tone="destructive" title="Arsip hanya tersedia bagi Admin" description="Gunakan akun Admin dengan izin melihat penyewaan di properti ini." />
      : !currentPropertyId ? <NoticeAlert tone="warning" title="Pilih properti terlebih dahulu" description="Arsip ditampilkan sesuai properti aktif." />
      : archiveId ? <ArchiveDetail key={`${currentPropertyId}:${archiveId}`} propertyId={currentPropertyId} archiveId={archiveId} />
      : <ArchiveList key={currentPropertyId} propertyId={currentPropertyId} />}
  </AppShell>;
}

function ArchiveList({ propertyId }: { propertyId: string }) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<LeaseArchiveFilters["commercialMode"]>();
  const [finance, setFinance] = useState<LeaseArchiveFilters["financialResolutionState"]>();
  const [offset, setOffset] = useState(0);
  useEffect(() => { const timer = setTimeout(() => { setQ(search.trim()); setOffset(0); }, 350); return () => clearTimeout(timer); }, [search]);
  const query = useQuery({ queryKey: ["lease-archives", propertyId, q, mode, finance, offset],
    queryFn: ({ signal }) => leaseArchiveApi.list({ propertyId, q, commercialMode: mode, financialResolutionState: finance, limit: PAGE_SIZE, offset }, signal), retry: false });
  const notice = query.error ? adminErrorNotice(query.error, "Arsip belum dapat dimuat") : null;
  useEffect(() => { if (query.error) { const value = adminErrorNotice(query.error, "Arsip belum dapat dimuat"); toast.error(value.title, { description: value.description }); } }, [query.error]);
  return <div className="space-y-6">
    <Button variant="default" className="min-h-11" asChild><Link to="/tenants"><ArrowLeft aria-hidden="true" />Kembali ke data penghuni</Link></Button>
    <Card><CardHeader><CardTitle>Cari arsip penyewaan</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-3">
      <div className="space-y-2"><Label htmlFor="archive-search">Nama, kode penyewaan atau kamar</Label><Input id="archive-search" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} placeholder="Cari arsip" /></div>
      <div className="space-y-2"><Label htmlFor="archive-mode">Jenis hunian</Label><Select value={mode ?? "all"} onValueChange={(value) => { setMode(value === "rent" || value === "owner_sponsored" ? value : undefined); setOffset(0); }}><SelectTrigger id="archive-mode"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="all">Semua jenis hunian</SelectItem><SelectItem value="rent">Penyewaan berbayar</SelectItem><SelectItem value="owner_sponsored">Hunian Tanggungan Owner</SelectItem>
      </SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="archive-finance">Penyelesaian keuangan</Label><Select value={finance ?? "all"} onValueChange={(value) => { setFinance(value === "not_required" || value === "pending_review" || value === "resolved" ? value : undefined); setOffset(0); }}><SelectTrigger id="archive-finance"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="all">Semua kondisi</SelectItem><SelectItem value="not_required">Tidak ada riwayat transaksi</SelectItem><SelectItem value="pending_review">Menunggu penyelesaian keuangan</SelectItem><SelectItem value="resolved">Penyelesaian tercatat</SelectItem>
      </SelectContent></Select></div>
    </CardContent></Card>
    {query.isPending ? <LoadingState /> : notice ? <NoticeAlert id="archive-list-error" tone="destructive" title={notice.title} description={notice.description} action={<Button variant="info" onClick={() => void query.refetch()}>Coba lagi</Button>} />
      : query.data ? <>
        <p className="text-sm font-semibold" aria-live="polite">{query.data.total} arsip sesuai pencarian</p>
        {query.data.items.length === 0 ? <NoticeAlert title="Belum ada arsip yang sesuai" description="Penyewaan muncul di sini setelah dibatalkan dan diarsipkan. Ubah pencarian bila arsip yang dicari belum ditemukan." />
          : <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>
            <th className="p-4 font-semibold">Penghuni dan penyewaan</th><th className="p-4 font-semibold">Kamar</th><th className="p-4 font-semibold">Pembatalan</th><th className="p-4 font-semibold">Keuangan</th><th className="p-4 font-semibold">Aksi</th>
          </tr></thead><tbody>{query.data.items.map((item) => <tr key={item.id} className="border-t align-top">
            <td className="space-y-2 p-4"><p className="font-semibold">{item.residentName}</p><p>{item.leaseCode}</p><p className="text-muted-foreground">{item.commercialMode === "rent" ? "Penyewaan berbayar" : "Hunian Tanggungan Owner"}</p><StatusBadge tone={item.archiveStatus === "restored" ? "success" : item.archiveStatus === "superseded" ? "info" : "neutral"} label={item.archiveStatus === "restored" ? "Telah dipulihkan" : item.archiveStatus === "superseded" ? "Memiliki pengganti" : "Diarsipkan"} /></td>
            <td className="p-4"><p className="font-semibold">{item.roomNumber}</p><p>No. Kavling {item.plotNumber || "—"}</p></td>
            <td className="max-w-80 p-4"><p className="break-words">{item.reason}</p><p className="mt-2 text-muted-foreground">{formatRecordedAt(item.archivedAt)} · {item.archivedBy}</p></td>
            <td className="p-4"><FinanceState state={item.financialResolutionState} /></td>
            <td className="p-4"><Button variant="info" asChild><Link to="/tenants/archives/$archiveId" params={{ archiveId: item.id }}>Lihat arsip</Link></Button></td>
          </tr>)}</tbody></table></div>}
        <div className="flex flex-wrap items-center justify-end gap-3"><Button variant="default" className="min-h-11" disabled={offset === 0 || query.isFetching} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Sebelumnya</Button>
          <Button variant="default" className="min-h-11" disabled={offset + PAGE_SIZE >= query.data.total || query.isFetching} onClick={() => setOffset(offset + PAGE_SIZE)}>Berikutnya</Button></div>
      </> : null}
  </div>;
}

function ArchiveDetail({ propertyId, archiveId }: { propertyId: string; archiveId: string }) {
  const { hasPermission } = useAuth();
  const query = useQuery({ queryKey: ["lease-archive-detail", propertyId, archiveId], queryFn: ({ signal }) => leaseArchiveApi.detail(archiveId, propertyId, signal), retry: false });
  const notice = query.error ? adminErrorNotice(query.error, "Rincian arsip belum dapat dimuat") : null;
  useEffect(() => { if (query.error) { const value = adminErrorNotice(query.error, "Rincian arsip belum dapat dimuat"); toast.error(value.title, { description: value.description }); } }, [query.error]);
  const value = query.data;
  const context = value?.originalContext;
  return <div className="space-y-6">
    <Button variant="outline" asChild><Link to="/tenants/archives">Kembali ke arsip penyewaan</Link></Button>
    {query.isPending ? <LoadingState /> : notice && !value ? <NoticeAlert id="archive-detail-error" tone="destructive" title={notice.title} description={notice.description} action={<Button variant="info" onClick={() => void query.refetch()}>Coba lagi</Button>} />
      : value && context ? <>
        {notice ? <NoticeAlert tone="warning" title="Arsip belum dapat diperbarui" description={notice.description}
          action={<Button variant="info" onClick={() => void query.refetch()}>Perbarui arsip</Button>} /> : null}
        <div><h2 className="text-2xl font-bold">{context.lease.residentName}</h2><p className="mt-2 font-semibold">{context.lease.leaseCode} · Kamar {context.room.number} · No. Kavling {context.room.plotNumber || "—"}</p></div>
        <NoticeAlert tone={value.financialResolutionState === "pending_review" ? "warning" : "info"} title={value.archiveStatus === "restored" ? "Penyewaan telah dipulihkan" : value.archiveStatus === "superseded" ? "Arsip memiliki penyewaan pengganti" : "Penyewaan telah dibatalkan dan diarsipkan"} description={value.financialResolutionState === "pending_review"
          ? "Menunggu penyelesaian keuangan. Transaksi dan bukti lama tetap tersimpan; pembatalan tidak mencatat pengembalian dana atau pembalikan otomatis."
          : "Riwayat tetap tersimpan. Pembatalan ini bukan check-out dan tidak mencatat hunian fisik."} />
        <Card><CardHeader><CardTitle>Catatan pembatalan</CardTitle></CardHeader><CardContent className="space-y-4">
          <p className="whitespace-pre-wrap break-words">{value.reason}</p>
          <p className="text-sm">Dicatat {formatRecordedAt(value.archivedAt)} oleh <span className="font-semibold">{value.archivedBy}</span>.</p>
          <dl className="grid gap-4 sm:grid-cols-2"><ArchiveValue label="Kamar saat pembatalan" value={`${context.room.number} · Dilepas menjadi kosong`} />
            <ArchiveValue label="Kondisi kamar saat ini" value={roomStatusLabel(value.currentRoomStatus)} />
            <ArchiveValue label="Durasi tercatat" value={`${context.lease.termMonths} bulan`} />
            <ArchiveValue label="Jenis hunian" value={context.lease.commercialMode === "rent" ? "Penyewaan berbayar" : "Hunian Tanggungan Owner"} /></dl>
        </CardContent></Card>
        {value.archiveStatus !== "archived" ? <Card><CardHeader><CardTitle>{value.archiveStatus === "restored" ? "Catatan pemulihan" : "Catatan penyewaan pengganti"}</CardTitle></CardHeader><CardContent className="space-y-4">
          <p className="whitespace-pre-wrap break-words">{value.restorationReason ?? value.replacementReason}</p>
          <p className="text-sm">Dicatat {formatRecordedAt(value.restoredAt ?? value.replacedAt ?? "")} oleh <span className="font-semibold">{value.restoredBy ?? value.replacedBy}</span>.</p>
          <p className="text-sm text-muted-foreground">Catatan ini tidak membuat check-in fisik dan tidak menyalin pembayaran lama. Berkas yang dihapus permanen tidak dapat dikembalikan.</p>
          <Button variant="info" asChild><Link to="/tenants/$residentId" params={{ residentId: context.lease.residentId }}>{value.archiveStatus === "restored" ? "Lihat penyewaan yang dipulihkan" : "Lihat penyewaan pengganti"}</Link></Button>
          {hasPermission("lease.manage") && value.archiveStatus === "restored" ? <Button variant="info" asChild>
            <Link to="/tenants/correction/$leaseId" params={{ leaseId: value.leaseId }}>Lanjutkan koreksi data</Link>
          </Button> : null}
        </CardContent></Card> : null}
        {hasPermission("lease.manage") && value.archiveStatus === "archived" ? <LeaseArchiveRestorePanel archiveId={archiveId} propertyId={propertyId} /> : null}
        <LeaseArchiveFilePanel key={`${propertyId}:${archiveId}`} archiveId={archiveId} propertyId={propertyId}
          leaseId={value.leaseId} leaseCode={context.lease.leaseCode} residentName={context.lease.residentName}
          residentId={context.lease.residentId} canManage={hasPermission("lease.manage")} />
        <Card><CardHeader><CardTitle>Riwayat keuangan saat pembatalan</CardTitle></CardHeader><CardContent className="space-y-5">
          <FinanceState state={value.financialResolutionState} />
          <dl className="grid gap-4 sm:grid-cols-2"><ArchiveValue label="Pembayaran terverifikasi" value={formatIDR(context.financial.verifiedPaymentAmount)} />
            <ArchiveValue label="Pembayaran menunggu konfirmasi" value={formatIDR(context.financial.pendingPaymentAmount)} />
            <ArchiveValue label="Laporan transfer belum diperiksa (bukan pembayaran terverifikasi)" value={formatIDR(context.financial.pendingProofClaimedAmount)} />
            <ArchiveValue label="Nilai tagihan sewa saat pembatalan" value={formatIDR(context.financial.currentRentInvoiceAmount)} />
            <ArchiveValue label="Catatan keuangan terkait" value={`${context.financial.relatedTransactionCount} catatan`} /></dl>
          <Button variant="info" asChild><Link to="/tenants/$residentId" params={{ residentId: context.lease.residentId }}>Lihat riwayat penghuni dan dokumen</Link></Button>
        </CardContent></Card>
      </> : null}
  </div>;
}
function FinanceState({ state }: { state: "not_required" | "pending_review" | "resolved" }) {
  return <StatusBadge tone={state === "pending_review" ? "warning" : state === "resolved" ? "success" : "neutral"}
    label={state === "pending_review" ? "Menunggu penyelesaian keuangan" : state === "resolved" ? "Penyelesaian tercatat" : "Tidak ada riwayat transaksi"} />;
}
function ArchiveValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>;
}
function roomStatusLabel(status: string) {
  return ({ vacant: "Kosong", reserved: "Dipesan", awaiting_check_in: "Menunggu check-in", occupied: "Terisi", maintenance: "Perawatan", inactive: "Tidak aktif", inspection_required: "Perlu pemeriksaan", requires_review: "Perlu ditinjau" } as Record<string, string>)[status] ?? "Periksa kondisi terbaru pada detail kamar";
}
