import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, User } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

// Header user menu. Backed by /auth/me from M11B. Logout is wired to useAuth().logout
// which calls /auth/logout, clears the access token, and resets the query cache.
export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  const initials = (user?.name ?? user?.email ?? "U")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const primaryRole = user?.roles?.[0] ?? "-";

  const onLogout = async () => {
    if (pending) return;
    setPending(true);
    try {
      await logout();
      toast.success("Berhasil keluar");
    } catch {
      // logout() already swallows ApiError and clears local state.
      toast.success("Sesi dibersihkan");
    } finally {
      setPending(false);
      void navigate({ to: "/login" });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 gap-2 px-2" aria-label="Akun pengguna">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
            {initials}
          </span>
          <span className="hidden text-left lg:block">
            <span className="block text-xs font-semibold leading-tight">
              {user?.name ?? user?.email ?? "Pengguna"}
            </span>
            <span className="block text-[10px] text-muted-foreground capitalize leading-tight">
              {primaryRole.replace("_", " ")}
            </span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm">{user?.name ?? "Pengguna"}</span>
          {user?.email ? <span className="text-xs text-muted-foreground">{user.email}</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="text-xs">
          <User className="mr-2 h-3.5 w-3.5" /> Role: {primaryRole.replace("_", " ")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void onLogout();
          }}
          className="text-destructive focus:text-destructive"
          disabled={pending}
        >
          <LogOut className="mr-2 h-3.5 w-3.5" />
          {pending ? "Memproses..." : "Keluar"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
