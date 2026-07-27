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
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <RegistrySidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
          <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-8">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>
              ) : null}
              <AppBreadcrumb />
            </div>
            <div className="flex w-full min-w-0 max-w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:shrink-0">
              {actions}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleDark}
                aria-label="Ubah tema"
                className="text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="relative text-muted-foreground hover:bg-accent hover:text-accent-foreground"
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
