import { Construction } from "lucide-react";
import { useId } from "react";
import { AppShell } from "./app-shell";
import { EmptyState } from "@/components/state";
import { NoticeAlert, type NoticeAlertTone } from "@/components/ui/notice-alert";

export function RouteFoundationPage({
  title,
  subtitle,
  milestone,
  stateTitle = "Layanan belum tersedia",
  description,
  notice,
}: {
  title: string;
  subtitle: string;
  milestone: string;
  stateTitle?: string;
  description?: string;
  notice?: { title: string; description: string; tone?: NoticeAlertTone };
}) {
  const headingId = useId();
  return (
    <AppShell title={title} subtitle={subtitle}>
      <div className="space-y-4">
        {notice ? (
          <NoticeAlert tone={notice.tone} title={notice.title} description={notice.description} />
        ) : null}
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
      </div>
    </AppShell>
  );
}
