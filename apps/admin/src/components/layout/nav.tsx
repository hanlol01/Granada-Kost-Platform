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
  Bike,
  ParkingSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RoleCode } from "@granada-kost/domain";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { isCctvEnabled, isBookingEnabled } from "@/lib/features";

// Sidebar items are filtered by RBAC at render time (ADR-FE-004 + ADR-FE-006).
// `roles` field is an allowlist; an item shown only if user holds at least one role.
// `requiresFlag` hides UI when a Phase 1 feature flag is off (Smart Lock UI is always shown
// because it uses simulated backend per ADR-FE-010).
type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: RoleCode[];
  requiresFlag?: "cctv" | "booking";
};

export const navItems: readonly NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["owner", "manager", "admin"] },
  { to: "/rooms", label: "Kamar", icon: BedDouble, roles: ["owner", "manager", "admin"] },
  { to: "/tenants", label: "Penghuni", icon: Users, roles: ["owner", "manager", "admin"] },
  { to: "/payments", label: "Pembayaran", icon: CreditCard, roles: ["owner", "manager", "admin"] },
  {
    to: "/complaints",
    label: "Komplain",
    icon: MessageSquareWarning,
    roles: ["owner", "manager", "admin", "technician"],
  },
  { to: "/vehicles", label: "Kendaraan", icon: Bike, roles: ["owner", "manager", "admin"] },
  { to: "/parking", label: "Parkir", icon: ParkingSquare, roles: ["owner", "manager", "admin"] },
  {
    to: "/cctv",
    label: "CCTV",
    icon: Cctv,
    roles: ["owner", "manager"],
    requiresFlag: "cctv",
  },
  { to: "/smart-lock", label: "Smart Lock", icon: Lock, roles: ["owner", "manager"] },
  { to: "/access-history", label: "Access History", icon: History, roles: ["owner", "manager"] },
  {
    to: "/booking",
    label: "Booking Kamar",
    icon: CalendarCheck,
    roles: ["owner", "manager", "admin"],
    requiresFlag: "booking",
  },
  {
    to: "/bookings",
    label: "Manajemen Booking",
    icon: ClipboardList,
    roles: ["owner", "manager", "admin"],
    requiresFlag: "booking",
  },
  { to: "/reports", label: "Laporan", icon: BarChart3, roles: ["owner", "manager", "admin"] },
  {
    to: "/notifications",
    label: "Notifikasi",
    icon: Bell,
    roles: ["owner", "manager", "admin", "technician"],
  },
  { to: "/settings", label: "Pengaturan", icon: Settings, roles: ["owner", "manager"] },
] as const;

function useVisibleNavItems(): readonly NavItem[] {
  const { hasRole } = useAuth();
  return navItems.filter((item) => {
    if (item.requiresFlag === "cctv" && !isCctvEnabled()) return false;
    if (item.requiresFlag === "booking" && !isBookingEnabled()) return false;
    return hasRole(item.roles);
  });
}

export function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const items = useVisibleNavItems();
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
        {items.map((item) => {
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
  const items = useVisibleNavItems().slice(0, 5);
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
