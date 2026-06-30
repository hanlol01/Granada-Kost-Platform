import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { complaints, complaintCategories } from "@/lib/dummy-data";
import {
  Plus,
  Snowflake,
  Droplet,
  Wifi,
  Zap,
  Sparkles as SparkleIcon,
  Hammer,
  ImagePlus,
  Send,
  X,
  Clock,
  Loader2,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/_app/complaints")({
  component: ComplaintsPage,
});

const catIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  AC: Snowflake,
  Air: Droplet,
  Internet: Wifi,
  Listrik: Zap,
  Kebersihan: SparkleIcon,
  "Kerusakan kamar": Hammer,
};

function ComplaintsPage() {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<string>("AC");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setOpen(false);
    setSubmitted(false);
    setTitle("");
    setDesc("");
  };

  return (
    <>
      <AppHeader title="Komplain & Maintenance" subtitle="Laporan & tiket Anda" />
      <div className="flex flex-col gap-4 px-5 py-5 animate-[fade-in_0.4s_ease-out]">
        <div className="grid grid-cols-3 gap-2">
          {complaintCategories.map((c) => {
            const Icon = catIcons[c];
            return (
              <button
                key={c}
                onClick={() => {
                  setCat(c);
                  setOpen(true);
                }}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-card p-3 text-xs font-medium shadow-[var(--shadow-soft)] transition active:scale-95"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                {c}
              </button>
            );
          })}
        </div>

        <Link
          to="/chat"
          className="flex items-center justify-between rounded-2xl bg-accent p-4 text-sm font-medium text-primary"
        >
          <span>Chat langsung dengan admin</span>
          <span className="text-xs">Buka →</span>
        </Link>

        <div>
          <p className="text-sm font-semibold">Riwayat Tiket</p>
          <div className="mt-3 flex flex-col gap-2">
            {complaints.map((c) => {
              const Icon = catIcons[c.category] ?? Hammer;
              return (
                <div key={c.id} className="rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{c.title}</p>
                        <StatusBadge status={c.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{c.desc}</p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {c.id} · {c.category}
                        </span>
                        <span>{c.date}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-1/2 z-30 flex h-14 w-14 translate-x-[calc(50%+150px)] items-center justify-center rounded-full bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-glow)] transition active:scale-95"
        aria-label="Buat tiket baru"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Sheet */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 backdrop-blur-sm"
          onClick={reset}
        >
          <div
            className="mx-auto w-full max-w-md rounded-t-3xl bg-card p-5 animate-[slide-up_0.35s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold">
                {submitted ? "Tiket Terkirim" : "Buat Tiket Baru"}
              </p>
              <button
                onClick={reset}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {submitted ? (
              <div className="py-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success animate-[scale-in_0.3s_ease-out]">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <p className="mt-3 text-base font-semibold">Tiket berhasil dibuat</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Admin akan segera menindaklanjuti laporan Anda.
                </p>
                <button
                  onClick={reset}
                  className="mt-5 h-11 w-full rounded-2xl bg-[image:var(--gradient-primary)] text-sm font-semibold text-primary-foreground"
                >
                  Tutup
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmitted(true);
                }}
                className="mt-4 flex flex-col gap-3"
              >
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Kategori</label>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    {complaintCategories.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCat(c)}
                        className={
                          "rounded-xl border px-2 py-2 text-[11px] font-medium transition " +
                          (cat === c
                            ? "border-primary bg-accent text-primary"
                            : "border-border bg-card")
                        }
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Judul singkat"
                  className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                />
                <textarea
                  required
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={3}
                  placeholder="Deskripsikan masalah..."
                  className="rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary"
                />
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background py-3 text-xs text-muted-foreground"
                >
                  <ImagePlus className="h-4 w-4" /> Upload foto (dummy)
                </button>
                <button
                  type="submit"
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[image:var(--gradient-primary)] text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] active:scale-[0.98]"
                >
                  <Send className="h-4 w-4" /> Kirim Tiket
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }
  > = {
    waiting: { label: "Menunggu", cls: "bg-warning/20 text-warning-foreground", icon: Clock },
    process: { label: "Diproses", cls: "bg-primary/15 text-primary", icon: Loader2 },
    done: { label: "Selesai", cls: "bg-success/15 text-success", icon: CheckCircle2 },
  };
  const s = map[status];
  if (!s) return null;
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
