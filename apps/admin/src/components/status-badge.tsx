import { cn } from "@/lib/utils";
import type { PaymentStatus, RoomStatus } from "@/lib/mock-data";

export function StatusBadge({ status }: { status: RoomStatus | PaymentStatus }) {
  const map: Record<string, { label: string; cls: string }> = {
    occupied: { label: "Terisi", cls: "bg-primary-soft text-primary" },
    vacant: { label: "Kosong", cls: "bg-success/15 text-success" },
    maintenance: { label: "Maintenance", cls: "bg-warning/20 text-warning-foreground" },
    paid: { label: "Lunas", cls: "bg-success/15 text-success" },
    unpaid: { label: "Belum Lunas", cls: "bg-warning/20 text-warning-foreground" },
    overdue: { label: "Jatuh Tempo", cls: "bg-destructive/15 text-destructive" },
  };
  const item = map[status];
  return (
    <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium", item.cls)}>
      {item.label}
    </span>
  );
}
