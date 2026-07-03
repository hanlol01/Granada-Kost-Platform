import { Link, useLocation } from "@tanstack/react-router";
import { Home, Receipt, Wrench, Bell, User } from "lucide-react";

const items = [
  { to: "/", label: "Home", icon: Home },
  { to: "/billing", label: "Tagihan", icon: Receipt },
  { to: "/complaints", label: "Komplain", icon: Wrench },
  { to: "/notifications", label: "Notif", icon: Bell },
  { to: "/profile", label: "Profil", icon: User },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 mx-auto max-w-md border-t border-border bg-card/90 backdrop-blur-xl">
      <ul className="grid grid-cols-5">
        {items.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          return (
            <li key={to}>
              <Link
                to={to}
                className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors"
              >
                <span
                  className={
                    "flex h-9 w-12 items-center justify-center rounded-full transition-all " +
                    (active
                      ? "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-glow)]"
                      : "text-muted-foreground")
                  }
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                </span>
                <span className={active ? "text-foreground" : "text-muted-foreground"}>
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
