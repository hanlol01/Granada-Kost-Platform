import { Construction } from "lucide-react";
import { AppShell } from "./app-shell";
import { EmptyState } from "@/components/state";

export function RouteFoundationPage({
  title,
  subtitle,
  milestone,
}: {
  title: string;
  subtitle: string;
  milestone: string;
}) {
  return (
    <AppShell title={title} subtitle={subtitle}>
      <EmptyState
        icon={<Construction className="h-5 w-5" />}
        title="Fondasi route sudah siap"
        description={"UI lengkap akan tersedia pada " + milestone + "."}
      />
    </AppShell>
  );
}
