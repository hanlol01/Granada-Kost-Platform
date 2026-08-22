import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@granada-kost/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      void navigate({ to: search.next ?? "/" });
    }
  }, [status, navigate, search.next]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await login(identifier.trim(), password);
      toast.success("Berhasil masuk");
    } catch (err) {
      const msg = ApiError.isApiError(err) ? err.message : "Login gagal";
      toast.error(msg);
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-background p-3 sm:p-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-border/70 bg-card shadow-2xl shadow-black/10 sm:min-h-[calc(100dvh-3rem)] lg:grid-cols-[minmax(0,0.92fr)_minmax(360px,1.08fr)]">
        <section className="flex items-center justify-center px-6 py-12 sm:px-12 lg:px-16">
          <div className="w-full max-w-md">
            <div className="mb-10" aria-label="Kostation">
              <img
                src="/images/brand/kostation-logo-gold.png"
                alt="Kostation"
                className="block h-19 w-auto max-w-[18rem] object-contain object-left dark:hidden"
              />
              <img
                src="/images/brand/kostation-logo-white.png"
                alt="Kostation"
                className="hidden h-19 w-auto max-w-[18rem] object-contain object-left dark:block"
              />
            </div>
            <div className="mb-8 space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Selamat datang</h1>
              <p className="text-sm leading-6 text-muted-foreground">
                Masuk untuk melihat hunian, tagihan, dan layanan Anda.
              </p>
            </div>
            <form className="space-y-5" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="identifier">Email atau Nomor Telepon</Label>
                <p className="text-xs text-muted-foreground">
                  Nomor telepon dapat ditulis dengan awalan 08 atau 62.
                </p>
                <Input
                  id="identifier"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="h-12 rounded-xl bg-background/70 px-4"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Kata Sandi</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 rounded-xl bg-background/70 px-4 pr-12"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1.5 top-1/2 h-9 w-9 -translate-y-1/2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button
                type="submit"
                className="h-12 w-full rounded-xl text-sm font-semibold shadow-lg shadow-primary/20"
                disabled={pending}
              >
                {pending ? "Memproses..." : "Masuk"}
              </Button>
            </form>
          </div>
        </section>
        <aside className="relative hidden min-h-[620px] overflow-hidden bg-muted lg:block">
          <img
            src="/images/auth/kostation-login-hero.jpg"
            alt="Suasana hunian Kostation"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/10" />
          <div className="absolute inset-x-10 bottom-10 rounded-2xl border border-white/20 bg-black/25 p-6 text-white backdrop-blur-md">
            <p className="text-lg font-medium leading-7">
              Semua informasi hunian Anda dalam satu tempat.
            </p>
            <p className="mt-2 text-sm text-white/75">Kostation · portal penghuni</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
