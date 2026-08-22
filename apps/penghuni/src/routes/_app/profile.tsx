import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType, type FormEvent } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  DoorOpen,
  Eye,
  EyeOff,
  HelpCircle,
  Home,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Moon,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ResidentTenancySummary } from "@/components/ResidentTenancySummary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useChangePassword,
  usePenghuniProfile,
  type PenghuniProfileView,
} from "@/hooks/usePenghuniProfile";
import { useAuth } from "@/lib/auth";
import { formatDate, paymentPlanLabel } from "@/lib/format";
import { residentContextAnnouncementRole, residentContextStateCopy } from "@/lib/resident-context";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { logout } = useAuth();
  const profile = usePenghuniProfile();
  const navigate = useNavigate();
  const [dark, setDark] = useState(true);
  const [pending, setPending] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    const isDark = localStorage.getItem("theme") !== "light";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggleDark = () => {
    setDark((current) => {
      const next = !current;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("theme", next ? "dark" : "light");
      return next;
    });
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

  const onPasswordSuccess = async () => {
    try {
      await logout();
    } finally {
      void navigate({ to: "/login" });
    }
  };

  return (
    <>
      <AppHeader title="Profil Saya" />
      <div className="flex flex-col gap-5 px-5 py-5 animate-[fade-in_0.4s_ease-out]">
        <ResidentProfileCard profile={profile} />
        <ResidentTenancySummary profile={profile} />

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
                  {`Skema pembayaran: ${paymentPlanLabel(profile.paymentPlanType)}`}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {passwordOpen ? (
          <ProfilePasswordForm
            onCancel={() => setPasswordOpen(false)}
            onSuccess={() => void onPasswordSuccess()}
          />
        ) : null}

        <div className="rounded-2xl border border-border/80 bg-card shadow-[var(--shadow-soft)]">
          <ToggleRow
            icon={dark ? Moon : Sun}
            label="Dark Mode"
            checked={dark}
            onChange={toggleDark}
            hint="Preferensi tampilan lokal"
          />
          <Divider />
          <NavRow to="/info" icon={HelpCircle} label="Informasi & FAQ" />
          <Divider />
          <ActionRow
            icon={KeyRound}
            label="Ubah Kata Sandi"
            hint="Perbarui kata sandi akun Anda secara aman"
            onClick={() => setPasswordOpen((open) => !open)}
            active={passwordOpen}
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

function ProfilePasswordForm({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const changePassword = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword.length < 12) {
      toast.error("Kata sandi baru minimal 12 karakter");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Konfirmasi kata sandi belum sama");
      return;
    }
    changePassword.mutate(
      { current_password: currentPassword, new_password: newPassword },
      { onSuccess },
    );
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-primary/30 bg-card p-4 shadow-[var(--shadow-soft)]"
      aria-label="Ubah kata sandi"
    >
      <div className="mb-4">
        <p className="text-sm font-semibold">Ubah Kata Sandi</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Gunakan minimal 12 karakter. Setelah berhasil, Anda akan keluar dan perlu masuk kembali.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <ProfilePasswordField
          id="current-password"
          label="Kata sandi saat ini"
          value={currentPassword}
          onChange={setCurrentPassword}
          visible={showCurrent}
          onToggle={() => setShowCurrent((visible) => !visible)}
          required
        />
        <ProfilePasswordField
          id="new-password"
          label="Kata sandi baru"
          value={newPassword}
          onChange={setNewPassword}
          visible={showNew}
          onToggle={() => setShowNew((visible) => !visible)}
          minLength={12}
          required
        />
        <ProfilePasswordField
          id="confirm-password"
          label="Ulangi kata sandi baru"
          value={confirmPassword}
          onChange={setConfirmPassword}
          visible={showConfirm}
          onToggle={() => setShowConfirm((visible) => !visible)}
          minLength={12}
          required
        />
      </div>
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={changePassword.isPending} className="min-h-11 flex-1">
          {changePassword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {changePassword.isPending ? "Menyimpan..." : "Simpan kata sandi"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={changePassword.isPending}
        >
          Batal
        </Button>
      </div>
    </form>
  );
}

function ProfilePasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  minLength,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  minLength?: number;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          minLength={minLength}
          required={required}
          autoComplete={id === "current-password" ? "current-password" : "new-password"}
          className="min-h-11 pr-11"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label={
            visible ? `Sembunyikan ${label.toLowerCase()}` : `Tampilkan ${label.toLowerCase()}`
          }
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
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
        </div>
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
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Coba lagi
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
  icon: ComponentType<{ className?: string }>;
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
        <p className={`break-words text-sm font-medium ${muted ? "text-muted-foreground" : ""}`}>
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
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onChange: () => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex w-full items-center gap-3 p-4 text-left"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
      <span
        className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-primary" : "bg-border"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-5" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

function ActionRow({
  icon: Icon,
  label,
  hint,
  onClick,
  active,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-accent/50"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <ChevronRight
        className={`h-4 w-4 text-muted-foreground transition ${active ? "rotate-90" : ""}`}
      />
    </button>
  );
}

function NavRow({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: ComponentType<{ className?: string }>;
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
  icon: ComponentType<{ className?: string }>;
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
