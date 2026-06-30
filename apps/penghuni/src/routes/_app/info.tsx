import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { announcements, faqs } from "@/lib/dummy-data";
import { Megaphone, ChevronDown, ShieldCheck, Sparkles, Calendar, Wrench } from "lucide-react";

export const Route = createFileRoute("/_app/info")({
  component: InfoPage,
});

const rules = [
  "Jam malam pukul 23:00, gerbang dikunci.",
  "Tamu wajib lapor maksimal pukul 21:00.",
  "Dilarang merokok di dalam kamar.",
  "Pembayaran sewa paling lambat tanggal 25.",
  "Menjaga kebersihan area bersama.",
];

const schedules = [
  { day: "Senin", task: "Pembersihan area umum lantai 1 & 2" },
  { day: "Rabu", task: "Pembersihan toilet bersama & tangga" },
  { day: "Jumat", task: "Pembersihan area parkir & sampah" },
];

function InfoPage() {
  const [tab, setTab] = useState<"news" | "rules" | "faq">("news");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <>
      <AppHeader title="Informasi Kos" back />
      <div className="px-5 pt-4">
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-secondary p-1">
          {(["news", "rules", "faq"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "rounded-xl py-2 text-xs font-semibold transition " +
                (tab === t
                  ? "bg-card text-foreground shadow-[var(--shadow-soft)]"
                  : "text-muted-foreground")
              }
            >
              {t === "news" ? "Pengumuman" : t === "rules" ? "Peraturan" : "FAQ"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5 py-5 animate-[fade-in_0.3s_ease-out]">
        {tab === "news" &&
          announcements.map((a) => (
            <div key={a.id} className="rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
                  {a.category === "Maintenance" ? (
                    <Wrench className="h-5 w-5" />
                  ) : a.category === "Promo" ? (
                    <Sparkles className="h-5 w-5" />
                  ) : (
                    <Megaphone className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{a.title}</p>
                    <PriorityBadge p={a.priority} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{a.body}</p>
                  <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Calendar className="h-3 w-3" /> {a.date} · {a.category}
                  </p>
                </div>
              </div>
            </div>
          ))}

        {tab === "rules" && (
          <>
            <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-primary" /> Peraturan Kos
              </div>
              <ul className="space-y-2">
                {rules.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-primary">
                      {i + 1}
                    </span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" /> Jadwal Kebersihan
              </div>
              <div className="space-y-2">
                {schedules.map((s) => (
                  <div key={s.day} className="flex items-start gap-3 rounded-xl bg-secondary p-3">
                    <span className="rounded-lg bg-card px-2 py-1 text-xs font-semibold text-primary">
                      {s.day}
                    </span>
                    <p className="text-sm">{s.task}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "faq" &&
          faqs.map((f, i) => {
            const open = openFaq === i;
            return (
              <div
                key={i}
                className="overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-soft)]"
              >
                <button
                  onClick={() => setOpenFaq(open ? null : i)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left"
                >
                  <p className="text-sm font-medium">{f.q}</p>
                  <ChevronDown
                    className={
                      "h-4 w-4 text-muted-foreground transition " + (open ? "rotate-180" : "")
                    }
                  />
                </button>
                {open && (
                  <p className="px-4 pb-4 text-sm text-muted-foreground animate-[fade-in_0.2s_ease-out]">
                    {f.a}
                  </p>
                )}
              </div>
            );
          })}
      </div>
    </>
  );
}

function PriorityBadge({ p }: { p: string }) {
  const map: Record<string, string> = {
    high: "bg-destructive/15 text-destructive",
    medium: "bg-warning/20 text-warning-foreground",
    low: "bg-success/15 text-success",
  };
  return (
    <span
      className={
        "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase " + (map[p] ?? "")
      }
    >
      {p}
    </span>
  );
}
