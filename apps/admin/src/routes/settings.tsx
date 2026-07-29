import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { PersistentSettingsPanels } from "@/components/settings/PersistentSettingsPanels";
import { useAdminSettings } from "@/hooks/useAdminSettings";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const settings = useAdminSettings();

  return (
    <AppShell title="Pengaturan" subtitle="Kelola profil properti dan preferensi akun secara aman">
      <PersistentSettingsPanels settings={settings} />
    </AppShell>
  );
}
