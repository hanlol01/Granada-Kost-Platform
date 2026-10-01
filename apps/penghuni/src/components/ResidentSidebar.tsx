import { useEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Bell, Car, Home, Menu, Megaphone, Receipt, User, Wrench } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const items = [
  { to: "/", label: "Beranda", icon: Home },
  { to: "/billing", label: "Tagihan dan pembayaran", icon: Receipt },
  { to: "/complaints", label: "Komplain", icon: Wrench },
  { to: "/info", label: "Informasi", icon: Megaphone },
  { to: "/vehicles", label: "Kendaraan", icon: Car },
  { to: "/notifications", label: "Notifikasi", icon: Bell },
  { to: "/profile", label: "Profil", icon: User },
] as const;

export function ResidentSidebar() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Buka menu navigasi"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Menu className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-[min(88vw,20rem)] flex-col p-0">
        <SheetHeader className="border-b border-border px-5 py-6 text-left">
          <SheetTitle>Menu Penghuni</SheetTitle>
          <SheetDescription>Akses informasi dan kebutuhan hunian Anda.</SheetDescription>
        </SheetHeader>
        <nav
          aria-label="Navigasi utama"
          className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          {items.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === to : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-3 text-sm ${active ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-accent"}`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
