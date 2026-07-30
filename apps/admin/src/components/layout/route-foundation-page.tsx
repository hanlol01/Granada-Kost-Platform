import { Construction } from "lucide-react";
import { useId } from "react";
import { AppShell } from "./app-shell";
import { EmptyState } from "@/components/state";

export function RouteFoundationPage({
  title,
  subtitle,
  milestone,
  stateTitle = "Layanan belum tersedia",
  description,
}: {
  title: string;
  subtitle: string;
  milestone: string;
  stateTitle?: string;
  description?: string;
}) {
  const headingId = useId();
  return (
    <AppShell title={title} subtitle={subtitle}>
      <section aria-labelledby={headingId}>
        <h2 id={headingId} className="sr-only">
          {stateTitle}
        </h2>
        <EmptyState
          icon={<Construction className="h-5 w-5" />}
          title={stateTitle}
          description={description ?? `Layanan lengkap akan tersedia pada ${milestone}.`}
        />
      </section>
    </AppShell>
  );
}
