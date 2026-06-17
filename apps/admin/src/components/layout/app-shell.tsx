import { ReactNode } from "react";
import { Sidebar, BottomNav } from "./nav";
import { Bell, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

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
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur border-b border-border">
          <div className="flex items-center justify-between gap-4 px-4 md:px-8 py-4">
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight truncate">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {actions}
              <Button variant="ghost" size="icon" onClick={toggleDark} aria-label="Toggle theme">
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                <Bell className="h-4 w-4" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
              </Button>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 md:px-8 py-6 pb-24 lg:pb-6 animate-fade-in">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
