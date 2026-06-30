import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({
  title = "Belum ada data",
  description = "Data akan muncul di sini setelah tersedia.",
  icon,
  action,
}: Props) {
  return (
    <div className="flex min-h-[40vh] w-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
