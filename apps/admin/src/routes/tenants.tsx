import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import {
  Search,
  Eye,
  Pencil,
  Users,
  Phone,
  Mail,
  UserCheck,
  UserX,
  LogIn,
  Plus,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
import { ResidentFormDialog } from "@/components/forms/ResidentFormDialog";
import { CheckInDialog } from "@/components/forms/CheckInDialog";
import { useResidents, type ResidentRecord } from "@/hooks/useResidents";
import { useUpdateResidentStatus } from "@/hooks/useResidentMutations";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tenants")({ component: TenantsPage });

function StatusPill({ status }: { status: ResidentRecord["residentStatus"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium",
        status === "active" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
      )}
    >
      {status === "active" ? "Aktif" : "Tidak Aktif"}
    </span>
  );
}

function TenantsPage() {
  const [q, setQ] = useState("");
  const [view, setView] = useState<ResidentRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ResidentRecord | null>(null);
  const [statusTarget, setStatusTarget] = useState<{
    resident: ResidentRecord;
    next: ResidentRecord["residentStatus"];
  } | null>(null);
  const [checkInTarget, setCheckInTarget] = useState<ResidentRecord | null>(null);

  const { hasPermission } = useAuth();
  const canManage = hasPermission("resident.manage");
  const canCheckIn = hasPermission("lease.manage");

  const { data, isLoading, error, refetch } = useResidents({ q });
  const statusMut = useUpdateResidentStatus();
  const list = data ?? [];
  const hasFilter = q !== "";

  return (
    <AppShell
      title="Data Penghuni"
      subtitle={data ? `${list.length} penghuni terdaftar` : "Memuat..."}
      actions={
        canManage ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Tambah Penghuni
          </Button>
        ) : null
      }
    >
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama, telepon, atau email..."
          className="pl-9"
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} title="Gagal memuat penghuni" />
      ) : isLoading ? (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title={hasFilter ? "Tidak ada penghuni cocok" : "Belum ada penghuni"}
              description={
                hasFilter
                  ? "Ubah kata kunci pencarian atau kosongkan filter."
                  : canManage
                    ? "Klik 'Tambah Penghuni' untuk onboarding pertama."
                    : "Anda tidak memiliki izin untuk menambah penghuni."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Penghuni</th>
                    <th className="px-5 py-3 font-medium">Kontak</th>
                    <th className="px-5 py-3 font-medium">Gender</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary-soft text-primary flex items-center justify-center font-semibold text-sm">
                            {t.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium">{t.fullName}</p>
                            <p className="text-xs text-muted-foreground">
                              {t.ktpNumber ? `KTP · ${maskKtp(t.ktpNumber)}` : "–"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        <span className="block">{t.phone ?? "–"}</span>
                        <span className="block text-xs">{t.email ?? "–"}</span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground capitalize">
                        {t.gender ?? "–"}
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill status={t.residentStatus} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setView(t)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canManage ? (
                          <Button variant="ghost" size="sm" onClick={() => setEditTarget(t)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-border">
              {list.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setView(t)}
                  className="w-full text-left p-4 flex items-center gap-3"
                >
                  <div className="h-10 w-10 rounded-full bg-primary-soft text-primary flex items-center justify-center font-semibold">
                    {t.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{t.fullName}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {t.phone ?? "–"}
                    </p>
                  </div>
                  <StatusPill status={t.residentStatus} />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detail Penghuni</DialogTitle>
          </DialogHeader>
          {view && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-4 pb-4 border-b">
                <div className="h-14 w-14 rounded-full bg-primary-soft text-primary flex items-center justify-center text-xl font-semibold">
                  {view.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-base">{view.fullName}</p>
                  <StatusPill status={view.residentStatus} />
                </div>
              </div>
              <Row
                icon={<Phone className="h-3.5 w-3.5" />}
                label="Nomor HP"
                value={view.phone ?? "–"}
              />
              <Row
                icon={<Mail className="h-3.5 w-3.5" />}
                label="Email"
                value={view.email ?? "–"}
              />
              <Row label="Nomor KTP" value={view.ktpNumber ? maskKtp(view.ktpNumber) : "–"} />
              <Row label="Gender" value={view.gender ?? "–"} />
              <Row label="Terdaftar" value={new Date(view.createdAt).toLocaleDateString("id-ID")} />
              {view.emergencyContacts.length > 0 && (
                <div className="pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Kontak Darurat</p>
                  <ul className="space-y-1">
                    {view.emergencyContacts.map((c) => (
                      <li key={c.id} className="text-sm">
                        <span className="font-medium">{c.contactName}</span>
                        <span className="text-muted-foreground"> · {c.phone}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-border">
                {canManage ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="sm:flex-1"
                    onClick={() => {
                      setEditTarget(view);
                      setView(null);
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-1" /> Edit
                  </Button>
                ) : null}
                {canCheckIn ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="sm:flex-1"
                    onClick={() => {
                      setCheckInTarget(view);
                      setView(null);
                    }}
                  >
                    <LogIn className="h-4 w-4 mr-1" /> Check-in
                  </Button>
                ) : null}
                {canManage ? (
                  view.residentStatus === "active" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="sm:flex-1"
                      onClick={() => setStatusTarget({ resident: view, next: "inactive" })}
                    >
                      <UserX className="h-4 w-4 mr-1" /> Nonaktifkan
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="sm:flex-1"
                      onClick={() => setStatusTarget({ resident: view, next: "active" })}
                    >
                      <UserCheck className="h-4 w-4 mr-1" /> Aktifkan
                    </Button>
                  )
                ) : null}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ResidentFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ResidentFormDialog
        open={editTarget !== null}
        onOpenChange={(o) => !o && setEditTarget(null)}
        initial={editTarget}
      />

      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(o) => !o && setStatusTarget(null)}
        title={statusTarget?.next === "active" ? "Aktifkan penghuni" : "Nonaktifkan penghuni"}
        description={
          statusTarget
            ? `Konfirmasi ubah status ${statusTarget.resident.fullName} menjadi ${
                statusTarget.next === "active" ? "aktif" : "tidak aktif"
              }?`
            : null
        }
        confirmLabel={statusTarget?.next === "active" ? "Aktifkan" : "Nonaktifkan"}
        destructive={statusTarget?.next === "inactive"}
        pending={statusMut.isPending}
        onConfirm={async () => {
          if (!statusTarget) return;
          try {
            await statusMut.mutateAsync({
              residentId: statusTarget.resident.id,
              status: statusTarget.next,
            });
            setStatusTarget(null);
          } catch {
            // Already toasted by hook.
          }
        }}
      />

      <CheckInDialog
        open={checkInTarget !== null}
        onOpenChange={(o) => !o && setCheckInTarget(null)}
        residentId={checkInTarget?.id ?? null}
        residentName={checkInTarget?.fullName}
      />
    </AppShell>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        {icon} {label}
      </span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function maskKtp(ktp: string): string {
  // Show first 6 and last 4 only — align with PII masking norms (ADR-FE-008).
  if (ktp.length <= 10) return ktp;
  return `${ktp.slice(0, 6)}******${ktp.slice(-4)}`;
}
