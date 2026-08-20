import { BadgeCheck, CalendarDays, DoorOpen, Home, type LucideIcon } from "lucide-react";
import type { PenghuniProfileView } from "@/hooks/usePenghuniProfile";
import { formatDate } from "@/lib/format";

type ResidentTenancySummaryProps = {
  profile: PenghuniProfileView;
};

export function ResidentTenancySummary({ profile }: ResidentTenancySummaryProps) {
  if (profile.contextState !== "ready") return null;

  const kostType = profile.kostType === "rukost" ? "Rumah Kost" : "Apart Kost";
  const gender = profile.gender === "male" ? "Putra" : profile.gender === "female" ? "Putri" : "-";
  const leaseStatus = profile.leaseStatus === "active" ? "Aktif" : "Menunggu aktivasi";
  const period = profile.leaseStart
    ? `${formatDate(profile.leaseStart)}${profile.leaseEnd ? ` – ${formatDate(profile.leaseEnd)}` : ""}`
    : "Periode belum tersedia";

  return (
    <section
      aria-labelledby="resident-tenancy-summary"
      className="rounded-2xl border border-border/80 bg-card p-4 shadow-[var(--shadow-soft)]"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
          <Home className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="resident-tenancy-summary" className="text-sm font-semibold">
              Hunian aktif
            </h2>
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
              {leaseStatus}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Ringkasan ini mengikuti penugasan kamar dan sewa yang sedang berlaku.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <SummaryItem icon={DoorOpen} label="Kamar" value={profile.roomNumber ?? "Belum tersedia"} />
        <SummaryItem
          icon={Home}
          label="Properti & tipe"
          value={`${profile.propertyName ?? "-"} · ${kostType}`}
        />
        <SummaryItem icon={BadgeCheck} label="Jenis kamar" value={gender} />
        <SummaryItem
          icon={Home}
          label="Gedung / unit"
          value={profile.buildingName ?? profile.buildingCode ?? "-"}
        />
        <SummaryItem icon={CalendarDays} label="Periode sewa" value={period} />
        <SummaryItem
          icon={CalendarDays}
          label="Skema pembayaran"
          value={profile.paymentPlanType ?? "Belum tersedia"}
        />
      </div>
    </section>
  );
}

function SummaryItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}
