import { useEffect, useState, type ReactNode } from "react";
import { Bell, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppBreadcrumb } from "./Breadcrumb";
import { RegistryBottomNav, RegistrySidebar } from "./registry-navigation";
import { UserMenu } from "./user-menu";

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AppShell({ title, subtitle, actions, children }: Props) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const isDark = localStorage.getItem("theme") === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <div className="flex min-h-screen w-full bg-slate-950 text-slate-100">
      <RegistrySidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-8">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight text-slate-100 md:text-2xl">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-0.5 truncate text-sm text-slate-400">{subtitle}</p>
              ) : null}
              <AppBreadcrumb />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {actions}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleDark}
                aria-label="Ubah tema"
                className="text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="relative text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                aria-label="Notifikasi"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
              </Button>
              <UserMenu />
            </div>
          </div>
        </header>
        <main className="flex-1 animate-fade-in px-4 py-6 pb-24 md:px-8 lg:pb-6">{children}</main>
      </div>
      <RegistryBottomNav />
    </div>
  );
}
