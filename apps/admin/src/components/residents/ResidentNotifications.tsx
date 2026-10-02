import { Bell, ChevronDown, ChevronRight, AlertCircle, Clock3, ArrowRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useResidentAttention } from "@/hooks/useResidents";
import { RESIDENT_ATTENTION, type ResidentAttentionCategory } from "@/lib/admin-resident-attention";
import { cn } from "@/lib/utils";

const tones = {
  danger: "border-destructive/35 bg-destructive/5 hover:bg-destructive/10",
  warning: "border-warning/40 bg-warning/10 hover:bg-warning/15",
  info: "border-primary/30 bg-primary-soft/50 hover:bg-primary-soft",
};

export function ResidentNotifications({
  onSelect,
  selected,
}: {
  onSelect: (category: ResidentAttentionCategory) => void;
  selected: ResidentAttentionCategory | null;
}) {
  const [open, setOpen] = useState(false);
  const summary = useResidentAttention();
  const categories = (Object.keys(RESIDENT_ATTENTION) as ResidentAttentionCategory[]).filter(
    (category) => (summary.data?.counts[category] ?? 0) > 0,
  );
  return (
    <Card
      className={cn(
        "relative mb-5 overflow-hidden border-primary/45 bg-primary/[0.04] shadow-sm after:pointer-events-none after:absolute after:inset-1 after:rounded-lg after:ring-2 after:ring-primary/35 after:content-['']",
        categories.length > 0 && "after:animate-pulse motion-reduce:after:animate-none",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="resident-notifications"
        onClick={() => setOpen(!open)}
        className="flex w-full min-h-14 items-center gap-3 p-4 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Bell className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Pemberitahuan</span>
          <span className="block text-xs text-muted-foreground">
            {summary.isPending
              ? "Memuat pemberitahuan..."
              : summary.isError
                ? "Pemberitahuan belum dapat dimuat"
                : categories.length
                  ? `${categories.length} jenis pemberitahuan perlu ditinjau`
                  : "Tidak ada pemberitahuan yang perlu ditindaklanjuti"}
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
        <CardContent id="resident-notifications" className="border-t border-border p-4">
          {summary.isError ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                Gagal memuat pemberitahuan. Data tabel tetap dapat digunakan.
              </p>
              <Button variant="outline" onClick={() => summary.refetch()}>
                Coba lagi
              </Button>
            </div>
          ) : summary.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Memuat jumlah penghuni...
            </p>
          ) : categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Seluruh kategori perhatian telah selesai atau belum memiliki data.
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                Jumlah mencakup seluruh properti yang dipilih, bukan hanya halaman tabel. Satu
                penghuni dapat memiliki lebih dari satu pemberitahuan.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {categories.map((category) => {
                  const item = RESIDENT_ATTENTION[category];
                  const Icon =
                    item.tone === "danger"
                      ? AlertCircle
                      : item.tone === "warning"
                        ? Clock3
                        : ChevronRight;
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={selected === category}
                      onClick={() => onSelect(category)}
                      className={cn(
                        "flex min-h-28 items-start gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        tones[item.tone],
                        selected === category && "ring-2 ring-primary",
                      )}
                    >
                      <Icon className="mt-1 size-5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{item.label}</span>
                        <span className="mt-1 block text-2xl font-bold tabular-nums">
                          {summary.data!.counts[category]}{" "}
                          <span className="text-xs font-normal">penghuni</span>
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {item.description}
                        </span>
                        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold">
                          Lihat data <ArrowRight className="size-3" aria-hidden="true" />
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
