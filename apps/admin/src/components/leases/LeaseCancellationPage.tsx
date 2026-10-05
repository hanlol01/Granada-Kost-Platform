/* Guided operational cancellation. Real occupancy remains in correction/check-out. */
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@granada-kost/api-client";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingState } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NoticeAlert } from "@/components/ui/notice-alert";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
import { useAuth } from "@/lib/auth";
import { adminErrorNotice, type AdminErrorNotice } from "@/lib/error-normalizer";
import { formatIDR } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";
import { leaseArchiveApi } from "@/lib/lease-archive-api";
import type { LeaseCancellationInput, LeaseCancellationResult, LeaseCancellationReview } from "@/lib/lease-archive-contract";
import { formatIndonesianDate } from "@/lib/lease-onboarding-form";
import { refreshLeaseRevisionProjections } from "@/lib/lease-revision-cache";
import { LeaseRevisionContractError } from "@/lib/lease-revision-contract";
import { useProperty } from "@/lib/property";

export function LeaseCancellationPage({ leaseId }: { leaseId: string }) {
  const { currentPropertyId } = useProperty();
  const { hasRole, hasPermission } = useAuth();
  const authorized = hasRole("admin") && hasPermission("lease.manage");
  const review = useQuery({
    queryKey: ["lease-cancellation-preview", currentPropertyId, leaseId],
    queryFn: ({ signal }) => leaseArchiveApi.preview(leaseId, currentPropertyId!, signal),
    enabled: authorized && Boolean(currentPropertyId), retry: false, refetchOnWindowFocus: false,
  });
  const notice = review.error ? adminErrorNotice(review.error, "Pembatalan belum dapat ditinjau") : null;
  useEffect(() => {
    if (review.error) {
      const value = adminErrorNotice(review.error, "Pembatalan belum dapat ditinjau");
      toast.error(value.title, { description: value.description });
    }
  }, [review.error]);
  return <AppShell title="Batalkan dan Arsipkan Penyewaan" subtitle="Untuk pencatatan penyewaan yang keliru, bukan untuk mengakhiri hunian nyata.">
    <div className="space-y-6">
      <Button variant="default" className="min-h-11" asChild><Link to="/tenants"><ArrowLeft aria-hidden="true" />Kembali ke data penghuni</Link></Button>
      {!authorized ? <NoticeAlert tone="destructive" title="Pembatalan hanya tersedia bagi Admin" description="Gunakan akun Admin properti dengan izin mengelola penyewaan." />
        : !currentPropertyId ? <NoticeAlert tone="warning" title="Pilih properti terlebih dahulu" description="Pembatalan hanya berlaku pada penyewaan di properti aktif." />
        : review.isPending ? <LoadingState />
        : notice && !review.data ? <NoticeAlert id="cancellation-load-error" tone="destructive" title={notice.title} description={notice.description}
          action={<Button variant="default" className="min-h-11" disabled={review.isFetching} onClick={() => void review.refetch()}><RefreshCw aria-hidden="true" />Perbarui tinjauan</Button>} />
        : review.data ? <>
          {notice ? <NoticeAlert tone="warning" title="Tinjauan belum dapat diperbarui" description={notice.description}
            action={<Button variant="default" className="min-h-11" disabled={review.isFetching} onClick={() => void review.refetch()}><RefreshCw aria-hidden="true" />Perbarui tinjauan</Button>} /> : null}
          <CancellationReview key={`${currentPropertyId}:${leaseId}`} review={review.data} onRefresh={() => void review.refetch()} />
        </> : null}
    </div>
  </AppShell>;
}

function CancellationReview({ review, onRefresh }: { review: LeaseCancellationReview; onRefresh: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [activationConfirmed, setActivationConfirmed] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const intent = useRef<{ input: LeaseCancellationInput; key: string } | null>(null);
  const [notice, setNotice] = useState<AdminErrorNotice | null>(null);
  const [result, setResult] = useState<LeaseCancellationResult | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const { lease, room, financial, policies } = review;
  const locked = pending || uncertain || Boolean(result);
  useEffect(() => { if (notice) document.getElementById("cancellation-error")?.focus(); }, [notice]);
  function requestConfirmation() {
    if (reason.trim().length < 3) {
      const value = adminErrorNotice(new ApiError({ status: 422, code: "LEASE_CANCELLATION_REASON_REQUIRED", message: "" }));
      setNotice(value); toast.error(value.title, { description: value.description });
      document.getElementById("cancellation-reason")?.focus(); return;
    }
    if (!confirmed || policies.cancellation.requiresMistakenActivationConfirmation && !activationConfirmed) {
      const value = adminErrorNotice(new ApiError({ status: 422, code: "LEASE_CANCELLATION_CONFIRMATION_REQUIRED", message: "" }));
      setNotice(value); toast.error(value.title, { description: value.description }); return;
    }
    setNotice(null); setConfirmationOpen(true);
  }
  async function submit() {
    if (pendingRef.current || result) return;
    pendingRef.current = true; setPending(true); setNotice(null); setConfirmationOpen(false);
    intent.current ??= { key: newIdempotencyKey(), input: { reason: reason.trim(), reviewFingerprint: review.reviewFingerprint,
      cancellationConfirmed: true, mistakenActivationConfirmed: activationConfirmed } };
    try {
      const saved = await leaseArchiveApi.cancel(lease.id, lease.propertyId, intent.current.input, intent.current.key);
      setResult(saved); setUncertain(false);
      toast.success("Penyewaan dibatalkan dan masuk arsip", { description: `Kamar ${saved.roomNumber} telah dilepas. Riwayat penyewaan dan transaksi tetap tersimpan.` });
      const refreshed = await refreshLeaseRevisionProjections(queryClient, { propertyId: lease.propertyId, leaseId: lease.id, residentId: lease.residentId });
      setRefreshFailed(!refreshed);
    } catch (error) {
      const unknown = error instanceof LeaseRevisionContractError && error.code === "LEASE_ARCHIVE_COMMIT_RESPONSE_INVALID" ||
        !ApiError.isApiError(error) || error.status === 0 || error.status >= 500;
      const value = unknown ? adminErrorNotice(new LeaseRevisionContractError("LEASE_ARCHIVE_COMMIT_RESPONSE_INVALID", ""), undefined, error)
        : adminErrorNotice(error, "Penyewaan belum dapat dibatalkan");
      setUncertain(unknown); setNotice(value);
      if (!unknown) intent.current = null;
      toast.error(value.title, { description: value.description });
    } finally { pendingRef.current = false; setPending(false); }
  }
  return <div className="space-y-6">
    <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 shadow-md shadow-primary/10 dark:from-primary/15 dark:via-primary/10 dark:to-background">
      <CardContent className="space-y-2 p-5 sm:p-6">
        <h2 className="text-2xl font-bold text-foreground">{lease.residentName}</h2>
        <p className="text-sm font-semibold text-foreground">{lease.leaseCode} · Kamar {room.number} · No. Kavling {room.plotNumber || "—"}</p>
        <p className="text-sm text-foreground/80">{lease.commercialMode === "rent" ? "Penyewaan berbayar" : "Hunian Tanggungan Owner"} · Belum ada check-in fisik</p>
      </CardContent>
    </Card>
    {result ? <NoticeAlert id="cancellation-success" tone="success" title="Penyewaan masuk arsip" description={
      <div className="space-y-2"><p>Kamar {result.roomNumber} sudah dilepas. Riwayat penyewaan, pembayaran dan bukti tetap tersimpan.</p>
        {result.financialResolutionState === "pending_review" ? <p className="font-semibold">Menunggu penyelesaian keuangan. Pembatalan ini tidak melakukan pengembalian dana atau pembalikan transaksi.</p> : null}
        {refreshFailed ? <p>Pembatalan sudah tersimpan, tetapi daftar belum dapat diperbarui. Buka arsip atau muat ulang daftar; jangan mengajukan pembatalan baru.</p> : null}</div>}
      action={<Button variant="info" asChild><Link to="/tenants/archives/$archiveId" params={{ archiveId: result.id }}>Lihat arsip penyewaan</Link></Button>} /> : null}
    {notice ? <NoticeAlert id="cancellation-error" tone="destructive" title={notice.title} description={notice.description}
      action={uncertain ? <Button variant="info" disabled={pending} onClick={() => void submit()}>Coba ulang pengajuan yang sama</Button>
        : <Button variant="default" className="min-h-11" disabled={pending} onClick={onRefresh}><RefreshCw aria-hidden="true" />Perbarui tinjauan</Button>} /> : null}
    {!result ? <>
      <NoticeAlert tone="warning" title="Pastikan ini kesalahan pencatatan" description={review.consequence} />
      <Card><CardHeader><CardTitle>Ringkasan yang akan diarsipkan</CardTitle></CardHeader><CardContent>
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Value label="Durasi" value={`${lease.termMonths} bulan`} />
          <Value label="Tanggal rencana" value={formatIndonesianDate(lease.plannedStartDate || lease.recordedStartDate)} />
          <Value label="Nilai kontrak sewa" value={formatIDR(financial.currentRentInvoiceAmount)} />
          <Value label="Pembayaran terverifikasi" value={formatIDR(financial.verifiedPaymentAmount)} />
          <Value label="Pembayaran menunggu konfirmasi" value={formatIDR(financial.pendingPaymentAmount)} />
          <Value label="Laporan transfer belum diperiksa (bukan pembayaran terverifikasi)" value={formatIDR(financial.pendingProofClaimedAmount)} />
          <Value label="Riwayat laporan bukti pembayaran" value={`${financial.paymentProofCount} laporan`} />
          <Value label="Tagihan terkait" value={`${review.invoiceCount} tagihan`} />
          <Value label="Kamar setelah pembatalan" value={`${room.number} · Kosong`} />
          <Value label="Penyelesaian keuangan" value={review.financialResolutionState === "pending_review" ? "Menunggu penyelesaian keuangan" : "Tidak ada riwayat transaksi"} />
        </dl>
        <p className="mt-5 text-sm text-muted-foreground">Periode sewa belum dimulai. Pembatalan tidak mencatat check-out, pengembalian dana atau penghapusan bukti.</p>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Alasan dan konfirmasi</CardTitle></CardHeader><CardContent className="space-y-5">
        <div className="space-y-2"><Label htmlFor="cancellation-reason">Alasan pembatalan <span className="text-destructive">*</span></Label>
          <Textarea id="cancellation-reason" value={reason} rows={4} maxLength={1000} disabled={locked} onChange={(event) => setReason(event.target.value)}
            aria-describedby="cancellation-reason-help" placeholder="Jelaskan kesalahan pencatatan penyewaan yang perlu dibatalkan." />
          <p id="cancellation-reason-help" className="text-sm text-muted-foreground">Wajib 3–1.000 karakter. Alasan, waktu dan Admin pencatat akan tersimpan di riwayat.</p></div>
        <div className="flex items-start gap-3"><Checkbox id="cancellation-confirmed" checked={confirmed} disabled={locked} onCheckedChange={(value) => setConfirmed(value === true)} />
          <Label htmlFor="cancellation-confirmed" className="leading-6">Saya memahami kamar akan dilepas dan penyewaan masuk arsip. Transaksi lama tidak dihapus atau dikembalikan otomatis.</Label></div>
        {policies.cancellation.requiresMistakenActivationConfirmation ? <div className="flex items-start gap-3"><Checkbox id="cancellation-activation-confirmed" checked={activationConfirmed} disabled={locked} onCheckedChange={(value) => setActivationConfirmed(value === true)} />
          <Label htmlFor="cancellation-activation-confirmed" className="leading-6">Aktivasi sebelumnya keliru. Penghuni belum pernah menerima atau menghuni kamar. Jika hunian benar-benar berlangsung, saya harus menggunakan check-out.</Label></div> : null}
      </CardContent></Card>
      <div className="flex flex-wrap justify-between gap-3 border-t pt-4">
        <Button variant="default" className="min-h-11" disabled={locked} onClick={onRefresh}><RefreshCw aria-hidden="true" />Perbarui tinjauan</Button>
        <Button variant="destructive" disabled={locked} onClick={requestConfirmation}>Batalkan dan arsipkan penyewaan</Button>
      </div>
      <ConfirmDialog open={confirmationOpen} onOpenChange={setConfirmationOpen} title="Batalkan penyewaan ini?" destructive pending={pending}
        description={`${lease.residentName} · ${lease.leaseCode} · Kamar ${room.number}. ${review.consequence}`} confirmLabel="Ya, batalkan dan arsipkan" onConfirm={submit} />
    </> : null}
  </div>;
}

function Value({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>;
}
