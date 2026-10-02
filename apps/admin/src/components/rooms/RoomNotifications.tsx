import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CalendarDays,
  ChevronDown,
  Clock3,
  DoorOpen,
  EyeOff,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { RoomStatus } from "@/lib/admin-ux-master-api";
import { cn } from "@/lib/utils";

const ROOM_NOTIFICATION_ITEMS: Array<{
  status: Exclude<RoomStatus, "occupied">;
  label: string;
  description: string;
  tone: "danger" | "warning" | "info" | "success" | "muted";
  icon: typeof AlertCircle;
}> = [
  {
    status: "inspection_required",
    label: "Perlu pemeriksaan",
    description: "Periksa kondisi kamar sebelum mengubahnya menjadi kosong dan siap digunakan.",
    tone: "warning",
    icon: AlertCircle,
  },
  {
    status: "maintenance",
    label: "Dalam perawatan",
    description: "Kamar belum siap digunakan dan masih memerlukan tindak lanjut perawatan.",
    tone: "warning",
    icon: Wrench,
  },
  {
    status: "requires_review",
    label: "Perlu ditinjau",
    description: "Data inventori kamar perlu diperiksa sebelum digunakan kembali.",
    tone: "danger",
    icon: ShieldAlert,
  },
  {
    status: "vacant",
    label: "Kamar kosong",
    description: "Kamar tersedia untuk proses booking atau penempatan penghuni.",
    tone: "success",
    icon: DoorOpen,
  },
  {
    status: "reserved",
    label: "Dipesan",
    description: "Pantau kelanjutan booking agar status kamar tetap sesuai kondisi terbaru.",
    tone: "info",
    icon: CalendarDays,
  },
  {
    status: "awaiting_check_in",
    label: "Menunggu check-in",
    description: "Proses aktivasi kamar atau check-in penghuni belum selesai.",
    tone: "info",
    icon: Clock3,
  },
  {
    status: "inactive",
    label: "Tidak aktif",
    description: "Kamar tidak ditampilkan sebagai inventori yang tersedia.",
    tone: "muted",
    icon: EyeOff,
  },
];

const tones = {
  danger: "border-destructive/35 bg-destructive/5 hover:bg-destructive/10",
  warning: "border-warning/40 bg-warning/10 hover:bg-warning/15",
  info: "border-primary/30 bg-primary-soft/50 hover:bg-primary-soft",
  success: "border-success/35 bg-success/5 hover:bg-success/10",
  muted: "border-border bg-muted/50 hover:bg-muted",
};

export function RoomNotifications({
  counts,
  isLoading,
  isError,
  onRetry,
  onSelect,
  selected,
  scopeLabel,
}: {
  counts: Partial<Record<RoomStatus, number>>;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSelect: (status: RoomStatus) => void;
  selected?: RoomStatus;
  scopeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const items = ROOM_NOTIFICATION_ITEMS.filter((item) => (counts[item.status] ?? 0) > 0);

  return (
    <Card className="relative mb-5 overflow-hidden border-primary/40 bg-primary/[0.035] shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="room-notifications-content"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-14 w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Bell className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-foreground">Pemberitahuan</span>
          <span className="block text-xs text-muted-foreground">
            {isLoading
              ? "Memuat informasi kamar..."
              : isError
                ? "Informasi kamar belum dapat dimuat"
                : items.length
                  ? `${items.length} jenis informasi kamar tersedia untuk ditinjau`
                  : "Tidak ada kamar kosong atau status yang perlu ditindaklanjuti"}
          </span>
        </span>
        <span className="text-sm font-medium text-primary">{open ? "Ciutkan" : "Lihat"}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <CardContent id="room-notifications-content" className="border-t border-border p-4">
          {isError ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                Gagal memuat pemberitahuan kamar. Daftar inventori tetap dapat digunakan.
              </p>
              <Button variant="outline" onClick={onRetry}>
                Coba lagi
              </Button>
            </div>
          ) : isLoading ? (
            <p role="status" className="text-sm text-muted-foreground">
              Memuat jumlah kamar...
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Saat ini tidak ada kamar kosong atau status inventori yang memerlukan tindak lanjut.
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                Jumlah mencakup seluruh kamar {scopeLabel}, bukan hanya baris pada halaman tabel.
                Pilih status untuk melihat daftar kamarnya.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.status}
                      type="button"
                      aria-pressed={selected === item.status}
                      onClick={() => onSelect(item.status)}
                      className={cn(
                        "flex min-h-28 items-start gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        tones[item.tone],
                        selected === item.status && "ring-2 ring-primary",
                      )}
                    >
                      <Icon className="mt-1 size-5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{item.label}</span>
                        <span className="mt-1 block text-2xl font-bold tabular-nums">
                          {counts[item.status] ?? 0}{" "}
                          <span className="text-xs font-normal">kamar</span>
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {item.description}
                        </span>
                        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                          Lihat kamar <ArrowRight className="size-3" aria-hidden="true" />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
