import { useState } from "react";
import { AlertCircle, ArrowRight, Bell, CheckCircle2, ChevronDown, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ReportNoticeItem = {
  key: string;
  label: string;
  description: string;
  value: string;
  active: boolean;
  group: "action" | "information";
  tone: "danger" | "warning" | "info" | "success";
  onSelect: () => void;
};

const tones = {
  danger: "border-destructive/35 bg-destructive/5 hover:bg-destructive/10",
  warning: "border-warning/40 bg-warning/10 hover:bg-warning/15",
  info: "border-primary/30 bg-primary-soft/50 hover:bg-primary-soft",
  success: "border-success/35 bg-success/5 hover:bg-success/10",
};

export function ReportNotificationsCard({
  id,
  items,
  context,
  isLoading,
  isError,
  onRetry,
}: {
  id: string;
  items: ReportNoticeItem[];
  context: string;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const visible = items.filter((item) => item.active);
  const actionItems = visible.filter((item) => item.group === "action");
  const informationItems = visible.filter((item) => item.group === "information");

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-primary/45 bg-primary/[0.04] shadow-sm after:pointer-events-none after:absolute after:inset-1 after:rounded-lg after:ring-2 after:ring-primary/35 after:content-['']",
        actionItems.length > 0 && "after:animate-pulse motion-reduce:after:animate-none",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-14 w-full items-center gap-3 p-4 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Bell className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-foreground">Pemberitahuan</span>
          <span className="block text-xs text-muted-foreground">
            {isLoading
              ? "Memuat pemberitahuan laporan..."
              : isError
                ? "Pemberitahuan belum dapat dimuat"
                : actionItems.length
                  ? `${actionItems.length} jenis perhatian perlu ditinjau`
                  : informationItems.length
                    ? `${informationItems.length} informasi periode tersedia`
                    : "Tidak ada hal yang perlu ditindaklanjuti pada periode ini"}
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
        <CardContent id={id} className="border-t border-border p-4">
          {isError ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">Gagal memuat pemberitahuan. Laporan tetap dapat digunakan.</p>
              <Button variant="outline" onClick={onRetry}>
                Coba lagi
              </Button>
            </div>
          ) : isLoading ? (
            <p role="status" className="text-sm text-muted-foreground">
              Menghitung data laporan...
            </p>
          ) : (
            <>
              <p className="mb-4 text-xs text-muted-foreground">
                {context} Jumlah mencakup seluruh data pada periode, bukan hanya halaman tabel.
                Pilih kategori untuk melihat data terkait.
              </p>
              {visible.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada informasi yang memerlukan perhatian untuk periode ini.
                </p>
              ) : (
                <div className="space-y-5">
                  {(
                    [
                      ["Perlu ditindaklanjuti", actionItems],
                      ["Informasi periode", informationItems],
                    ] as const
                  ).map(([heading, groupItems]) =>
                    groupItems.length ? (
                      <section key={heading} aria-label={heading}>
                        <h3 className="mb-2 text-sm font-semibold text-foreground">{heading}</h3>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {groupItems.map((item) => {
                            const Icon =
                              item.tone === "danger"
                                ? AlertCircle
                                : item.tone === "warning"
                                  ? Clock3
                                  : CheckCircle2;
                            return (
                              <button
                                key={item.key}
                                type="button"
                                onClick={item.onSelect}
                                className={cn(
                                  "flex min-h-28 items-start gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  tones[item.tone],
                                )}
                              >
                                <Icon className="mt-1 size-5 shrink-0" aria-hidden="true" />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-semibold">{item.label}</span>
                                  <span className="mt-1 block text-2xl font-bold tabular-nums">
                                    {item.value}
                                  </span>
                                  <span className="mt-1 block text-xs text-muted-foreground">
                                    {item.description}
                                  </span>
                                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                                    Lihat data <ArrowRight className="size-3" aria-hidden="true" />
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ) : null,
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
