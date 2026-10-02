import { useState, type FormEvent } from "react";
import { ApiError } from "@granada-kost/api-client";
import { Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiClient, notifyAuthFailure } from "@/lib/api";

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label} <span className="text-destructive">*</span>
      </label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          maxLength={1024}
          className="min-h-11 pr-12"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1 h-9 w-9"
          aria-label={`${visible ? "Sembunyikan" : "Tampilkan"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function errorMessage(error: unknown) {
  if (ApiError.isApiError(error)) {
    if (error.code === "CURRENT_PASSWORD_INVALID") return "Password saat ini tidak sesuai.";
    if (error.code === "OWNER_EMAIL_ALREADY_USED")
      return "Email sudah digunakan akun lain. Gunakan alamat email berbeda.";
    return error.message;
  }
  return "Perubahan belum tersimpan. Silakan coba lagi.";
}

export function OwnerAccountSettings({ accountEmail }: { accountEmail: string | null }) {
  const [email, setEmail] = useState(accountEmail ?? "");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState<"email" | "password" | null>(null);
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [confirmationError, setConfirmationError] = useState<string>();

  async function changeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setEmailError(undefined);
    setPending("email");
    try {
      const result = await apiClient.patch<{ changed: boolean }>("/auth/owner-email", {
        email: email.trim().toLowerCase(),
        current_password: emailPassword,
      });
      setEmailPassword("");
      if (result.changed) {
        toast.success(
          "Email berhasil diperbarui. Silakan masuk kembali memakai email baru atau nomor telepon Anda.",
        );
        notifyAuthFailure();
      } else toast.info("Email tersebut sudah menjadi email aktif Anda.");
    } catch (error) {
      setEmailError(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPasswordError(undefined);
    setConfirmationError(undefined);
    if (newPassword !== confirmation) {
      setConfirmationError("Konfirmasi password belum sama dengan password baru.");
      document.getElementById("owner-password-confirm")?.focus();
      return;
    }
    setPending("password");
    try {
      await apiClient.patch("/auth/password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      toast.success("Password berhasil diperbarui. Silakan masuk kembali memakai password baru.");
      notifyAuthFailure();
    } catch (error) {
      setPasswordError(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card className="owner-data-surface border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-5 w-5 text-primary" /> Ganti email
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Email baru langsung digunakan untuk masuk. Setelah disimpan, Anda perlu masuk kembali.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void changeEmail(event)} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="owner-email" className="text-sm font-medium">
                Email baru <span className="text-destructive">*</span>
              </label>
              <Input
                id="owner-email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="min-h-11"
              />
            </div>
            <PasswordField
              id="owner-email-password"
              label="Password saat ini"
              value={emailPassword}
              onChange={setEmailPassword}
              autoComplete="current-password"
            />
            {emailError ? (
              <p role="alert" className="text-sm text-destructive">
                {emailError}
              </p>
            ) : null}
            <Button type="submit" disabled={Boolean(pending)} className="min-h-11">
              {pending === "email" ? "Menyimpan…" : "Simpan email"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card className="owner-data-surface border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-5 w-5 text-primary" /> Ganti password
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Gunakan minimal 12 karakter. Setelah berhasil, seluruh sesi keluar dan Anda perlu masuk
            kembali.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void changePassword(event)} className="space-y-4">
            <PasswordField
              id="owner-password-current"
              label="Password lama"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
            />
            <PasswordField
              id="owner-password-new"
              label="Password baru"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              minLength={12}
            />
            <PasswordField
              id="owner-password-confirm"
              label="Konfirmasi password baru"
              value={confirmation}
              onChange={setConfirmation}
              autoComplete="new-password"
              minLength={12}
              error={confirmationError}
            />
            {passwordError ? (
              <p role="alert" className="text-sm text-destructive">
                {passwordError}
              </p>
            ) : null}
            <Button type="submit" disabled={Boolean(pending)} className="min-h-11">
              {pending === "password" ? "Menyimpan…" : "Simpan password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
