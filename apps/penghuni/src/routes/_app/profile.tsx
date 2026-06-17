import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { currentUser } from "@/lib/dummy-data";
import {
  Pencil,
  MessageCircle,
  Moon,
  Sun,
  Bell,
  LogOut,
  ChevronRight,
  Phone,
  CalendarDays,
  BadgeCheck,
  HelpCircle,
} from "lucide-react";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const [dark, setDark] = useState(false);
  const [notif, setNotif] = useState(true);

  const toggleDark = () => {
    setDark(!dark);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <>
      <AppHeader title="Profil Saya" />
      <div className="flex flex-col gap-5 px-5 py-5 animate-[fade-in_0.4s_ease-out]">
        {/* Profile card */}
        <div className="overflow-hidden rounded-3xl bg-[image:var(--gradient-primary)] p-5 text-primary-foreground shadow-[var(--shadow-glow)]">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-xl font-semibold backdrop-blur">
              {currentUser.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">{currentUser.name}</p>
              <p className="truncate text-xs opacity-90">{currentUser.email}</p>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
                <BadgeCheck className="h-3 w-3" /> {currentUser.status}
              </span>
            </div>
            <button className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 backdrop-blur">
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="rounded-2xl bg-card shadow-[var(--shadow-soft)]">
          <InfoRow icon={BadgeCheck} label="Nomor Kamar" value={currentUser.room} />
          <Divider />
          <InfoRow icon={Phone} label="Nomor HP" value={currentUser.phone} />
          <Divider />
          <InfoRow icon={CalendarDays} label="Tanggal Masuk" value={currentUser.joinDate} />
        </div>

        {/* Settings */}
        <div className="rounded-2xl bg-card shadow-[var(--shadow-soft)]">
          <ToggleRow
            icon={dark ? Moon : Sun}
            label="Dark Mode"
            checked={dark}
            onChange={toggleDark}
          />
          <Divider />
          <ToggleRow
            icon={Bell}
            label="Notifikasi"
            checked={notif}
            onChange={() => setNotif(!notif)}
          />
        </div>

        {/* Links */}
        <div className="rounded-2xl bg-card shadow-[var(--shadow-soft)]">
          <NavRow to="/chat" icon={MessageCircle} label="Chat dengan Admin" />
          <Divider />
          <NavRow to="/info" icon={HelpCircle} label="Informasi & FAQ" />
        </div>

        <button className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-destructive/10 text-sm font-semibold text-destructive active:scale-[0.98]">
          <LogOut className="h-4 w-4" /> Logout
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button onClick={onChange} className="flex w-full items-center gap-3 p-4 text-left">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <p className="flex-1 text-sm font-medium">{label}</p>
      <span
        className={
          "relative h-6 w-11 rounded-full transition " +
          (checked ? "bg-primary" : "bg-border")
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

function Divider() {
  return <div className="mx-4 h-px bg-border" />;
}
