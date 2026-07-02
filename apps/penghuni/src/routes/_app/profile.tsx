import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Bell,
  CalendarDays,
  ChevronRight,
  HelpCircle,
  KeyRound,
  LogOut,
  Mail,
  MessageCircle,
  Monitor,
  Moon,
  Pencil,
  Phone,
  ShieldCheck,
  Sun,
  Trash2,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { LoadingState, EmptyState, ErrorState } from "@/components/state";
import { useAuth } from "@/lib/auth";
import { isChatEnabled } from "@/lib/features";
import {
  useActiveSessions,
  useLogoutAll,
  usePenghuniProfile,
  useRevokeSession,
} from "@/hooks/usePenghuniProfile";
import { formatRelative } from "@/lib/format";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  // M11F: profile data from /auth/me; sessions from /auth/sessions; logout +
  // logout-all + change password supported via /auth/* endpoints. Edit
  // profile is intentionally disabled because no PATCH /penghuni/me exists.
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
        {/* Profile card */}
        <div className="overflow-hidden rounded-3xl bg-[image:var(--gradient-primary)] p-5 text-primary-foreground shadow-[var(--shadow-glow)]">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-xl font-semibold backdrop-blur">
              {profile.initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">{profile.displayName}</p>
              <p className="truncate text-xs opacity-90">{profile.email ?? "-"}</p>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
                <BadgeCheck className="h-3 w-3" /> Aktif
              </span>
            </div>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 backdrop-blur disabled:opacity-60"
              aria-label="Edit profil belum tersedia"
              disabled
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-[11px] opacity-90">
            Edit profil belum tersedia sampai endpoint update profil Penghuni dirilis.
          </p>
        </div>

        {/* Info */}
        <div className="rounded-2xl bg-card shadow-[var(--shadow-soft)]">
          <InfoRow icon={BadgeCheck} label="Properti" value={profile.roomLabel ?? "-"} />
          <Divider />
          <InfoRow icon={Mail} label="Email" value={profile.email ?? "-"} />
          <Divider />
          <InfoRow icon={Phone} label="Nomor HP" value="Belum tersedia" muted />
          <Divider />
          <InfoRow icon={CalendarDays} label="Tanggal Masuk" value="Belum tersedia" muted />
        </div>

        {/* Active sessions */}
        <div className="rounded-2xl bg-card shadow-[var(--shadow-soft)]">
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
        <div className="rounded-2xl bg-card shadow-[var(--shadow-soft)]">
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
        <div className="rounded-2xl bg-card shadow-[var(--shadow-soft)]">
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
      <div className="flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className={"text-sm font-medium " + (muted ? "text-muted-foreground" : "")}>{value}</p>
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
