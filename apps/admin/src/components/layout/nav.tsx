import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  BedDouble,
  Users,
  CreditCard,
  BarChart3,
  Settings,
  Building2,
  MessageSquareWarning,
  Cctv,
  Bell,
  Lock,
  History,
  CalendarCheck,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/rooms", label: "Kamar", icon: BedDouble },
  { to: "/tenants", label: "Penghuni", icon: Users },
  { to: "/payments", label: "Pembayaran", icon: CreditCard },
  { to: "/complaints", label: "Komplain", icon: MessageSquareWarning },
  { to: "/cctv", label: "CCTV", icon: Cctv },
  { to: "/smart-lock", label: "Smart Lock", icon: Lock },
  { to: "/access-history", label: "Access History", icon: History },
  { to: "/booking", label: "Booking Kamar", icon: CalendarCheck },
  { to: "/bookings", label: "Manajemen Booking", icon: ClipboardList },
  { to: "/reports", label: "Laporan", icon: BarChart3 },
  { to: "/notifications", label: "Notifikasi", icon: Bell },
  { to: "/settings", label: "Pengaturan", icon: Settings },
] as const;

export function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside className="hidden lg:flex w-64 flex-col border-r border-sidebar-border bg-sidebar sticky top-0 h-screen">
      <div className="flex items-center gap-3 px-6 py-6 border-b border-sidebar-border">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-sidebar-foreground">Kos Management</p>
          <p className="text-xs text-muted-foreground">Sistem Pengelolaan</p>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const active = path === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-sidebar-border">
        <div className="rounded-xl bg-primary-soft p-4">
          <p className="text-xs font-semibold text-primary">Premium Plan</p>
          <p className="text-xs text-muted-foreground mt-1">Kelola hingga 100 kamar</p>
        </div>
      </div>
    </aside>
  );
}

export function BottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const items = navItems.slice(0, 5);
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-border">
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const active = path === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center justify-center py-2.5 gap-1 text-xs transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "scale-110 transition-transform")} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
