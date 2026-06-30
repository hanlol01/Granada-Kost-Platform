import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, HelpCircle, Megaphone, ShieldCheck } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, LoadingState } from "@/components/state";
import { useAnnouncements, useFaqs, useKostRules } from "@/hooks/usePenghuniInfo";

export const Route = createFileRoute("/_app/info")({
  component: InfoPage,
});

type Tab = "news" | "rules" | "faq";

function InfoPage() {
  const [tab, setTab] = useState<Tab>("news");
  const announcements = useAnnouncements();
  const rules = useKostRules();
  const faqs = useFaqs();

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
          (announcements.isLoading ? (
            <LoadingState label="Memuat pengumuman..." />
          ) : announcements.data?.available && announcements.data.items.length > 0 ? (
            announcements.data.items.map((a) => (
              <div key={a.id} className="rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
                    <Megaphone className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{a.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{a.body}</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
              <EmptyState
                title="Belum tersedia"
                description={
                  announcements.data?.reason ??
                  "Pengumuman akan tampil di sini saat endpoint tersedia."
                }
                icon={<Megaphone className="h-5 w-5" />}
              />
            </div>
          ))}

        {tab === "rules" &&
          (rules.isLoading ? (
            <LoadingState label="Memuat peraturan..." />
          ) : rules.data?.available && rules.data.items.length > 0 ? (
            <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-primary" /> Peraturan Kos
              </div>
              <ul className="space-y-2">
                {rules.data.items.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-primary">
                      {i + 1}
                    </span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
              <EmptyState
                title="Belum tersedia"
                description={
                  rules.data?.reason ?? "Peraturan kos akan disinkronkan dengan property settings."
                }
                icon={<ShieldCheck className="h-5 w-5" />}
              />
            </div>
          ))}

        {tab === "faq" &&
          (faqs.isLoading ? (
            <LoadingState label="Memuat FAQ..." />
          ) : faqs.data?.available && faqs.data.items.length > 0 ? (
            faqs.data.items.map((f, i) => <FaqItem key={i} index={i} q={f.q} a={f.a} />)
          ) : (
            <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
              <EmptyState
                title="Belum tersedia"
                description={
                  faqs.data?.reason ?? "FAQ akan ditampilkan saat endpoint resident tersedia."
                }
                icon={<HelpCircle className="h-5 w-5" />}
              />
            </div>
          ))}
      </div>
    </>
  );
}

function FaqItem({ index, q, a }: { index: number; q: string; a: string }) {
  const [open, setOpen] = useState(index === 0);
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-soft)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <p className="text-sm font-medium">{q}</p>
        <ChevronDown
          className={"h-4 w-4 text-muted-foreground transition " + (open ? "rotate-180" : "")}
        />
      </button>
      {open && (
        <p className="px-4 pb-4 text-sm text-muted-foreground animate-[fade-in_0.2s_ease-out]">
          {a}
        </p>
      )}
    </div>
  );
}
