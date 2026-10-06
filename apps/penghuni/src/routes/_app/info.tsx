import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, ChevronDown, HelpCircle, Home, ShieldCheck } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, LoadingState } from "@/components/state";
import { useFaqs, useKostRules } from "@/hooks/usePenghuniInfo";
import { usePenghuniProfile } from "@/hooks/usePenghuniProfile";

export const Route = createFileRoute("/_app/info")({
  component: InfoPage,
});

type Tab = "rules" | "faq";

function InfoPage() {
  const [tab, setTab] = useState<Tab>("rules");
  const rules = useKostRules();
  const faqs = useFaqs();
  const profile = usePenghuniProfile();

  return (
    <>
      <AppHeader title="Informasi Kos" back />
      <section className="px-5 pt-5">
        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">Properti & hunian Anda</p>
              <h2 className="mt-1 truncate text-sm font-semibold">
                {profile.contextState === "ready"
                  ? profile.propertyName
                  : "Data hunian belum tersedia"}
              </h2>
              {profile.contextState === "ready" ? (
                <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <Home className="h-3.5 w-3.5" />
                  {profile.buildingName ?? profile.buildingCode} · Kamar {profile.roomNumber} ·{" "}
                  {profile.kostType === "rukost" ? "Rumah Kost" : "Apart Kost"}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Informasi mengikuti hunian aktif yang terhubung ke akun Anda.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
      <div className="px-5 pt-4">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-secondary p-1">
          {(["rules", "faq"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={
                "min-h-11 rounded-xl py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                (tab === t
                  ? "bg-card text-foreground shadow-[var(--shadow-soft)]"
                  : "text-muted-foreground")
              }
            >
              {t === "rules" ? "Peraturan" : "FAQ"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5 py-5 animate-[fade-in_0.3s_ease-out]">
        {tab === "rules" &&
          (rules.isLoading ? (
            <LoadingState label="Memuat peraturan..." />
          ) : rules.data?.available && rules.data.items.length > 0 ? (
            <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-[var(--shadow-soft)]">
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
            <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-[var(--shadow-soft)]">
              <EmptyState
                title="Belum tersedia"
                description={
                  rules.data?.reason ?? "Peraturan properti belum diterbitkan di aplikasi."
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
            <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-[var(--shadow-soft)]">
              <EmptyState
                title="Belum tersedia"
                description={
                  faqs.data?.reason ?? "Panduan tanya jawab belum diterbitkan di aplikasi."
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
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[var(--shadow-soft)]">
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
