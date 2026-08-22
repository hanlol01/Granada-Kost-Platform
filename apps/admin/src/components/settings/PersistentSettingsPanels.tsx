import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { Loader2, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/state/ErrorState";
import { ForbiddenState } from "@/components/state/ForbiddenState";
import { LoadingState } from "@/components/state/LoadingState";
import {
  adminPropertyProfileToDraft,
  profilesEqual,
  reconcileAdminPropertyProfileDraft,
  reconcilePersonalPreferenceDraft,
  validateAdminPropertyProfileDraft,
  type AdminPropertyProfileDraft,
  type PersonalPreferenceSnapshot,
} from "@/lib/admin-settings";
import type { AdminSettingsViewModel } from "@/hooks/useAdminSettings";

const EMPTY_PROFILE: AdminPropertyProfileDraft = {
  name: "",
  address: "",
  phone: "",
  email: "",
};

type FieldProps = {
  id: keyof AdminPropertyProfileDraft;
  label: string;
  hint: string;
  error?: string;
  children: ReactNode;
};

function SettingsField({ id, label, hint, error, children }: FieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <p id={hintId} className="break-words text-xs text-muted-foreground">
        {hint}
      </p>
      {error ? (
        <p id={errorId} role="alert" className="break-words text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AppearancePanel() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const isDark = localStorage.getItem("theme") !== "light";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggleDark = (next: boolean) => {
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <Card className="min-w-0 max-w-full">
      <CardHeader>
        <CardTitle className="text-base">Tampilan</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium text-foreground">Mode Gelap</p>
            <p id="theme-description" className="break-words text-sm text-muted-foreground">
              Tema disimpan pada perangkat ini dan tidak mengubah pengaturan properti.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {dark ? (
              <Moon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            ) : (
              <Sun className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
            <Switch
              checked={dark}
              onCheckedChange={toggleDark}
              aria-label={dark ? "Nonaktifkan mode gelap" : "Aktifkan mode gelap"}
              aria-describedby="theme-description"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PersistentSettingsPanels({ settings }: { settings: AdminSettingsViewModel }) {
  const [profileDraft, setProfileDraft] = useState<AdminPropertyProfileDraft>(EMPTY_PROFILE);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const profileSnapshotRef = useRef<AdminSettingsViewModel["profile"]>(null);
  const preferenceSnapshotRef = useRef<PersonalPreferenceSnapshot | null>(null);
  const profileErrors = useMemo(
    () => validateAdminPropertyProfileDraft(profileDraft),
    [profileDraft],
  );

  useEffect(() => {
    const previousSnapshot = profileSnapshotRef.current;
    profileSnapshotRef.current = settings.profile;
    setProfileDraft((currentDraft) =>
      reconcileAdminPropertyProfileDraft(previousSnapshot, currentDraft, settings.profile),
    );
  }, [settings.profile]);
  useEffect(() => {
    const nextSnapshot =
      settings.preference && settings.preferenceAccountId
        ? {
            accountId: settings.preferenceAccountId,
            preference: settings.preference,
          }
        : null;
    const previousSnapshot = preferenceSnapshotRef.current;
    preferenceSnapshotRef.current = nextSnapshot;
    setEmailEnabled((currentValue) =>
      reconcilePersonalPreferenceDraft(previousSnapshot, currentValue, nextSnapshot),
    );
  }, [settings.preference, settings.preferenceAccountId]);

  if (!settings.hasRouteAccess) {
    return (
      <ForbiddenState description="Pengaturan properti hanya tersedia untuk owner atau manager dengan izin property.manage." />
    );
  }

  const profileDirty = settings.profile ? !profilesEqual(settings.profile, profileDraft) : false;
  const profileValid = Object.keys(profileErrors).length === 0;
  const preferenceDirty = settings.preference
    ? settings.preference.emailEnabled !== emailEnabled
    : false;

  const updateField =
    (field: keyof AdminPropertyProfileDraft) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setProfileDraft((current) => ({ ...current, [field]: event.target.value }));
    };
  const resetProfile = () => {
    if (!settings.profile) return;
    setProfileDraft({
      name: settings.profile.name,
      address: settings.profile.address,
      phone: settings.profile.phone ?? "",
      email: settings.profile.email ?? "",
    });
  };
  const submitProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profileValid || !profileDirty || settings.profileSaving) return;
    void settings
      .saveProfile(profileDraft)
      .then((profile) => setProfileDraft(adminPropertyProfileToDraft(profile)))
      .catch(() => undefined);
  };
  const submitPreference = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!preferenceDirty || settings.preferenceSaving) return;
    void settings
      .savePreference(emailEnabled)
      .then((preference) => setEmailEnabled(preference.emailEnabled))
      .catch(() => undefined);
  };

  return (
    <div className="grid min-w-0 max-w-full grid-cols-1 gap-5">
      <section aria-labelledby="property-profile-title" className="min-w-0 max-w-full">
        <Card className="min-w-0 max-w-full">
          <CardHeader>
            <CardTitle id="property-profile-title" className="text-base">
              Profil Properti
            </CardTitle>
            <p className="break-words text-sm text-muted-foreground">
              Informasi kontak yang berlaku untuk properti aktif.
            </p>
          </CardHeader>
          <CardContent>
            {!settings.hasActiveProperty ? (
              <div role="alert" className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="font-medium text-foreground">Properti aktif belum tersedia</p>
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  Pilih properti yang berwenang sebelum mengubah profil.
                </p>
              </div>
            ) : settings.profileForbidden ? (
              <ForbiddenState description="Server menolak akses ke profil properti ini." />
            ) : settings.profileLoading ? (
              <LoadingState label="Memuat profil properti..." />
            ) : settings.profileError ? (
              <ErrorState
                error={settings.profileError}
                onRetry={() => void settings.retryProfile()}
                title="Gagal memuat profil properti"
              />
            ) : settings.profile ? (
              <form onSubmit={submitProfile} className="space-y-5" noValidate>
                <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                  <SettingsField
                    id="name"
                    label="Nama Properti"
                    hint="Nama operasional yang dikenali pengelola."
                    error={profileErrors.name}
                  >
                    <Input
                      id="name"
                      value={profileDraft.name}
                      onChange={updateField("name")}
                      aria-invalid={Boolean(profileErrors.name)}
                      aria-describedby={`name-hint${profileErrors.name ? " name-error" : ""}`}
                      disabled={settings.profileSaving}
                    />
                  </SettingsField>
                  <SettingsField
                    id="phone"
                    label="Nomor Kontak"
                    hint="Opsional. Nomor kontak resmi properti."
                    error={profileErrors.phone}
                  >
                    <Input
                      id="phone"
                      value={profileDraft.phone}
                      onChange={updateField("phone")}
                      aria-invalid={Boolean(profileErrors.phone)}
                      aria-describedby={`phone-hint${profileErrors.phone ? " phone-error" : ""}`}
                      disabled={settings.profileSaving}
                    />
                  </SettingsField>
                  <div className="min-w-0 md:col-span-2">
                    <SettingsField
                      id="address"
                      label="Alamat"
                      hint="Alamat operasional properti yang aktif."
                      error={profileErrors.address}
                    >
                      <Textarea
                        id="address"
                        value={profileDraft.address}
                        onChange={updateField("address")}
                        aria-invalid={Boolean(profileErrors.address)}
                        aria-describedby={`address-hint${profileErrors.address ? " address-error" : ""}`}
                        disabled={settings.profileSaving}
                      />
                    </SettingsField>
                  </div>
                  <div className="min-w-0 md:col-span-2">
                    <SettingsField
                      id="email"
                      label="Email Properti"
                      hint="Opsional. Email kontak properti, bukan credential akun."
                      error={profileErrors.email}
                    >
                      <Input
                        id="email"
                        type="email"
                        value={profileDraft.email}
                        onChange={updateField("email")}
                        aria-invalid={Boolean(profileErrors.email)}
                        aria-describedby={`email-hint${profileErrors.email ? " email-error" : ""}`}
                        disabled={settings.profileSaving}
                      />
                    </SettingsField>
                  </div>
                </div>
                {settings.profileMutationError ? (
                  <p role="alert" className="break-words text-sm text-destructive">
                    Profil belum tersimpan. Periksa data lalu coba lagi.
                  </p>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 sm:min-h-9"
                    onClick={resetProfile}
                    disabled={!profileDirty || settings.profileSaving}
                  >
                    Reset
                  </Button>
                  <Button
                    type="submit"
                    className="min-h-11 sm:min-h-9"
                    disabled={!profileValid || !profileDirty || settings.profileSaving}
                  >
                    {settings.profileSaving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    Simpan Profil
                  </Button>
                </div>
              </form>
            ) : (
              <p role="alert" className="text-sm text-muted-foreground">
                Profil properti belum tersedia.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="account-preference-title" className="min-w-0 max-w-full">
        <Card className="min-w-0 max-w-full">
          <CardHeader>
            <CardTitle id="account-preference-title" className="text-base">
              Preferensi Akun
            </CardTitle>
            <p className="break-words text-sm text-muted-foreground">
              Preferensi ini mengikuti akun Anda dan tidak berubah saat berpindah properti.
            </p>
          </CardHeader>
          <CardContent>
            {settings.preferenceForbidden ? (
              <ForbiddenState description="Server menolak akses ke preferensi akun." />
            ) : settings.preferenceLoading ? (
              <LoadingState label="Memuat preferensi akun..." />
            ) : settings.preferenceError ? (
              <ErrorState
                error={settings.preferenceError}
                onRetry={() => void settings.retryPreference()}
                title="Gagal memuat preferensi akun"
              />
            ) : settings.preference ? (
              <form onSubmit={submitPreference} className="space-y-5">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="email-notification">Notifikasi Email</Label>
                    <p
                      id="email-notification-description"
                      className="break-words text-sm text-muted-foreground"
                    >
                      Terima pemberitahuan operasional melalui email akun.
                    </p>
                  </div>
                  <Switch
                    id="email-notification"
                    checked={emailEnabled}
                    onCheckedChange={setEmailEnabled}
                    aria-label="Aktifkan notifikasi email"
                    aria-describedby="email-notification-description"
                    disabled={settings.preferenceSaving}
                  />
                </div>
                {settings.preferenceMutationError ? (
                  <p role="alert" className="break-words text-sm text-destructive">
                    Preferensi belum tersimpan. Coba lagi tanpa mengubah pilihan Anda.
                  </p>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 sm:min-h-9"
                    onClick={() =>
                      setEmailEnabled(settings.preference?.emailEnabled ?? emailEnabled)
                    }
                    disabled={!preferenceDirty || settings.preferenceSaving}
                  >
                    Reset
                  </Button>
                  <Button
                    type="submit"
                    className="min-h-11 sm:min-h-9"
                    disabled={!preferenceDirty || settings.preferenceSaving}
                  >
                    {settings.preferenceSaving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    Simpan Preferensi
                  </Button>
                </div>
              </form>
            ) : (
              <p role="alert" className="text-sm text-muted-foreground">
                Preferensi akun belum tersedia.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="appearance-title" className="min-w-0 max-w-full">
        <span id="appearance-title" className="sr-only">
          Tampilan
        </span>
        <AppearancePanel />
      </section>
    </div>
  );
}
