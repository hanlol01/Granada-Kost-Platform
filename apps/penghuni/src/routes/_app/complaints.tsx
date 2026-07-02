import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
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
import { LoadingState, EmptyState, ErrorState } from "@/components/state";
import {
  useMyComplaints,
  type MyComplaintRecord,
  type MyComplaintStatus,
} from "@/hooks/usePenghuniComplaints";
import { formatDate } from "@/lib/format";
import { isChatEnabled } from "@/lib/features";

export const Route = createFileRoute("/_app/complaints")({
  component: ComplaintsPage,
});

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
            <p className="font-semibold">Buat tiket baru tersedia di milestone berikutnya</p>
            <p className="mt-0.5">
              Untuk saat ini, hubungi admin secara langsung. Riwayat tiket Anda tetap muncul di
              bawah.
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

      {showCreate && <CreateComplaintGate onClose={() => setShowCreate(false)} />}
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
          VITE_FEATURE_CHAT_ENABLED=false. Untuk komplain baru, hubungi admin secara langsung.
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

function CreateComplaintGate({ onClose }: { onClose: () => void }) {
  const chatEnabled = isChatEnabled();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-auto w-full max-w-md rounded-t-3xl bg-card p-5 animate-[slide-up_0.35s_ease-out]"
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
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-secondary/60 p-4 text-xs text-muted-foreground">
          <p className="text-sm font-semibold text-foreground">
            Pengajuan dari aplikasi belum aktif
          </p>
          <p className="mt-1">
            Backend memerlukan daftar kategori komplain yang khusus untuk Penghuni. Endpoint
            tersebut belum tersedia di Phase 1, sehingga pengajuan dari aplikasi tidak dapat
            divalidasi dengan aman. Sementara ini, silakan hubungi admin melalui kontak kos.
          </p>
        </div>
        {chatEnabled ? (
          <Link
            to="/chat"
            onClick={onClose}
            className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-[image:var(--gradient-primary)] text-sm font-semibold text-primary-foreground active:scale-[0.98]"
          >
            <MessageCircle className="h-4 w-4" /> Hubungi admin
          </Link>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-secondary p-3 text-center text-xs text-muted-foreground">
            Chat belum aktif. Silakan hubungi admin melalui kontak kos yang tersedia.
          </div>
        )}
      </div>
    </div>
  );
}
