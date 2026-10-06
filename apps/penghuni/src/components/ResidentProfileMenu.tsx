import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";

export function ResidentProfileMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  if (!user) return null;

  const displayName = user.displayName?.trim() || user.name?.trim() || user.email || "Penghuni";
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Menu profil"
          title="Menu profil"
          className="h-11 w-11 rounded-full p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
            {initials}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        <DropdownMenuLabel className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-medium text-muted-foreground">Nama penghuni</span>
          <span className="break-words text-sm">{displayName}</span>
          {user.email ? (
            <span className="break-all text-xs text-muted-foreground">{user.email}</span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="text-xs">
          <UserRound aria-hidden="true" /> Role: Penghuni
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate({ to: "/profile" })}>
          <UserRound aria-hidden="true" /> Profil Saya
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void handleLogout();
          }}
          className="text-destructive focus:text-destructive"
          disabled={pending}
        >
          <LogOut aria-hidden="true" /> {pending ? "Memproses..." : "Keluar"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
