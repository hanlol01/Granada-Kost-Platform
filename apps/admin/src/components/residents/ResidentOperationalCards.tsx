import { Link } from "@tanstack/react-router";
import { Bell, Car, Eye, MessageSquare, RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { VehicleHistoryDialog } from "@/components/forms/VehicleHistoryDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useComplaints, type ComplaintRecord } from "@/hooks/useComplaints";
import { useResidentReminderHistory } from "@/hooks/useResidentReminderHistory";
import { useVehicles, type VehicleRecord } from "@/hooks/useVehicles";
import { reminderHistoryStatusLabels } from "@/lib/admin-reminder-history";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";

const vehicleTypeLabel = (vehicle: VehicleRecord) =>
  vehicle.customVehicleType ||
  {
    motorcycle: "Motor",
    car: "Mobil",
    bicycle: "Sepeda",
    electric_scooter: "Skuter listrik",
    other: "Lainnya",
  }[vehicle.vehicleType];

const complaintStatusLabel = (status: ComplaintRecord["complaintStatus"]) =>
  ({
    submitted: "Menunggu",
    acknowledged: "Sudah dilihat",
    in_progress: "Diproses",
    on_hold: "Ditunda",
    escalated: "Diusulkan eskalasi",
    resolved: "Selesai",
    reopened: "Dibuka kembali",
    closed: "Ditutup",
    cancelled: "Dibatalkan",
  })[status];

const leaseReminderMilestoneLabel = (milestone: "h60" | "h30" | "h14") =>
  ({ h60: "H-60", h30: "H-30", h14: "H-14" })[milestone];

export function ResidentOperationalCards({ residentId }: { residentId: string }) {
  const { hasPermission } = useAuth();
  const canReadVehicles = hasPermission("vehicle.manage");
  const canReadComplaints = hasPermission("complaint.manage");
  const canReadReminders = hasPermission("billing.manage");
  const vehicles = useVehicles({ residentId, limit: 20, enabled: canReadVehicles });
  const complaints = useComplaints({ residentId, limit: 20, enabled: canReadComplaints });
  const reminders = useResidentReminderHistory(residentId, {
    limit: 20,
    enabled: canReadReminders,
  });
  const [vehicleTarget, setVehicleTarget] = useState<VehicleRecord | null>(null);
  const [complaintTarget, setComplaintTarget] = useState<ComplaintRecord | null>(null);

  return (
    <>
      <section className="grid gap-5 lg:grid-cols-3" aria-label="Operasional terkait">
        <OperationalCard title="Kendaraan & parkir" icon={<Car className="h-5 w-5" />}>
          <QueryBody
            loading={vehicles.isLoading}
            error={vehicles.error}
            onRetry={() => void vehicles.refetch()}
            empty="Belum ada kendaraan yang terhubung dengan penghuni ini."
            hasAccess={canReadVehicles}
            hasData={Boolean(vehicles.data?.length)}
          >
            <div className="divide-y divide-border">
              {(vehicles.data ?? []).slice(0, 3).map((vehicle) => (
                <div key={vehicle.id} className="py-3 first:pt-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {[vehicle.brand, vehicle.plateNumber].filter(Boolean).join(" · ") ||
                          vehicle.vehicleCode}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {vehicleTypeLabel(vehicle)}
                        {vehicle.currentRoomNumber ? ` · Kamar ${vehicle.currentRoomNumber}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-primary/40 text-primary hover:bg-primary/10"
                      onClick={() => setVehicleTarget(vehicle)}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" /> Detail
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {(vehicles.data?.length ?? 0) > 3 ? (
              <Button variant="link" className="mt-2 h-auto px-0" asChild>
                <Link to="/vehicles" search={{ tab: "vehicles" }}>
                  Lihat semua {vehicles.data?.length} kendaraan
                </Link>
              </Button>
            ) : null}
          </QueryBody>
        </OperationalCard>

        <OperationalCard title="Komplain" icon={<MessageSquare className="h-5 w-5" />}>
          <QueryBody
            loading={complaints.isLoading}
            error={complaints.error}
            onRetry={() => void complaints.refetch()}
            empty="Belum ada komplain yang terhubung dengan penghuni ini."
            hasAccess={canReadComplaints}
            hasData={Boolean(complaints.data?.length)}
          >
            <div className="divide-y divide-border">
              {(complaints.data ?? []).slice(0, 3).map((complaint) => (
                <div key={complaint.id} className="py-3 first:pt-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{complaint.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {complaint.complaintCode} ·{" "}
                        {complaintStatusLabel(complaint.complaintStatus)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-primary/40 text-primary hover:bg-primary/10"
                      onClick={() => setComplaintTarget(complaint)}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" /> Detail
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {(complaints.data?.length ?? 0) > 3 ? (
              <Button variant="link" className="mt-2 h-auto px-0" asChild>
                <Link to="/complaints">Lihat semua {complaints.data?.length} komplain</Link>
              </Button>
            ) : null}
          </QueryBody>
        </OperationalCard>

        <OperationalCard title="Notifikasi & reminder" icon={<Bell className="h-5 w-5" />}>
          <QueryBody
            loading={reminders.isLoading}
            error={reminders.error}
            onRetry={() => void reminders.refetch()}
            empty="Belum ada riwayat reminder untuk penghuni ini."
            hasAccess={canReadReminders}
            hasData={Boolean(reminders.data?.data.length)}
          >
            <div className="divide-y divide-border">
              {(reminders.data?.data ?? []).slice(0, 3).map((reminder) => (
                <div key={reminder.id} className="py-3 first:pt-0">
                  <p className="font-medium">
                    {reminderHistoryStatusLabels[reminder.outcome_status]}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(reminder.created_at.slice(0, 10))} ·{" "}
                    {reminder.reminder_kind === "lease_ending" && reminder.milestone
                      ? `${leaseReminderMilestoneLabel(reminder.milestone)} · pengingat masa sewa`
                      : `${reminder.invoice_count} tagihan`}
                  </p>
                </div>
              ))}
            </div>
            <Button variant="link" className="mt-2 h-auto px-0" asChild>
              <Link to="/reminders/history">Buka riwayat reminder</Link>
            </Button>
          </QueryBody>
        </OperationalCard>
      </section>

      <VehicleHistoryDialog
        vehicle={vehicleTarget}
        open={Boolean(vehicleTarget)}
        onOpenChange={(open) => !open && setVehicleTarget(null)}
      />

      <Dialog
        open={Boolean(complaintTarget)}
        onOpenChange={(open) => !open && setComplaintTarget(null)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{complaintTarget?.complaintCode ?? "Detail komplain"}</DialogTitle>
            <DialogDescription>Rincian komplain yang terhubung dengan penghuni.</DialogDescription>
          </DialogHeader>
          {complaintTarget ? (
            <div className="space-y-4">
              <div>
                <p className="font-medium">{complaintTarget.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {complaintTarget.description}
                </p>
              </div>
              <dl className="grid gap-3 rounded-xl border border-border p-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="mt-1 font-medium">
                    {complaintStatusLabel(complaintTarget.complaintStatus)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Prioritas</dt>
                  <dd className="mt-1 font-medium capitalize">{complaintTarget.priority}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Kamar</dt>
                  <dd className="mt-1 font-medium">{complaintTarget.snapshotRoomNumber ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Tanggal dilaporkan</dt>
                  <dd className="mt-1 font-medium">
                    {formatDate(complaintTarget.submittedAt.slice(0, 10))}
                  </dd>
                </div>
              </dl>
              <Button className="w-full sm:w-auto" asChild>
                <Link to="/complaints">Buka ruang kerja komplain</Link>
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function OperationalCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="text-primary">{icon}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function QueryBody({
  loading,
  error,
  onRetry,
  empty,
  hasAccess,
  hasData,
  children,
}: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  empty: string;
  hasAccess: boolean;
  hasData: boolean;
  children: ReactNode;
}) {
  if (!hasAccess)
    return <p className="text-sm text-muted-foreground">Akun ini tidak memiliki akses data.</p>;
  if (loading)
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  if (error)
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Data terkait belum berhasil dimuat.</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Coba lagi
        </Button>
      </div>
    );
  if (!hasData) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return <>{children}</>;
}
