import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Bell,
  CalendarDays,
  ChevronRight,
  DoorOpen,
  HelpCircle,
  Home,
  KeyRound,
  LogOut,
  Mail,
  MessageCircle,
  Monitor,
  Moon,
  Pencil,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sun,
  Trash2,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ResidentTenancySummary } from "@/components/ResidentTenancySummary";
import { LoadingState, EmptyState, ErrorState } from "@/components/state";
import { useAuth } from "@/lib/auth";
import { isChatEnabled } from "@/lib/features";
import {
  useActiveSessions,
  useLogoutAll,
  usePenghuniProfile,
  useRevokeSession,
  type PenghuniProfileView,
} from "@/hooks/usePenghuniProfile";
import { formatDate, formatRelative } from "@/lib/format";
import { residentContextAnnouncementRole, residentContextStateCopy } from "@/lib/resident-context";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  // Resident/hunian facts come only from /my/resident-context; account email
  // and session management retain their existing auth authority.
  const { logout } = useAuth();
  const profile = usePenghuniProfile();
  const sessions = useActiveSessions();
  const revoke = useRevokeSession();
  const logoutAll = useLogoutAll();
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);
  const [pending, setPending] = useState(false);
  const chatEnabled = isChatEnabled();

  const toggleDark = () => {
    setDark(!dark);
    document.documentElement.classList.toggle("dark");
  };

  const onLogout = async () => {
    if (pending) return;
    setPending(true);
    try {
      await logout();
      toast.success("Berhasil keluar");
    } catch {
      toast.success("Sesi dibersihkan");
    } finally {
      setPending(false);
      void navigate({ to: "/login" });
    }
  };

  const onLogoutAll = async () => {
    await logoutAll.mutateAsync();
    void navigate({ to: "/login" });
  };

  return (
    <>
      <AppHeader title="Profil Saya" />
      <div className="flex flex-col gap-5 px-5 py-5 animate-[fade-in_0.4s_ease-out]">
        <ResidentProfileCard profile={profile} />

        <ResidentTenancySummary profile={profile} />

        {/* Info */}
        <div className="rounded-2xl border border-border/80 bg-card shadow-[var(--shadow-soft)]">
          {profile.contextState === "ready" ? (
            <>
              <InfoRow icon={Home} label="Properti" value={profile.propertyName ?? "-"} />
              <Divider />
              <InfoRow icon={DoorOpen} label="Kamar" value={profile.roomNumber ?? "-"} />
              <Divider />
              <InfoRow
                icon={Home}
                label="Gedung & tipe hunian"
                value={`${profile.buildingName ?? profile.buildingCode ?? "-"} · ${kostTypeLabel(profile.kostType)}`}
              />
              <Divider />
              <InfoRow icon={BadgeCheck} label="Jenis kamar" value={genderLabel(profile.gender)} />
              <Divider />
            </>
          ) : null}
          <InfoRow icon={Mail} label="Email" value={profile.email ?? "-"} />
          {profile.contextState === "ready" ? (
            <>
              <Divider />
              <InfoRow
                icon={Phone}
                label="Nomor HP"
                value={profile.phone ?? "Belum tersedia"}
                muted={profile.phone === null}
              />
              <Divider />
              <InfoRow
                icon={CalendarDays}
                label="Tanggal Masuk"
                value={formatDate(profile.occupancyStart)}
              />
              <Divider />
              <InfoRow
                icon={CalendarDays}
                label="Periode sewa"
                value={leasePeriodLabel(profile.leaseStart, profile.leaseEnd, profile.termMonths)}
                muted={profile.leaseStart === null}
              />
            </>
          ) : null}
        </div>

        {profile.contextState === "ready" ? (
          <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                <CalendarDays className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">Status sewa</p>
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                    {leaseStatusLabel(profile.leaseStatus)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {profile.paymentPlanType
                    ? `Skema pembayaran: ${profile.paymentPlanType}`
                    : "Skema pembayaran belum tersedia."}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Active sessions */}
        <div className="rounded-2xl border border-border/80 bg-card shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between px-4 pt-4">
            <p className="text-sm font-semibold">Sesi Aktif</p>
            {sessions.data && sessions.data.length > 0 ? (
              <button
                onClick={() => void onLogoutAll()}
                disabled={logoutAll.isPending}
                className="text-[11px] font-semibold text-destructive disabled:opacity-60"
              >
                {logoutAll.isPending ? "Memproses..." : "Keluar dari semua"}
              </button>
            ) : null}
          </div>
          <div className="p-4">
            {sessions.isLoading ? (
              <LoadingState label="Memuat sesi..." />
            ) : sessions.isError ? (
              <ErrorState
                error={sessions.error}
                onRetry={() => void sessions.refetch()}
                title="Gagal memuat sesi"
              />
            ) : (sessions.data ?? []).length === 0 ? (
              <EmptyState
                title="Tidak ada sesi aktif"
                description="Saat Anda masuk dari perangkat lain, sesi tersebut akan muncul di sini."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {sessions.data!.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-primary">
                      <Monitor className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {s.device_name ?? s.user_agent ?? "Perangkat tidak dikenal"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {s.current ? "Sesi saat ini · " : ""}
                        {s.last_activity_at
                          ? `Aktif ${formatRelative(s.last_activity_at)}`
                          : s.created_at
                            ? `Dibuat ${formatRelative(s.created_at)}`
                            : "-"}
                      </p>
                    </div>
                    {!s.current && (
                      <button
                        onClick={() => revoke.mutate({ sessionId: s.id })}
                        disabled={revoke.isPending}
                        className="inline-flex h-8 items-center gap-1 rounded-full bg-destructive/10 px-2.5 text-[11px] font-semibold text-destructive disabled:opacity-60"
                        aria-label="Cabut sesi"
                      >
                        <Trash2 className="h-3 w-3" /> Cabut
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Settings (visual-only toggles; preferences endpoint belongs to later milestone) */}
        <div className="rounded-2xl border border-border/80 bg-card shadow-[var(--shadow-soft)]">
          <ToggleRow
            icon={dark ? Moon : Sun}
            label="Dark Mode"
            checked={dark}
            onChange={toggleDark}
            hint="Preferensi tampilan lokal"
          />
          <Divider />
          <ToggleRow
            icon={Bell}
            label="Notifikasi"
            checked={false}
            onChange={() => toast.message("Pengaturan notifikasi tersedia di milestone berikutnya")}
            hint="Akan terhubung ke preferensi backend"
            disabled
          />
        </div>

        {/* Links */}
        <div className="rounded-2xl border border-border/80 bg-card shadow-[var(--shadow-soft)]">
          {chatEnabled ? (
            <NavRow to="/chat" icon={MessageCircle} label="Chat dengan Admin" />
          ) : (
            <DisabledRow
              icon={MessageCircle}
              label="Chat dengan Admin"
              hint="Fitur chat belum aktif untuk release saat ini"
            />
          )}
          <Divider />
          <NavRow to="/info" icon={HelpCircle} label="Informasi & FAQ" />
          <Divider />
          <DisabledRow
            icon={KeyRound}
            label="Ubah Kata Sandi"
            hint="Form ubah kata sandi tersedia di milestone berikutnya"
          />
          <Divider />
          <DisabledRow icon={ShieldCheck} label="Kebijakan Privasi" hint="Belum tersedia" />
        </div>

        <button
          onClick={onLogout}
          disabled={pending}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-destructive/10 text-sm font-semibold text-destructive active:scale-[0.98] disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" /> {pending ? "Memproses..." : "Logout"}
        </button>

        <p className="pb-2 text-center text-[11px] text-muted-foreground">
          Kos Resident App · v1.0.0
        </p>
      </div>
    </>
  );
}

function ResidentProfileCard({ profile }: { profile: PenghuniProfileView }) {
  if (profile.contextState === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-36 items-center gap-4 overflow-hidden rounded-3xl bg-[image:var(--gradient-primary)] p-5 text-primary-foreground shadow-[var(--shadow-glow)]"
      >
        <div className="h-16 w-16 shrink-0 animate-pulse rounded-2xl bg-white/20" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-5 w-36 max-w-full animate-pulse rounded bg-white/20" />
          <div className="h-3 w-52 max-w-full animate-pulse rounded bg-white/15" />
        </div>
        <span className="sr-only">Memuat profil hunian</span>
      </div>
    );
  }

  if (profile.contextState === "ready" && profile.displayName) {
    return (
      <div className="overflow-hidden rounded-3xl border border-primary/30 bg-[image:var(--gradient-primary)] p-5 text-primary-foreground shadow-[var(--shadow-glow)]">
        <div className="flex min-w-0 items-start gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-xl font-semibold backdrop-blur"
            aria-hidden="true"
          >
            {profile.initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words text-lg font-semibold">{profile.displayName}</p>
            <p className="break-all text-xs opacity-90">{profile.email ?? "-"}</p>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
              <BadgeCheck className="h-3 w-3" aria-hidden="true" /> Hunian aktif
            </span>
          </div>
          <button
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur disabled:opacity-60"
            aria-label="Edit profil belum tersedia"
            disabled
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-[11px] opacity-90">
          Edit profil belum tersedia sampai endpoint update profil Penghuni dirilis.
        </p>
      </div>
    );
  }

  const copy = residentContextStateCopy(profile.contextState);
  return (
    <section
      role={residentContextAnnouncementRole(profile.contextState)}
      className="rounded-3xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)]"
    >
      <p className="text-sm font-semibold">{copy.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.description}</p>
      {copy.canRetry ? (
        <button
          type="button"
          onClick={() => void profile.refetchContext()}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Coba lagi memuat profil hunian"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Coba lagi
        </button>
      ) : null}
    </section>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className={"break-words text-sm font-medium " + (muted ? "text-muted-foreground" : "")}>
          {value}
        </p>
      </div>
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onChange: () => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className="flex w-full items-center gap-3 p-4 text-left disabled:opacity-70"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
      <span
        className={
          "relative h-6 w-11 rounded-full transition " + (checked ? "bg-primary" : "bg-border")
        }
      >
        <span
          className={
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition " +
            (checked ? "left-5" : "left-0.5")
          }
        />
      </span>
    </button>
  );
}

function NavRow({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link to={to} className="flex w-full items-center gap-3 p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <p className="flex-1 text-sm font-medium">{label}</p>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

function DisabledRow({
  icon: Icon,
  label,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex w-full items-center gap-3 p-4 opacity-60">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="mx-4 h-px bg-border" />;
}

function kostTypeLabel(value: PenghuniProfileView["kostType"]): string {
  if (value === "rukost") return "Rumah Kost";
  if (value === "apartkost") return "Apart Kost";
  return "Tipe belum tersedia";
}

function genderLabel(value: PenghuniProfileView["gender"]): string {
  if (value === "male") return "Putra";
  if (value === "female") return "Putri";
  return "Belum tersedia";
}

function leaseStatusLabel(value: PenghuniProfileView["leaseStatus"]): string {
  if (value === "active") return "Aktif";
  if (value === "awaiting_activation") return "Menunggu aktivasi";
  return "Belum tersedia";
}

function leasePeriodLabel(
  start: string | null,
  end: string | null,
  termMonths: number | null,
): string {
  if (!start) return "Periode belum tersedia";
  const period = end ? `${formatDate(start)} – ${formatDate(end)}` : `Mulai ${formatDate(start)}`;
  return termMonths ? `${period} · ${termMonths} bulan` : period;
}
