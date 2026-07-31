import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  CalendarPlus,
  Eye,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  UserCheck,
  UserRoundCog,
  Users,
  UserX,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
import { ResidentFormDialog } from "@/components/forms/ResidentFormDialog";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useProvisionResidentAccount, useUpdateResidentStatus } from "@/hooks/useResidentMutations";
import {
  useResidentDetail,
  useResidents,
  type ResidentListRecord,
  type ResidentRecord,
} from "@/hooks/useResidents";
import { useAuth } from "@/lib/auth";
import { isAdminUxLeaseEnabled } from "@/lib/features";
import { newIdempotencyKey } from "@/lib/idempotency";
import { useProperty } from "@/lib/property";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tenants")({ component: TenantsPage });

const PAGE_SIZE = 20;

function ResidentStatusPill({ status }: { status: ResidentListRecord["residentStatus"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        status === "active" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
      )}
    >
      {status === "active" ? "Aktif" : "Diarsipkan"}
    </span>
  );
}

function AccountStatusPill({ status }: { status: ResidentListRecord["accountStatus"] }) {
  const label = {
    active: "Akun aktif",
    inactive: "Akun nonaktif",
    suspended: "Akun ditangguhkan",
    not_provisioned: "Belum memiliki akun",
  }[status];
  return (
    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
      {label}
    </span>
  );
}

function leaseDuration(record: ResidentListRecord): string {
  if (record.leaseAuthorityCount > 1) return "Perlu rekonsiliasi";
  if (!record.leaseStart) return "Belum ada sewa aktif";
  if (!record.leaseEnd) return `Sejak ${formatDate(record.leaseStart)}`;
  return `${formatDate(record.leaseStart)} – ${formatDate(record.leaseEnd)}`;
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function TenantsPage() {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [viewId, setViewId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ResidentRecord | null>(null);
  const [statusTarget, setStatusTarget] = useState<{
    resident: ResidentRecord;
    next: ResidentRecord["residentStatus"];
  } | null>(null);
  const [accountKey, setAccountKey] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const detailScopeRef = useRef<{ propertyId: string | null; residentId: string | null }>({
    propertyId: null,
    residentId: null,
  });

  const { user, hasPermission } = useAuth();
  const { currentPropertyId } = useProperty();
  const canManage = hasPermission("resident.manage");
  const hasLeaseAuthority =
    (user?.roles ?? []).some((role) => ["owner", "manager", "admin"].includes(role)) &&
    hasPermission("lease.read") &&
    hasPermission("lease.manage") &&
    Boolean(currentPropertyId);
  const leaseCreateEnabled = hasLeaseAuthority && isAdminUxLeaseEnabled();

  const residents = useResidents({ q, limit: PAGE_SIZE, offset });
  const detail = useResidentDetail(viewId);
  const statusMutation = useUpdateResidentStatus();
  const accountMutation = useProvisionResidentAccount();
  const list = residents.data?.data ?? [];
  const total = residents.data?.meta.total ?? 0;
  const hasFilter = q.trim() !== "";

  useEffect(() => {
    setOffset(0);
    setViewId(null);
    setAccountKey(null);
    setTemporaryPassword(null);
    setCreateOpen(false);
    setEditTarget(null);
    setStatusTarget(null);
  }, [currentPropertyId]);

  const openDetail = (residentId: string) => {
    setViewId(residentId);
    setAccountKey(newIdempotencyKey());
    setTemporaryPassword(null);
  };

  const closeDetail = () => {
    setViewId(null);
    setAccountKey(null);
    setTemporaryPassword(null);
  };

  const detailRecord = detail.data ?? null;
  detailScopeRef.current = { propertyId: currentPropertyId, residentId: viewId };

  return (
    <AppShell
      title="Data Penghuni"
      subtitle={residents.data ? `${total} penghuni terdaftar` : "Memuat..."}
      actions={
        canManage ? (
          <Button onClick={() => setCreateOpen(true)} className="min-h-11">
            <Plus className="mr-1 h-4 w-4" /> Tambah Penghuni
          </Button>
        ) : null
      }
    >
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setOffset(0);
          }}
          placeholder="Cari nama, telepon, atau email..."
          className="pl-9"
          aria-label="Cari penghuni"
        />
      </div>

      {residents.error ? (
        <ErrorState
          error={residents.error}
          onRetry={() => residents.refetch()}
          title="Gagal memuat penghuni"
        />
      ) : residents.isLoading ? (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border" role="status" aria-label="Memuat penghuni">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 p-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
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
                offset > 0
                  ? "Halaman ini kosong. Kembali ke halaman sebelumnya."
                  : hasFilter
                    ? "Ubah kata kunci pencarian atau kosongkan filter."
                    : "Resident dapat disiapkan tanpa dianggap telah menempati kamar."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">No</th>
                    <th className="px-4 py-3 font-medium">Nama Penghuni</th>
                    <th className="px-4 py-3 font-medium">No Unit</th>
                    <th className="px-4 py-3 font-medium">Universitas/Pendidikan</th>
                    <th className="px-4 py-3 font-medium">Durasi Sewa</th>
                    <th className="px-4 py-3 font-medium">Status Akun</th>
                    <th className="px-4 py-3 font-medium">Status Penghuni</th>
                    <th className="px-4 py-3 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((resident, index) => (
                    <tr
                      key={resident.id}
                      className="border-b border-border transition-colors last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 text-muted-foreground">{offset + index + 1}</td>
                      <td className="px-4 py-3 font-medium">{resident.fullName}</td>
                      <td className="px-4 py-3">{resident.roomNumber ?? "Belum ditempatkan"}</td>
                      <td className="px-4 py-3">{resident.university ?? "Belum diisi"}</td>
                      <td className="px-4 py-3">{leaseDuration(resident)}</td>
                      <td className="px-4 py-3">
                        <AccountStatusPill status={resident.accountStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <ResidentStatusPill status={resident.residentStatus} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-11"
                          onClick={() => openDetail(resident.id)}
                          aria-label={`Lihat detail ${resident.fullName}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border md:hidden">
              {list.map((resident) => (
                <button
                  key={resident.id}
                  type="button"
                  onClick={() => openDetail(resident.id)}
                  className="flex min-h-11 w-full items-start gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary">
                    {resident.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium">{resident.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {resident.roomNumber ?? "Belum ditempatkan"} ·{" "}
                      {resident.university ?? "Pendidikan belum diisi"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <AccountStatusPill status={resident.accountStatus} />
                      <ResidentStatusPill status={resident.residentStatus} />
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
              <p className="text-xs text-muted-foreground">
                {offset + 1}–{Math.min(offset + list.length, total)} dari {total} penghuni
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={viewId !== null} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail Penghuni</DialogTitle>
          </DialogHeader>
          {detail.error ? (
            <ErrorState
              error={detail.error}
              onRetry={() => detail.refetch()}
              title="Gagal memuat detail"
            />
          ) : detail.isLoading || !detailRecord ? (
            <div className="space-y-3" role="status" aria-label="Memuat detail penghuni">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-4 border-b pb-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xl font-semibold text-primary">
                  {detailRecord.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="break-words text-base font-semibold">{detailRecord.fullName}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <AccountStatusPill status={detailRecord.accountStatus} />
                    <ResidentStatusPill status={detailRecord.residentStatus} />
                  </div>
                </div>
              </div>

              <section aria-labelledby="resident-identity-heading">
                <h3 id="resident-identity-heading" className="mb-2 font-semibold">
                  Identitas dan kontak
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Row
                    icon={<Phone className="h-3.5 w-3.5" />}
                    label="WhatsApp"
                    value={detailRecord.phone ?? "Belum diisi"}
                  />
                  <Row
                    icon={<Mail className="h-3.5 w-3.5" />}
                    label="Email"
                    value={detailRecord.email ?? "Belum diisi"}
                  />
                  <Row
                    label="NIK"
                    value={detailRecord.ktpNumber ? maskKtp(detailRecord.ktpNumber) : "Belum diisi"}
                  />
                  <Row
                    label="Tempat/Tanggal lahir"
                    value={
                      [
                        detailRecord.placeOfBirth,
                        detailRecord.dateOfBirth ? formatDate(detailRecord.dateOfBirth) : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "Belum diisi"
                    }
                  />
                  <Row label="Gender" value={detailRecord.gender ?? "Belum diisi"} />
                  <Row label="Alamat" value={detailRecord.address ?? "Belum diisi"} />
                </div>
              </section>

              <section aria-labelledby="resident-education-heading">
                <h3 id="resident-education-heading" className="mb-2 font-semibold">
                  Pendidikan dan keluarga
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Row
                    label="Universitas/Pendidikan"
                    value={detailRecord.university ?? "Belum diisi"}
                  />
                  <Row
                    label="Fakultas/Jurusan"
                    value={
                      [detailRecord.faculty, detailRecord.major].filter(Boolean).join(" · ") ||
                      "Belum diisi"
                    }
                  />
                  <Row label="Angkatan" value={detailRecord.cohort ?? "Belum diisi"} />
                  <Row label="Instagram" value={detailRecord.instagram ?? "Belum diisi"} />
                  <Row label="Orang tua" value={detailRecord.parentName ?? "Belum diisi"} />
                  <Row label="Kontak orang tua" value={detailRecord.parentPhone ?? "Belum diisi"} />
                </div>
              </section>

              {detailRecord.emergencyContacts.length > 0 ? (
                <section className="border-t pt-3" aria-labelledby="resident-emergency-heading">
                  <h3 id="resident-emergency-heading" className="mb-2 font-semibold">
                    Kontak darurat
                  </h3>
                  <ul className="space-y-1">
                    {detailRecord.emergencyContacts.map((contact) => (
                      <li key={contact.id}>
                        <span className="font-medium">{contact.contactName}</span>
                        <span className="text-muted-foreground"> · {contact.phone}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {temporaryPassword ? (
                <div
                  role="status"
                  className="rounded-lg border border-warning/40 bg-warning/10 p-3"
                >
                  <p className="font-semibold">Kata sandi sementara — tampil satu kali</p>
                  <p className="mt-1 break-all font-mono">{temporaryPassword}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Salurkan secara privat. Nilai ini tidak disimpan pada cache atau dapat
                    ditampilkan ulang.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:flex-wrap">
                {canManage ? (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => {
                      setEditTarget(detailRecord);
                      closeDetail();
                    }}
                  >
                    <Pencil className="mr-1 h-4 w-4" /> Edit identitas
                  </Button>
                ) : null}
                {canManage && detailRecord.accountStatus === "not_provisioned" ? (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={accountMutation.isPending || !accountKey}
                    onClick={async () => {
                      if (!accountKey) return;
                      try {
                        const receipt = await accountMutation.mutateAsync({
                          residentId: detailRecord.id,
                          idempotencyKey: accountKey,
                        });
                        if (
                          detailScopeRef.current.propertyId !== currentPropertyId ||
                          detailScopeRef.current.residentId !== detailRecord.id
                        )
                          return;
                        setTemporaryPassword(receipt.temporaryPassword);
                        void detail.refetch();
                      } catch {
                        // Mutation feedback already presents a sanitized recovery message.
                      }
                    }}
                  >
                    <UserRoundCog className="mr-1 h-4 w-4" />
                    {accountMutation.isPending ? "Menyiapkan..." : "Siapkan akun Penghuni"}
                  </Button>
                ) : null}
                {leaseCreateEnabled ? (
                  <Button asChild variant="outline" className="min-h-11">
                    <Link to="/penyewaan/tambah">
                      <CalendarPlus className="mr-1 h-4 w-4" /> Tambah Penyewaan
                    </Link>
                  </Button>
                ) : hasLeaseAuthority ? (
                  <Button variant="outline" className="min-h-11" disabled>
                    <CalendarPlus className="mr-1 h-4 w-4" /> Penyewaan belum tersedia
                  </Button>
                ) : null}
                {canManage ? (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() =>
                      setStatusTarget({
                        resident: detailRecord,
                        next: detailRecord.residentStatus === "active" ? "inactive" : "active",
                      })
                    }
                  >
                    {detailRecord.residentStatus === "active" ? (
                      <UserX className="mr-1 h-4 w-4" />
                    ) : (
                      <UserCheck className="mr-1 h-4 w-4" />
                    )}
                    {detailRecord.residentStatus === "active" ? "Arsipkan" : "Aktifkan"}
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ResidentFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ResidentFormDialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
        initial={editTarget}
      />

      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        title={statusTarget?.next === "active" ? "Aktifkan penghuni" : "Arsipkan penghuni"}
        description={
          statusTarget
            ? `Konfirmasi perubahan status ${statusTarget.resident.fullName}. Riwayat operasional tetap dipertahankan.`
            : null
        }
        confirmLabel={statusTarget?.next === "active" ? "Aktifkan" : "Arsipkan"}
        destructive={statusTarget?.next === "inactive"}
        pending={statusMutation.isPending}
        onConfirm={async () => {
          if (!statusTarget) return;
          await statusMutation.mutateAsync({
            residentId: statusTarget.resident.id,
            status: statusTarget.next,
          });
          setStatusTarget(null);
          closeDetail();
        }}
      />
    </AppShell>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/35 p-3">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        {icon} {label}
      </span>
      <p className="mt-1 break-words font-medium">{value}</p>
    </div>
  );
}

function maskKtp(ktp: string): string {
  if (ktp.length <= 10) return ktp;
  return `${ktp.slice(0, 6)}******${ktp.slice(-4)}`;
}
