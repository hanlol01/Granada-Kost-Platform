// Hallmark · component: archive files · theme: incumbent KOSTATION
// States: default, hover, focus, active, disabled, loading, error, verified/partial success.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@granada-kost/api-client";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
import { LoadingState } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NoticeAlert } from "@/components/ui/notice-alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { adminErrorNotice, adminSupportReference, type AdminErrorNotice } from "@/lib/error-normalizer";
import { newIdempotencyKey } from "@/lib/idempotency";
import { leaseArchiveFileApi } from "@/lib/lease-archive-file-api";
import type {
  ArchiveFileInventory,
  ArchiveFilePurgeInput,
  ArchiveFileResult,
} from "@/lib/lease-archive-file-contract";
import { formatRecordedAt } from "@/lib/format";
import { LeaseRevisionContractError } from "@/lib/lease-revision-contract";
import { refreshLeaseRevisionProjections } from "@/lib/lease-revision-cache";

type Props = {
  archiveId: string;
  propertyId: string;
  leaseId: string;
  leaseCode: string;
  residentName: string;
  residentId: string;
  canManage: boolean;
};
const byteLabel = (value: number) =>
  value >= 1024 * 1024
    ? `${(value / (1024 * 1024)).toLocaleString("id-ID", { maximumFractionDigits: 2 })} MB`
    : value >= 1024
      ? `${(value / 1024).toLocaleString("id-ID", { maximumFractionDigits: 1 })} KB`
      : `${value} byte`;
const unknownOutcome = (error: unknown) =>
  !ApiError.isApiError(error) || error.status === 0 || error.status >= 500;
const toastNotice = (notice: AdminErrorNotice) =>
  toast.error(notice.title, { description: notice.description });

export function LeaseArchiveFilePanel(props: Props) {
  const { archiveId, propertyId } = props;
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [commandId, setCommandId] = useState<string | null>(null);
  const [saved, setSaved] = useState<ArchiveFileResult | undefined>();
  const [refreshIncomplete, setRefreshIncomplete] = useState(false);
  const refreshGeneration = useRef(0);
  const inventory = useQuery({
    queryKey: ["lease-archive-files", propertyId, archiveId],
    queryFn: ({ signal }) => leaseArchiveFileApi.inventory(archiveId, propertyId, signal),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const history = useQuery({
    queryKey: ["lease-archive-file-history", propertyId, archiveId, offset],
    queryFn: ({ signal }) => leaseArchiveFileApi.history(archiveId, propertyId, offset, signal),
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (inventory.error)
      toastNotice(adminErrorNotice(inventory.error, "Inventaris belum dapat dimuat"));
  }, [inventory.error]);
  useEffect(() => {
    if (history.error)
      toastNotice(adminErrorNotice(history.error, "Riwayat pengajuan belum dapat dimuat"));
  }, [history.error]);
  function committed(result: ArchiveFileResult) {
    setSaved(result);
    setCommandId(result.commandId);
    setOffset(0);
    setRefreshIncomplete(false);
    const generation = ++refreshGeneration.current;
    void refreshLeaseRevisionProjections(queryClient, {
      propertyId, leaseId: props.leaseId, residentId: props.residentId,
    }, result.items.map(item => item.fileId)).then(refreshed => {
      if (generation === refreshGeneration.current) setRefreshIncomplete(!refreshed);
    });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Berkas arsip penyewaan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {refreshIncomplete ? <NoticeAlert tone="warning" title="Hasil tersimpan, tetapi data belum diperbarui"
          description="Pengajuan dan hasil setiap berkas tetap tersimpan. Muat ulang halaman untuk memperbarui ketersediaan bukti pada pembayaran. Jangan buat pengajuan baru untuk berkas yang sama." /> : null}
        <p className="max-w-prose text-sm text-muted-foreground">
          Hanya unggahan milik penyewaan ini yang dapat dihapus. Data penghuni, penyewaan, transaksi
          dan riwayat tetap disimpan. Kuitansi yang dibuat dari catatan transaksi bukan berkas
          tersimpan di inventaris ini.
        </p>
        {inventory.error ? (
          <FileLoadError error={inventory.error} onRetry={() => void inventory.refetch()} />
        ) : null}
        {inventory.data ? (
          <FileSelection
            {...props}
            inventory={inventory.data}
            inventoryUnavailable={Boolean(inventory.error)}
            onRefresh={() => void inventory.refetch()}
            onCommitted={committed}
          />
        ) : inventory.isPending ? (
          <LoadingState />
        ) : null}
        <section className="space-y-4 border-t pt-6" aria-labelledby="archive-file-history-title">
          <h3 id="archive-file-history-title" className="text-lg font-semibold">
            Riwayat pengajuan penghapusan
          </h3>
          <p className="text-sm text-muted-foreground">
            Hasil tetap dapat diperiksa setelah halaman ditutup. Pengajuan yang belum selesai
            dilanjutkan dari sini, bukan diajukan sebagai penghapusan baru.
          </p>
          {history.isPending ? (
            <LoadingState />
          ) : history.error ? (
            <FileLoadError error={history.error} onRetry={() => void history.refetch()} />
          ) : history.data ? (
            <>
              {history.data.items.length === 0 ? (
                <p className="text-sm">Belum ada pengajuan penghapusan berkas.</p>
              ) : (
                <ol className="divide-y rounded-xl border">
                  {history.data.items.map((item) => (
                    <li
                      key={item.commandId}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="font-semibold">
                          {item.deletedCount} dari {item.selectedCount} berkas terverifikasi dihapus
                        </p>
                        <p className="text-sm">
                          {item.failedCount} gagal · {item.retryPendingCount} belum dapat dipastikan
                          · {byteLabel(item.freedBytes)} terverifikasi dibebaskan
                        </p>
                        <p className="break-words text-sm text-muted-foreground">
                          {formatRecordedAt(item.createdAt)} · {item.createdBy} · {item.reason}
                        </p>
                      </div>
                      <Button
                        variant="info"
                        onClick={() => {
                          setSaved(undefined);
                          setCommandId(item.commandId);
                        }}
                      >
                        Lihat hasil pengajuan
                      </Button>
                    </li>
                  ))}
                </ol>
              )}
              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  variant="outline"
                  disabled={offset === 0 || history.isFetching}
                  onClick={() => setOffset(Math.max(0, offset - 20))}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  disabled={offset + 20 >= history.data.total || history.isFetching}
                  onClick={() => setOffset(offset + 20)}
                >
                  Berikutnya
                </Button>
              </div>
            </>
          ) : null}
        </section>
        {commandId ? (
          <FileResult
            key={commandId}
            {...props}
            commandId={commandId}
            initialResult={saved?.commandId === commandId ? saved : undefined}
            onCommitted={committed}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function FileSelection({
  inventory,
  inventoryUnavailable,
  onRefresh,
  onCommitted,
  ...props
}: Props & {
  inventory: ArchiveFileInventory;
  inventoryUnavailable: boolean;
  onRefresh: () => void;
  onCommitted: (result: ArchiveFileResult) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState<AdminErrorNotice | null>(null);
  const busy = useRef(false);
  const intent = useRef<{ input: ArchiveFilePurgeInput; key: string } | null>(null);
  const focus = useRef("archive-file-error");
  const frozen = pending || uncertain || inventoryUnavailable;
  const eligible = inventory.items.filter((item) => item.selectable);
  const totalBytes = inventory.items
    .filter((item) => selected.includes(item.fileId))
    .reduce((sum, item) => sum + item.sizeBytes, 0);
  useEffect(() => {
    if (!busy.current && !intent.current) {
      setSelected([]);
      setConfirmed(false);
    }
  }, [inventory.reviewFingerprint]);
  useEffect(() => {
    if (notice) document.getElementById(focus.current)?.focus();
  }, [notice]);
  function validation(code: string, target: string) {
    focus.current = target;
    const value = adminErrorNotice(new ApiError({ status: 422, code, message: "" }));
    setNotice(value);
    toastNotice(value);
  }
  async function submit() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setDialog(false);
    setNotice(null);
    intent.current ??= {
      key: newIdempotencyKey(),
      input: {
        propertyId: props.propertyId,
        selectedFileIds: [...selected],
        reason: reason.trim(),
        reviewFingerprint: inventory.reviewFingerprint,
        permanentDeletionConfirmed: true,
      },
    };
    try {
      const result = await leaseArchiveFileApi.purge(
        props.archiveId,
        props.leaseId,
        intent.current.input,
        intent.current.key,
      );
      setUncertain(false);
      intent.current = null;
      setSelected([]);
      setConfirmed(false);
      reportOutcome(result);
      onCommitted(result);
    } catch (error) {
      const unknown = unknownOutcome(error);
      const value = adminErrorNotice(
        unknown
          ? new LeaseRevisionContractError("LEASE_FILE_PURGE_COMMIT_RESPONSE_INVALID", "")
          : error,
        undefined,
        error,
      );
      setUncertain(unknown);
      focus.current = "archive-file-error";
      setNotice(value);
      toastNotice(value);
      if (!unknown) intent.current = null;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function ask() {
    if (frozen || !props.canManage) return;
    if (!selected.length || selected.length > 100)
      return validation("LEASE_FILE_PURGE_SELECTION_INVALID", "archive-file-selection");
    if (reason.trim().length < 3)
      return validation("LEASE_FILE_PURGE_REASON_REQUIRED", "archive-file-reason");
    if (!confirmed)
      return validation("LEASE_FILE_PURGE_CONFIRMATION_REQUIRED", "archive-file-confirmation");
    setNotice(null);
    setDialog(true);
  }
  return (
    <div className="space-y-5" aria-busy={pending}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold">
          {inventory.items.length} berkas tercatat · {eligible.length} dapat dipilih
        </p>
        <Button variant="outline" disabled={pending || uncertain} onClick={onRefresh}>
          Perbarui inventaris
        </Button>
      </div>
      {inventoryUnavailable ? (
        <p className="text-sm font-semibold">
          Inventaris terakhir tetap ditampilkan. Perbarui inventaris sebelum membuat pengajuan baru;
          pengajuan yang belum pasti tetap memakai data awal.
        </p>
      ) : null}
      {notice ? (
        <NoticeAlert
          id="archive-file-error"
          tone="destructive"
          title={notice.title}
          description={notice.description}
          action={
            uncertain ? (
              <Button variant="info" disabled={pending} onClick={() => void submit()}>
                {pending ? "Memeriksa pengajuan…" : "Coba ulang pengajuan yang sama"}
              </Button>
            ) : null
          }
        />
      ) : null}
      {!inventory.coverageVerified ? (
        <NoticeAlert
          tone="warning"
          title="Hubungan berkas belum dapat diperiksa lengkap"
          description="Pilihan penghapusan dinonaktifkan. Minta Pihak Pengelola memeriksa pembaruan sistem sebelum melanjutkan."
        />
      ) : null}
      {inventory.items.length === 0 ? (
        <p className="text-sm">Tidak ada unggahan terkait penyewaan ini.</p>
      ) : (
        <fieldset
          id="archive-file-selection"
          tabIndex={-1}
          disabled={frozen || !props.canManage}
          className="space-y-3 rounded-xl border p-4"
        >
          <legend className="px-2 text-sm font-semibold">Inventaris berkas</legend>
          {eligible.length ? (
            <div className="flex items-center gap-3 border-b pb-3">
              <Checkbox
                id="archive-file-select-all"
                checked={selected.length === Math.min(eligible.length, 100)}
                onCheckedChange={(value) =>
                  setSelected(
                    value === true ? eligible.slice(0, 100).map((item) => item.fileId) : [],
                  )
                }
              />
              <Label htmlFor="archive-file-select-all" className="cursor-pointer py-2">
                Pilih semua berkas yang dapat dihapus
                {eligible.length > 100 ? " (maksimal 100 per pengajuan)" : ""}
              </Label>
            </div>
          ) : null}
          <ul className="divide-y">
            {inventory.items.map((item) => (
              <li key={item.fileId} className="flex gap-3 py-4 first:pt-1 last:pb-0">
                <Checkbox
                  id={`archive-file-${item.fileId}`}
                  disabled={!item.selectable}
                  checked={selected.includes(item.fileId)}
                  className="mt-1"
                  onCheckedChange={(value) =>
                    setSelected((previous) =>
                      value === true
                        ? [...previous, item.fileId]
                        : previous.filter((id) => id !== item.fileId),
                    )
                  }
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <Label
                    htmlFor={`archive-file-${item.fileId}`}
                    className="block break-all font-semibold leading-6"
                  >
                    {item.filename}
                  </Label>
                  <p className="text-sm">
                    {filePurposeLabel(item.filePurpose)} · {byteLabel(item.sizeBytes)}
                  </p>
                  {item.metadataRemoved && !item.claimCommandId ? (
                    <p className="text-sm font-semibold">
                      Berkas pernah dihapus dari tampilan. File fisiknya belum dipastikan terhapus;
                      pengajuan ini akan memeriksa sisa berkas tanpa membuatnya dapat diunduh
                      kembali.
                    </p>
                  ) : null}
                  {item.relationships.map((relation, index) => (
                    <p key={index} className="break-words text-sm text-muted-foreground">
                      {relation.relationship}
                      {relation.recordCode ? ` · ${relation.recordCode}` : ""}
                    </p>
                  ))}
                  {item.onlyDigitalEvidence ? (
                    <p className="text-sm font-semibold">
                      Satu-satunya bukti digital yang masih tersedia pada catatan terkait.
                    </p>
                  ) : null}
                  {!item.selectable ? (
                    <p className="text-sm text-muted-foreground">{item.message}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      {props.canManage && eligible.length > 0 ? (
        <>
          <p className="font-semibold tabular-nums" aria-live="polite">
            {selected.length} berkas dipilih · Perkiraan {byteLabel(totalBytes)}
          </p>
          <p className="max-w-prose text-sm text-muted-foreground">{inventory.capacityNote}</p>
          <div className="space-y-2">
            <Label htmlFor="archive-file-reason">
              Alasan penghapusan <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="archive-file-reason"
              rows={3}
              maxLength={1000}
              disabled={frozen}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby="archive-file-reason-help"
            />
            <p id="archive-file-reason-help" className="text-sm text-muted-foreground">
              Wajib 3–1.000 karakter. Jelaskan alasan bukti terpilih tidak lagi perlu disimpan.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="archive-file-confirmation"
              checked={confirmed}
              disabled={frozen}
              onCheckedChange={(value) => setConfirmed(value === true)}
            />
            <Label htmlFor="archive-file-confirmation" className="leading-6">
              Saya memahami bukti terpilih pada {props.leaseCode} tidak dapat dilihat, diunduh atau
              dikembalikan setelah dihapus permanen, termasuk saat penyewaan dipulihkan.
            </Label>
          </div>
          <Button variant="destructive" disabled={frozen} onClick={ask}>
            {pending ? "Memproses penghapusan…" : "Hapus berkas terpilih permanen"}
          </Button>
          <ConfirmDialog
            open={dialog}
            onOpenChange={setDialog}
            destructive
            pending={pending}
            title="Hapus bukti terpilih permanen?"
            description={`${props.residentName} · ${props.leaseCode}. ${selected.length} berkas, perkiraan ${byteLabel(totalBytes)}. Bukti tidak dapat dipulihkan. Data penyewaan, transaksi dan riwayat tetap disimpan. Setiap berkas akan diperiksa dan hasilnya dilaporkan terpisah.`}
            confirmLabel={`Ya, hapus ${selected.length} berkas`}
            onConfirm={submit}
          />
        </>
      ) : null}
    </div>
  );
}

function FileResult({
  commandId,
  initialResult,
  onCommitted,
  ...props
}: Props & {
  commandId: string;
  initialResult?: ArchiveFileResult;
  onCommitted: (result: ArchiveFileResult) => void;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<AdminErrorNotice | null>(null);
  const [retryUncertain, setRetryUncertain] = useState(false);
  const busy = useRef(false);
  const query = useQuery({
    queryKey: ["lease-archive-file-result", props.propertyId, props.archiveId, commandId],
    queryFn: ({ signal }) =>
      leaseArchiveFileApi.result(
        props.archiveId,
        props.leaseId,
        commandId,
        props.propertyId,
        signal,
      ),
    initialData: initialResult,
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (query.error) toastNotice(adminErrorNotice(query.error));
  }, [query.error]);
  useEffect(() => {
    if (notice) document.getElementById("archive-file-result-error")?.focus();
  }, [notice]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const heading = document.getElementById("archive-file-result-title");
      heading?.scrollIntoView({ block: "nearest" });
      heading?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [initialResult]);
  async function retry() {
    if (busy.current) return;
    if (!selected.length) {
      const value = adminErrorNotice(
        new ApiError({
          status: 422,
          code: "LEASE_FILE_PURGE_RETRY_SELECTION_INVALID",
          message: "",
        }),
      );
      setNotice(value);
      toastNotice(value);
      return;
    }
    busy.current = true;
    setPending(true);
    setNotice(null);
    try {
      const result = await leaseArchiveFileApi.retry(
        props.archiveId,
        props.leaseId,
        commandId,
        props.propertyId,
        selected,
      );
      queryClient.setQueryData(
        ["lease-archive-file-result", props.propertyId, props.archiveId, commandId],
        result,
      );
      setSelected([]);
      setRetryUncertain(false);
      reportOutcome(result);
      onCommitted(result);
    } catch (error) {
      const value = unknownOutcome(error)
        ? {
            title: "Hasil coba ulang belum dapat dipastikan",
            description:
              "Perbarui hasil pengajuan ini sebelum melanjutkan. Jangan membuat pengajuan baru; berkas yang sudah dihapus tidak diproses lagi." + adminSupportReference(error),
            code: "LEASE_FILE_PURGE_COMMIT_RESPONSE_INVALID",
            kind: "network" as const,
          }
        : adminErrorNotice(error);
      setRetryUncertain(unknownOutcome(error));
      setNotice(value);
      toastNotice(value);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const value = query.data;
  return (
    <section
      className="space-y-4 border-t pt-6"
      aria-labelledby="archive-file-result-title"
      aria-busy={pending}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="archive-file-result-title" tabIndex={-1} className="text-lg font-semibold">
          Hasil pengajuan berkas
        </h3>
        <Button
          variant="outline"
          disabled={pending || query.isFetching}
          onClick={() => {
            setSelected([]);
            void query.refetch().then((result) => {
              if (!result.error) {
                setRetryUncertain(false);
                setNotice(null);
              }
            });
          }}
        >
          Perbarui hasil
        </Button>
      </div>
      {notice ? (
        <NoticeAlert
          id="archive-file-result-error"
          tone="destructive"
          title={notice.title}
          description={notice.description}
        />
      ) : null}
      {query.error ? (
        <FileLoadError error={query.error} onRetry={() => void query.refetch()} />
      ) : null}
      {query.error && value ? (
        <p className="text-sm font-semibold">
          Hasil pemeriksaan terakhir ditampilkan. Perbarui hasil sebelum mencoba ulang berkas.
        </p>
      ) : null}
      {value ? (
        <>
          <NoticeAlert
            tone={value.deletedCount === value.selectedCount ? "success" : "warning"}
            title={`${value.deletedCount} dari ${value.selectedCount} berkas terverifikasi dihapus`}
            description={`${value.failedCount} gagal · ${value.retryPendingCount} belum dapat dipastikan. Ruang terverifikasi dibebaskan: ${byteLabel(value.freedBytes)}. Berkas yang telah dihapus tidak dapat dipulihkan.`}
          />
          <p className="break-words text-sm">
            Diajukan {formatRecordedAt(value.createdAt)} oleh {value.createdBy}. Alasan:{" "}
            {value.reason}
          </p>
          <ul className="divide-y rounded-xl border">
            {value.items.map((item) => (
              <li key={item.fileId} className="flex gap-3 p-4">
                {props.canManage && item.status !== "deleted" ? (
                  <Checkbox
                    id={`archive-file-retry-${item.fileId}`}
                    className="mt-1"
                    disabled={pending || query.isFetching || retryUncertain}
                    checked={selected.includes(item.fileId)}
                    onCheckedChange={(checked) =>
                      setSelected((previous) =>
                        checked === true
                          ? [...previous, item.fileId]
                          : previous.filter((id) => id !== item.fileId),
                      )
                    }
                    aria-label={`Coba ulang ${item.filename}`}
                  />
                ) : null}
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="break-all font-semibold">{item.filename}</p>
                  <StatusBadge
                    tone={
                      item.status === "deleted"
                        ? "success"
                        : item.status === "failed"
                          ? "danger"
                          : "warning"
                    }
                    label={
                      item.status === "deleted"
                        ? "Dihapus permanen"
                        : item.status === "failed"
                          ? "Gagal dihapus"
                          : "Belum dapat dipastikan"
                    }
                  />
                  <p className="max-w-prose text-sm">{item.message}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.availability === "absent"
                      ? `Tidak tersedia · ${byteLabel(item.freedBytes)} terverifikasi dibebaskan`
                      : item.availability === "present"
                        ? "Pada pemeriksaan terakhir, berkas masih terdeteksi di penyimpanan; tidak dapat diunduh selama pengajuan berlangsung."
                        : "Keadaan berkas belum pasti; jangan menganggap berkas masih ada atau sudah terhapus."}
                  </p>
                  {item.verifiedDeletedAt ? (
                    <p className="text-sm">
                      Penghapusan terverifikasi {formatRecordedAt(item.verifiedDeletedAt)}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {props.canManage && value.deletedCount < value.selectedCount ? (
            <Button
              variant="info"
              disabled={pending || query.isFetching || !!query.error || retryUncertain}
              onClick={() => void retry()}
            >
              {pending ? "Memeriksa berkas…" : "Coba ulang berkas terpilih"}
            </Button>
          ) : null}
        </>
      ) : query.isPending ? (
        <LoadingState />
      ) : null}
    </section>
  );
}

function FileLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const notice = adminErrorNotice(error);
  return (
    <NoticeAlert
      tone="destructive"
      title={notice.title}
      description={notice.description}
      action={
        <Button variant="info" onClick={onRetry}>
          Coba lagi
        </Button>
      }
    />
  );
}
function filePurposeLabel(purpose: string) {
  return (
    (
      {
        payment_proof: "Bukti pembayaran",
        lease_revision_evidence: "Bukti koreksi penyewaan",
        ktp: "Identitas penghuni",
        profile_photo: "Foto profil",
      } as Record<string, string>
    )[purpose] ?? "Berkas terkait"
  );
}
function reportOutcome(result: ArchiveFileResult) {
  const description = `${result.failedCount} gagal · ${result.retryPendingCount} belum dapat dipastikan. Periksa hasil tiap berkas. Berkas yang dihapus tidak dapat dipulihkan.`;
  if (result.deletedCount === result.selectedCount)
    toast.success(`${result.deletedCount} berkas dihapus permanen`, { description });
  else
    toast.warning(
      `${result.deletedCount} dari ${result.selectedCount} berkas terverifikasi dihapus`,
      { description },
    );
}
