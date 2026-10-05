import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@granada-kost/api-client";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NoticeAlert } from "@/components/ui/notice-alert";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState } from "@/components/state";
import { adminErrorNotice, type AdminErrorNotice } from "@/lib/error-normalizer";
import { newIdempotencyKey } from "@/lib/idempotency";
import { leaseArchiveApi } from "@/lib/lease-archive-api";
import type { LeaseRestorationInput, LeaseRestorationResult, LeaseRestorationReview } from "@/lib/lease-archive-contract";
import { LeaseRevisionContractError } from "@/lib/lease-revision-contract";
import { refreshLeaseRevisionProjections } from "@/lib/lease-revision-cache";

export function LeaseArchiveRestorePanel({ archiveId, propertyId }: { archiveId: string; propertyId: string }) {
  const [opened, setOpened] = useState(false);
  const review = useQuery({ queryKey: ["lease-archive-restoration-preview", propertyId, archiveId],
    queryFn: ({ signal }) => leaseArchiveApi.restorationPreview(archiveId, propertyId, signal),
    enabled: opened, retry: false, refetchOnWindowFocus: false });
  const loadNotice = review.error ? adminErrorNotice(review.error, "Pemulihan belum dapat ditinjau") : null;
  useEffect(() => { if (review.error) { const value = adminErrorNotice(review.error); toast.error(value.title, { description: value.description }); } }, [review.error]);
  return <Card><CardHeader><CardTitle>Perbaiki dari arsip</CardTitle></CardHeader><CardContent className="space-y-5">
    {!opened ? <><p className="text-sm text-muted-foreground">Sistem memeriksa kamar, penghuni, periode, tarif dan riwayat pembayaran sebelum menawarkan pemulihan.</p>
      <Button variant="info" onClick={() => setOpened(true)}>Tinjau pemulihan penyewaan</Button></>
      : review.isPending ? <LoadingState /> : loadNotice && !review.data ? <NoticeAlert tone="destructive" title={loadNotice.title} description={loadNotice.description}
        action={<Button variant="info" onClick={() => void review.refetch()}>Coba lagi</Button>} />
      : review.data ? <>
        {loadNotice ? <NoticeAlert tone="warning" title="Tinjauan belum dapat diperbarui" description={loadNotice.description}
          action={<Button variant="info" onClick={() => void review.refetch()}>Perbarui tinjauan</Button>} /> : null}
        <RestorationReview key={`${propertyId}:${archiveId}`} review={review.data} onRefresh={() => void review.refetch()} />
      </> : null}
  </CardContent></Card>;
}

function RestorationReview({ review, onRefresh }: { review: LeaseRestorationReview; onRefresh: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState<AdminErrorNotice | null>(null);
  const [result, setResult] = useState<LeaseRestorationResult | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const pendingRef = useRef(false);
  const intent = useRef<{ input: LeaseRestorationInput; key: string } | null>(null);
  const focusTarget = useRef("archive-restore-error");
  useEffect(() => { if (notice) document.getElementById(focusTarget.current)?.focus(); }, [notice]);
  const { lease, room } = review.originalContext;
  const locked = pending || uncertain || !!result;
  const denial = !review.decision.allowed && review.decision.code ? adminErrorNotice(new ApiError({ status: 409, code: review.decision.code, message: "" })) : null;
  function ask() {
    if (reason.trim().length < 3 || !confirmed) {
      focusTarget.current = reason.trim().length < 3 ? "archive-restore-reason" : "archive-restore-confirmed";
      const value = adminErrorNotice(new ApiError({ status: 422, code: reason.trim().length < 3 ? "LEASE_ARCHIVE_RESTORE_REASON_REQUIRED" : "LEASE_ARCHIVE_RESTORE_CONFIRMATION_REQUIRED", message: "" }));
      setNotice(value); toast.error(value.title, { description: value.description }); return;
    }
    setNotice(null); setConfirmationOpen(true);
  }
  async function submit() {
    if (pendingRef.current || result) return;
    pendingRef.current = true; setPending(true); setNotice(null); setConfirmationOpen(false);
    intent.current ??= { key: newIdempotencyKey(), input: { propertyId: review.propertyId,
      reason: reason.trim(), reviewFingerprint: review.reviewFingerprint, restorationConfirmed: true } };
    try {
      const saved = await leaseArchiveApi.restore(review.archiveId, lease.id, intent.current.input, intent.current.key);
      setResult(saved); setUncertain(false);
      toast.success("Penyewaan dipulihkan", { description: `Kamar ${saved.roomNumber} kembali terikat pada penyewaan. Check-in fisik belum dicatat.` });
      setRefreshFailed(!await refreshLeaseRevisionProjections(queryClient, { propertyId: review.propertyId, leaseId: lease.id, residentId: lease.residentId }));
    } catch (error) {
      const unknown = !ApiError.isApiError(error) || error.status === 0 || error.status >= 500;
      const value = adminErrorNotice(unknown ? new LeaseRevisionContractError("LEASE_ARCHIVE_RESTORE_COMMIT_RESPONSE_INVALID", "") : error, undefined, error);
      setUncertain(unknown); focusTarget.current = "archive-restore-error"; setNotice(value);
      if (!unknown) intent.current = null;
      toast.error(value.title, { description: value.description });
    } finally { pendingRef.current = false; setPending(false); }
  }
  if (denial) return <div className="space-y-4"><NoticeAlert tone="warning" title={denial.title} description={denial.description} />
    {review.decision.recommendedAction === "linked_successor" ? <Button variant="info" asChild><Link to="/tenants" search={{ flow: "new-lease", sourceArchiveId: review.archiveId }}>Siapkan penyewaan pengganti</Link></Button> : null}
    <Button variant="outline" onClick={onRefresh}>Perbarui tinjauan</Button></div>;
  return <div className="space-y-5">
    {result ? <NoticeAlert tone="success" title="Penyewaan dipulihkan" description={`Kamar ${result.roomNumber} kembali ${result.roomStatus === "reserved" ? "dipesan" : "menunggu check-in"}. Tidak ada check-in fisik yang dibuat. ${refreshFailed ? "Daftar belum dapat diperbarui; muat ulang, bukan mengajukan pemulihan baru." : "Riwayat pembatalan dan pemulihan tetap tersedia."}`}
      action={<Button variant="info" asChild><Link to="/tenants/correction/$leaseId" params={{ leaseId: lease.id }}>Lanjutkan koreksi data</Link></Button>} /> : null}
    {notice ? <NoticeAlert id="archive-restore-error" tone="destructive" title={notice.title} description={notice.description}
      action={uncertain ? <Button variant="info" disabled={pending} onClick={() => void submit()}>Coba ulang pengajuan yang sama</Button> : <Button variant="info" onClick={onRefresh}>Perbarui tinjauan</Button>} /> : null}
    {!result ? <><NoticeAlert tone="info" title="Pemulihan langsung tersedia" description={review.consequence} />
      <p className="font-semibold">{lease.residentName} · {lease.leaseCode} · Kamar {room.number}</p>
      <div className="space-y-2"><Label htmlFor="archive-restore-reason">Alasan pemulihan <span className="text-destructive">*</span></Label>
        <Textarea id="archive-restore-reason" rows={4} maxLength={1000} value={reason} disabled={locked} onChange={event => setReason(event.target.value)} aria-describedby="archive-restore-reason-help" />
        <p id="archive-restore-reason-help" className="text-sm text-muted-foreground">Wajib 3–1.000 karakter. Jelaskan pembatalan sebelumnya keliru.</p></div>
      <div className="flex items-start gap-3"><Checkbox id="archive-restore-confirmed" checked={confirmed} disabled={locked} onCheckedChange={value => setConfirmed(value === true)} />
        <Label htmlFor="archive-restore-confirmed" className="leading-6">Saya memahami kamar akan terikat kembali pada penyewaan, tanpa membuat check-in fisik. Berkas yang dihapus permanen tidak dapat dikembalikan.</Label></div>
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={locked} onClick={onRefresh}>Perbarui tinjauan</Button><Button variant="info" disabled={locked} onClick={ask}>Pulihkan penyewaan</Button></div>
      <ConfirmDialog open={confirmationOpen} onOpenChange={setConfirmationOpen} title="Pulihkan penyewaan ini?" pending={pending}
        description={`${lease.residentName} · ${lease.leaseCode} · Kamar ${room.number}. ${review.consequence}`} confirmLabel="Ya, pulihkan penyewaan" onConfirm={submit} />
    </> : null}
  </div>;
}
