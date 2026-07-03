import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Hammer,
  Info,
  Loader2,
  MessageCircle,
  Plus,
  Wrench,
  X,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { FilePickerButton } from "@/components/file/FilePickerButton";
import { FilePreview } from "@/components/file/FilePreview";
import { FilePreviewModal } from "@/components/file/FilePreviewModal";
import { FileUploadProgress } from "@/components/file/FileUploadProgress";
import { WhatsAppFallbackButton } from "@/components/file/WhatsAppFallbackButton";
import { LoadingState, EmptyState, ErrorState } from "@/components/state";
import { useFileUpload } from "@/hooks/useFileUpload";
import {
  useCreateMyComplaint,
  useMyComplaintCategories,
  useMyComplaints,
  type MyComplaintPriority,
  type MyComplaintRecord,
  type MyComplaintStatus,
} from "@/hooks/usePenghuniComplaints";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { isChatEnabled } from "@/lib/features";
import {
  FILE_PURPOSE_POLICIES,
  type FileResponse,
  type FileValidationResult,
} from "@granada-kost/domain";

export const Route = createFileRoute("/_app/complaints")({
  component: ComplaintsPage,
});

type FilePickerValidationError = Extract<FileValidationResult, { valid: false }>;

const MAX_COMPLAINT_ATTACHMENTS = FILE_PURPOSE_POLICIES.complaint_attachment.maxFilesPerEntity;

function ComplaintsPage() {
  const complaints = useMyComplaints({ limit: 50 });
  const [showCreate, setShowCreate] = useState(false);
  const chatEnabled = isChatEnabled();

  return (
    <>
      <AppHeader title="Komplain & Maintenance" subtitle="Laporan & tiket Anda" />
      <div className="flex flex-col gap-4 px-5 py-5 animate-[fade-in_0.4s_ease-out]">
        <div className="flex items-start gap-3 rounded-2xl bg-accent p-4 text-xs text-primary">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">Buat tiket komplain langsung dari aplikasi</p>
            <p className="mt-0.5">
              Komplain Anda akan diperiksa dan ditangani oleh pengelola/admin. Lampiran foto
              bersifat opsional dan dapat membantu memperjelas laporan.
            </p>
          </div>
        </div>

        <ChatSupportAction enabled={chatEnabled} />

        <div>
          <p className="text-sm font-semibold">Riwayat Tiket</p>
          <div className="mt-3 flex flex-col gap-2">
            {complaints.isLoading ? (
              <LoadingState label="Memuat tiket..." />
            ) : complaints.isError ? (
              <ErrorState error={complaints.error} onRetry={() => void complaints.refetch()} />
            ) : (complaints.data ?? []).length === 0 ? (
              <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
                <EmptyState
                  title="Belum ada tiket"
                  description="Saat Anda mengajukan komplain, riwayatnya akan tampil di sini."
                  icon={<Wrench className="h-5 w-5" />}
                />
              </div>
            ) : (
              complaints.data!.map((c) => <ComplaintRow key={c.id} complaint={c} />)
            )}
          </div>
        </div>
      </div>

      <button
        onClick={() => setShowCreate(true)}
        className="fixed bottom-24 right-1/2 z-30 flex h-14 w-14 translate-x-[calc(50%+150px)] items-center justify-center rounded-full bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-glow)] transition active:scale-95"
        aria-label="Buat tiket baru"
      >
        <Plus className="h-6 w-6" />
      </button>

      {showCreate && <CreateComplaintSheet onClose={() => setShowCreate(false)} />}
    </>
  );
}

function ChatSupportAction({ enabled }: { enabled: boolean }) {
  if (!enabled) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-4 text-sm shadow-[var(--shadow-soft)]">
        <span className="inline-flex items-center gap-2 font-medium text-muted-foreground">
          <MessageCircle className="h-4 w-4" /> Chat dengan admin belum tersedia
        </span>
        <p className="mt-1 text-xs text-muted-foreground">
          VITE_FEATURE_CHAT_ENABLED=false. Gunakan tombol + untuk membuat tiket komplain baru.
        </p>
      </div>
    );
  }

  return (
    <Link
      to="/chat"
      className="flex items-center justify-between rounded-2xl bg-card p-4 text-sm font-medium shadow-[var(--shadow-soft)]"
    >
      <span className="inline-flex items-center gap-2 text-primary">
        <MessageCircle className="h-4 w-4" /> Chat dengan admin
      </span>
      <span className="text-xs text-muted-foreground">Buka</span>
    </Link>
  );
}

function ComplaintRow({ complaint }: { complaint: MyComplaintRecord }) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-primary">
          <Hammer className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold">{complaint.title}</p>
            <ComplaintStatusBadge status={complaint.complaintStatus} />
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {complaint.description}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{complaint.complaintCode}</span>
            <span>{formatDate(complaint.submittedAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComplaintStatusBadge({ status }: { status: MyComplaintStatus }) {
  const map: Record<
    MyComplaintStatus,
    { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }
  > = {
    submitted: { label: "Menunggu", cls: "bg-warning/20 text-warning-foreground", icon: Clock },
    acknowledged: { label: "Diterima", cls: "bg-primary/15 text-primary", icon: Clock },
    in_progress: { label: "Diproses", cls: "bg-primary/15 text-primary", icon: Loader2 },
    on_hold: { label: "Ditunda", cls: "bg-secondary text-foreground", icon: Clock },
    escalated: { label: "Dieskalasi", cls: "bg-destructive/15 text-destructive", icon: Clock },
    resolved: { label: "Selesai", cls: "bg-success/15 text-success", icon: CheckCircle2 },
    reopened: { label: "Dibuka Ulang", cls: "bg-warning/20 text-warning-foreground", icon: Clock },
    closed: { label: "Ditutup", cls: "bg-secondary text-foreground", icon: CheckCircle2 },
    cancelled: { label: "Dibatalkan", cls: "bg-secondary text-foreground", icon: X },
  };
  const s = map[status];
  const Icon = s.icon;
  return (
    <span
      className={
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold " +
        s.cls
      }
    >
      <Icon className="h-3 w-3" /> {s.label}
    </span>
  );
}

function priorityLabel(priority: MyComplaintPriority): string {
  switch (priority) {
    case "low":
      return "Rendah";
    case "medium":
      return "Sedang";
    case "high":
      return "Tinggi";
    case "urgent":
      return "Mendesak";
  }
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return "Terjadi kendala. Coba lagi atau hubungi admin.";
}

// ---------------------------------------------------------------------------
// Create complaint bottom sheet (M12D)
// ---------------------------------------------------------------------------

function CreateComplaintSheet({ onClose }: { onClose: () => void }) {
  const categoriesQuery = useMyComplaintCategories();
  const createComplaint = useCreateMyComplaint();

  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationMode, setLocationMode] = useState<"room" | "other">("room");
  const [locationNote, setLocationNote] = useState("");
  const [attachments, setAttachments] = useState<FileResponse[]>([]);
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);
  const [pickerError, setPickerError] = useState<FilePickerValidationError | null>(null);
  const [attachLimitError, setAttachLimitError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileResponse | null>(null);
  const [created, setCreated] = useState<MyComplaintRecord | null>(null);

  const upload = useFileUpload();

  const categories = categoriesQuery.data ?? [];
  // Penghuni has no property switcher (ADR-FE-005); property scope is derived
  // from the resident-scoped category list returned by the backend.
  const propertyId = categories[0]?.propertyId ?? null;
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId],
  );

  const isUploading = uploadingNames.length > 0 || upload.isUploading;
  const remainingSlots = MAX_COMPLAINT_ATTACHMENTS - attachments.length;
  const isBusy = isUploading || createComplaint.isPending;

  const canSubmit =
    Boolean(categoryId) &&
    title.trim().length >= 3 &&
    description.trim().length >= 5 &&
    (locationMode === "room" || locationNote.trim().length > 0) &&
    !isBusy &&
    !created;

  const showWhatsAppFallback =
    pickerError?.code === "CLIENT_FILE_TOO_LARGE" ||
    Boolean(upload.uploadError) ||
    createComplaint.isError;

  async function handleFilesSelected(files: File[]) {
    setAttachLimitError(null);
    setPickerError(null);
    if (!propertyId) return;

    if (files.length > remainingSlots) {
      setAttachLimitError(
        `Maksimum ${MAX_COMPLAINT_ATTACHMENTS} foto per komplain. Slot tersisa: ${remainingSlots}.`,
      );
      return;
    }

    // Upload sequentially. Each successful upload is appended so a later
    // failure never discards already-uploaded file IDs.
    for (const file of files) {
      setUploadingNames((prev) => [...prev, file.name]);
      try {
        const uploaded = await upload.uploadAsync({
          file,
          propertyId,
          filePurpose: "complaint_attachment",
        });
        setAttachments((prev) => [...prev, uploaded]);
      } catch {
        // Toast + inline error + WhatsApp fallback handled via hook state.
      } finally {
        setUploadingNames((prev) => {
          const idx = prev.indexOf(file.name);
          if (idx === -1) return prev;
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        });
      }
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    try {
      const record = await createComplaint.mutateAsync({
        category_id: categoryId,
        title: title.trim(),
        description: description.trim(),
        // Backend contract: location_note WITHOUT room_id creates a
        // property-level report; omitting both defaults to the resident's room.
        location_note: locationMode === "other" ? locationNote.trim() : undefined,
        file_ids: attachments.length > 0 ? attachments.map((f) => f.id) : undefined,
      });
      setCreated(record);
      // Clear the form only after confirmed success.
      setCategoryId("");
      setTitle("");
      setDescription("");
      setLocationMode("room");
      setLocationNote("");
      setAttachments([]);
      setAttachLimitError(null);
      setPickerError(null);
      upload.reset();
    } catch {
      // Keep uploaded attachment previews visible so the resident can retry
      // the submit without re-uploading. Do not fake success.
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-auto max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 animate-[slide-up_0.35s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold">Buat Tiket Baru</p>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {created ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-success/40 bg-success/10 p-4 text-xs">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Tiket berhasil dibuat</p>
                  <p className="mt-0.5 text-muted-foreground">
                    Kode tiket:{" "}
                    <span className="font-semibold text-foreground">{created.complaintCode}</span>.
                    Komplain Anda akan diperiksa dan ditangani oleh pengelola/admin. Pantau
                    statusnya di Riwayat Tiket.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setCreated(null);
                  createComplaint.reset();
                }}
                className="h-10 flex-1 rounded-xl border border-border bg-background text-xs font-semibold text-foreground"
              >
                Buat tiket lain
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-10 flex-1 rounded-xl bg-primary text-xs font-semibold text-primary-foreground"
              >
                Tutup
              </button>
            </div>
          </div>
        ) : categoriesQuery.isLoading ? (
          <div className="mt-4">
            <LoadingState label="Memuat kategori komplain..." />
          </div>
        ) : categoriesQuery.isError ? (
          <div className="mt-4">
            <ErrorState
              error={categoriesQuery.error}
              onRetry={() => void categoriesQuery.refetch()}
              title="Gagal memuat kategori komplain"
            />
          </div>
        ) : categories.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-secondary/60 p-4 text-xs text-muted-foreground">
            <p className="text-sm font-semibold text-foreground">
              Kategori komplain belum tersedia
            </p>
            <p className="mt-1">
              Pengelola belum mengonfigurasi kategori komplain untuk properti Anda. Silakan hubungi
              admin kos secara langsung.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Komplain akan diperiksa dan ditangani oleh pengelola/admin. Lampiran foto bersifat
              opsional, namun foto dapat membantu memperjelas laporan.
            </p>

            <label className="block">
              <span className="text-xs font-medium text-foreground">Kategori</span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={isBusy}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">Pilih kategori...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              {selectedCategory ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Prioritas awal: {priorityLabel(selectedCategory.defaultPriority)} (ditentukan dari
                  kategori).
                </p>
              ) : null}
            </label>

            <label className="block">
              <span className="text-xs font-medium text-foreground">Judul</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isBusy}
                maxLength={200}
                placeholder="Contoh: AC kamar bocor"
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-foreground">Deskripsi</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isBusy}
                rows={4}
                maxLength={5000}
                placeholder="Jelaskan masalahnya: apa yang terjadi, sejak kapan, dan seberapa sering."
                className="mt-1 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
              />
            </label>

            <div>
              <span className="text-xs font-medium text-foreground">Lokasi masalah</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setLocationMode("room")}
                  className={
                    "h-10 rounded-xl border text-xs font-semibold transition " +
                    (locationMode === "room"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground")
                  }
                >
                  Kamar saya
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setLocationMode("other")}
                  className={
                    "h-10 rounded-xl border text-xs font-semibold transition " +
                    (locationMode === "other"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground")
                  }
                >
                  Area umum / lainnya
                </button>
              </div>
              {locationMode === "other" ? (
                <input
                  type="text"
                  value={locationNote}
                  onChange={(e) => setLocationNote(e.target.value)}
                  disabled={isBusy}
                  maxLength={500}
                  placeholder="Contoh: Dapur bersama lantai 2"
                  className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                />
              ) : null}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {locationMode === "room"
                  ? "Tiket akan terhubung dengan kamar Anda."
                  : "Sebutkan lokasi area umum agar pengelola mudah menemukan masalahnya."}
              </p>
            </div>

            <div>
              <span className="text-xs font-medium text-foreground">Lampiran foto (opsional)</span>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Maksimum {MAX_COMPLAINT_ATTACHMENTS} foto (JPEG/PNG, maks. 2 MB per foto). Foto
                dapat membantu memperjelas laporan.
              </p>

              {attachments.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-3">
                  {attachments.map((file) => (
                    <div key={file.id} className="relative">
                      <FilePreview file={file} size={64} onClick={() => setPreviewFile(file)} />
                      <button
                        type="button"
                        onClick={() =>
                          setAttachments((prev) => prev.filter((f) => f.id !== file.id))
                        }
                        disabled={createComplaint.isPending}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
                        aria-label={`Hapus lampiran ${file.original_filename}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {uploadingNames.map((name, i) => (
                <FileUploadProgress key={`${name}-${i}`} filename={name} className="mt-2" />
              ))}

              <FilePickerButton
                filePurpose="complaint_attachment"
                multiple
                capture="environment"
                disabled={!propertyId || remainingSlots <= 0 || isBusy || Boolean(created)}
                onFilesSelected={(files) => void handleFilesSelected(files)}
                onValidationError={(result) =>
                  setPickerError(result && result.valid === false ? result : null)
                }
                className="mt-2"
              />

              {remainingSlots <= 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Jumlah maksimum lampiran tercapai. Hapus salah satu foto untuk mengganti.
                </p>
              ) : null}
            </div>

            {attachLimitError ? <InlineError message={attachLimitError} /> : null}
            {upload.uploadError ? <InlineError message={errorMessage(upload.uploadError)} /> : null}
            {createComplaint.isError ? (
              <InlineError message={errorMessage(createComplaint.error)} />
            ) : null}

            {showWhatsAppFallback ? (
              <div className="rounded-xl border border-dashed border-green-600/40 bg-green-50 p-3 text-xs text-green-900">
                <p className="mb-2 font-medium">
                  Jika upload atau pengiriman tiket terus gagal, atau file terlalu besar, laporkan
                  komplain ke admin via WhatsApp.
                </p>
                <WhatsAppFallbackButton
                  context="laporan komplain beserta fotonya"
                  adminPhone={env.VITE_ADMIN_WHATSAPP_PHONE}
                  className="w-full"
                />
              </div>
            ) : null}

            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
              className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[image:var(--gradient-primary)] text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:bg-none disabled:bg-secondary disabled:text-muted-foreground"
            >
              {createComplaint.isPending
                ? "Mengirim tiket..."
                : isUploading
                  ? "Menunggu upload selesai..."
                  : "Kirim Tiket"}
            </button>
          </div>
        )}

        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      </div>
    </div>
  );
}
