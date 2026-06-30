import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@granada-kost/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

type LoginSearch = { next?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (raw: Record<string, unknown>): LoginSearch => ({
    next: typeof raw.next === "string" ? raw.next : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login, status } = useAuth();
  const search = useSearch({ from: "/login" });
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  if (status === "authenticated") {
    void navigate({ to: search.next ?? "/" });
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await login(identifier.trim(), password);
      toast.success("Berhasil masuk");
      void navigate({ to: search.next ?? "/" });
    } catch (err) {
      const msg = ApiError.isApiError(err) ? err.message : "Login gagal";
      toast.error(msg);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-border/60">
        <CardContent className="p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Kos Management</p>
              <p className="text-xs text-muted-foreground">Masuk untuk melanjutkan</p>
            </div>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="identifier">Email atau Nomor Telepon</Label>
              <Input
                id="identifier"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Kata Sandi</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Memproses..." : "Masuk"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
