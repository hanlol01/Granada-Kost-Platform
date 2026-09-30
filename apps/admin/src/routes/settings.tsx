import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { GeneralSettingsPanels } from "@/components/settings/GeneralSettingsPanels";
import { PersistentSettingsPanels } from "@/components/settings/PersistentSettingsPanels";
import { useAdminSettings } from "@/hooks/useAdminSettings";
import { useGeneralSettings } from "@/hooks/useGeneralSettings";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const settings = useGeneralSettings();
  const legacySettings = useAdminSettings();
  const { user } = useAuth();

  if (!user?.roles.includes("admin")) {
    return (
      <AppShell title="Pengaturan" subtitle="Kelola profil properti dan preferensi akun">
        <PersistentSettingsPanels settings={legacySettings} />
      </AppShell>
    );
  }

  return (
    <AppShell title="Pengaturan Umum" subtitle="Kelola identitas organisasi dan dokumen resmi secara aman">
      <GeneralSettingsPanels settings={settings} />
    </AppShell>
  );
}
