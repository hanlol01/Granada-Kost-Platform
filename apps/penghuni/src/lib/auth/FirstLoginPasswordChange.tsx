import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChangePassword } from "@/hooks/usePenghuniProfile";
import { useAuth } from "./useAuth";

export function FirstLoginPasswordChange() {
  const { login, logout, user } = useAuth();
  const navigate = useNavigate();
  const residentName = user?.displayName?.trim() || user?.name?.trim() || "akun Penghuni";
  const changePassword = useChangePassword();
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isContinuing, setIsContinuing] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);

    if (newPassword.length < 12) {
      setValidationError("Password baru minimal 12 karakter.");
      return;
    }
    if (newPassword !== confirmation) {
      setValidationError("Konfirmasi password baru belum sama.");
      return;
    }

    let passwordSaved = false;
    try {
      await changePassword.mutateAsync({
        new_password: newPassword,
      });
      passwordSaved = true;
      setIsContinuing(true);

      const identifier = user?.phone?.trim() || user?.email?.trim();
      if (!identifier) throw new Error("Resident login identifier is unavailable.");

      await login(identifier, newPassword);
      setNewPassword("");
      setConfirmation("");
      await navigate({ to: "/" });
    } catch {
      if (!passwordSaved) return;
      try {
        await logout();
      } catch {
        // logout clears the local session even when the old session was revoked.
      }
      void navigate({ to: "/login" });
      toast.error(
        "Password baru tersimpan, tetapi sesi belum dapat dibuka. Silakan masuk dengan password baru.",
      );
      return;
    }
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.16),transparent_52%)]"
        aria-hidden="true"
      />
      <Card className="relative w-full max-w-lg border-primary/25 shadow-xl shadow-black/10">
        <CardHeader className="space-y-4 pb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl">Buat password pribadi Anda</CardTitle>
            <CardDescription className="text-sm leading-6">
              Ini adalah akses pertama untuk {residentName}. Ganti
              password sementara sebelum membuka informasi hunian.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={submit} noValidate>
            <PasswordField
              id="new-password"
              label="Password baru"
              value={newPassword}
              visible={showNew}
              onToggle={() => setShowNew((value) => !value)}
              onChange={setNewPassword}
              autoComplete="new-password"
              description="Gunakan minimal 12 karakter."
            />
            <PasswordField
              id="new-password-confirmation"
              label="Ulangi password baru"
              value={confirmation}
              visible={showConfirmation}
              onToggle={() => setShowConfirmation((value) => !value)}
              onChange={setConfirmation}
              autoComplete="new-password"
              invalid={Boolean(validationError)}
            />

            {validationError ? (
              <div
                role="alert"
                className="rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
              >
                {validationError}
              </div>
            ) : null}

            <div className="flex gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <p className="leading-6">
                Setelah password diperbarui, Anda langsung diarahkan ke Beranda. Sesi lama pada
                perangkat lain ditutup.
              </p>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={changePassword.isPending || isContinuing}
            >
              {changePassword.isPending || isContinuing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound className="h-4 w-4" aria-hidden="true" />
              )}
              {isContinuing ? "Membuka Beranda..." : "Simpan password baru"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function PasswordField({
  id,
  label,
  value,
  visible,
  onToggle,
  onChange,
  autoComplete,
  description,
  invalid = false,
}: {
  id: string;
  label: string;
  value: string;
  visible: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  autoComplete: string;
  description?: string;
  invalid?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          className="h-11 pr-12"
          aria-invalid={invalid}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={
            visible ? `Sembunyikan ${label.toLowerCase()}` : `Tampilkan ${label.toLowerCase()}`
          }
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {description ? (
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
