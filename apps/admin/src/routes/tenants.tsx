import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { CalendarPlus, Eye, Search, SlidersHorizontal, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LeaseCreatePage } from "@/components/leases/LeaseCreatePage";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterResultNotice } from "@/components/ui/filter-result-notice";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useResidents, type ResidentListRecord, type ResidentStatus } from "@/hooks/useResidents";
import { useAuth } from "@/lib/auth";
import { isAdminUxLeaseEnabled } from "@/lib/features";
import { useProperty } from "@/lib/property";
import { cn } from "@/lib/utils";

type TenantRouteSearch = { flow?: "new-lease"; bookingLeadId?: string };

function validateSearch(raw: Record<string, unknown>): TenantRouteSearch {
  const bookingLeadId =
    typeof raw.bookingLeadId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.bookingLeadId)
      ? raw.bookingLeadId
      : undefined;
  return { flow: raw.flow === "new-lease" ? "new-lease" : undefined, bookingLeadId };
}

export const Route = createFileRoute("/tenants")({
  validateSearch,
  component: TenantsRoute,
});

const PAGE_SIZE = 20;

function TenantsRoute() {
  const showsResidentDetail = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId === "/tenants/$residentId"),
  });

  return showsResidentDetail ? <Outlet /> : <TenantsPage />;
}

export function ResidentStatusPill({ status }: { status: ResidentListRecord["residentStatus"] }) {
  const presentation: Record<ResidentStatus, { label: string; className: string }> = {
    draft: { label: "Draf", className: "bg-muted text-muted-foreground" },
    pending_activation: { label: "Menunggu aktivasi", className: "bg-warning/15 text-warning" },
    active: { label: "Aktif", className: "bg-success/15 text-success" },
    inactive: { label: "Nonaktif", className: "bg-muted text-muted-foreground" },
    archived: { label: "Diarsipkan", className: "bg-muted text-muted-foreground" },
  };
  const current = presentation[status];
  return (
    <span
      className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", current.className)}
    >
      {current.label}
    </span>
  );
}

export function AccountStatusPill({ status }: { status: ResidentListRecord["accountStatus"] }) {
  const label = {
    active: "Akun aktif",
    inactive: "Akun nonaktif",
    suspended: "Akun ditangguhkan",
    not_provisioned: "Belum memiliki akun",
  }[status];
  return (
    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
      {label}
    </span>
  );
}

export function formatResidentDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function leaseDuration(record: ResidentListRecord): string {
  if (record.leaseAuthorityCount > 1) return "Perlu rekonsiliasi";
  if (!record.leaseStart || !record.leaseEnd) return "Belum ada penyewaan";
  const start = new Date(`${record.leaseStart}T00:00:00Z`);
  const end = new Date(`${record.leaseEnd}T00:00:00Z`);
  const months = Math.max(
    0,
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth(),
  );
  return `${months} bulan · ${formatResidentDate(record.leaseStart)} – ${formatResidentDate(record.leaseEnd)}`;
}

function TenantsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [q, setQ] = useState("");
  const [residentStatus, setResidentStatus] = useState<ResidentStatus | "all">("all");
  const [accountStatus, setAccountStatus] = useState<ResidentListRecord["accountStatus"] | "all">(
    "all",
  );
  const [gender, setGender] = useState<"male" | "female" | "other" | "all">("all");
  const [tenancyStatus, setTenancyStatus] = useState<
    "awaiting_activation" | "active" | "none" | "all"
  >("all");
  const [offset, setOffset] = useState(0);
  const { user, hasPermission } = useAuth();
  const { currentPropertyId } = useProperty();
  const hasLeaseAuthority =
    (user?.roles ?? []).some((role) => ["owner", "manager", "admin"].includes(role)) &&
    hasPermission("lease.read") &&
    hasPermission("lease.manage") &&
    Boolean(currentPropertyId);
  const leaseCreateEnabled = hasLeaseAuthority && isAdminUxLeaseEnabled();
  const residents = useResidents({
    q,
    status: residentStatus === "all" ? undefined : residentStatus,
    accountStatus: accountStatus === "all" ? undefined : accountStatus,
    gender: gender === "all" ? undefined : gender,
    tenancyStatus: tenancyStatus === "all" ? undefined : tenancyStatus,
    limit: PAGE_SIZE,
    offset,
  });
  const list = residents.data?.data ?? [];
  const total = residents.data?.meta.total ?? 0;
  const hasFilter =
    q.trim() !== "" ||
    residentStatus !== "all" ||
    accountStatus !== "all" ||
    gender !== "all" ||
    tenancyStatus !== "all";
  const activeFilterCount =
    Number(q.trim() !== "") +
    Number(residentStatus !== "all") +
    Number(accountStatus !== "all") +
    Number(gender !== "all") +
    Number(tenancyStatus !== "all");
  const filterSignature = [q.trim(), residentStatus, accountStatus, gender, tenancyStatus].join(
    "|",
  );

  useEffect(() => {
    setOffset(0);
  }, [currentPropertyId]);

  const resetFilters = () => {
    setQ("");
    setResidentStatus("all");
    setAccountStatus("all");
    setGender("all");
    setTenancyStatus("all");
    setOffset(0);
  };

  if (search.flow === "new-lease") {
    return (
      <LeaseCreatePage
        bookingLeadId={search.bookingLeadId}
        onCreated={async () => {
          await residents.refetch();
          await navigate({ search: {}, replace: true });
        }}
      />
    );
  }

  return (
    <AppShell
      title="Data Penghuni & Penyewaan"
      subtitle={residents.data ? `${total} penghuni terdaftar` : "Memuat..."}
      actions={
        leaseCreateEnabled ? (
          <Button asChild className="min-h-11">
            <Link to="/tenants" search={{ flow: "new-lease" }}>
              <CalendarPlus className="mr-1 h-4 w-4" /> Tambah Penyewaan
            </Link>
          </Button>
        ) : null
      }
    >
      <Card className="mb-5 border-border bg-muted/15">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="h-4 w-4 text-primary" /> Filter penghuni
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(18rem,1.8fr)_repeat(4,minmax(9rem,1fr))_auto]">
            <div className="relative md:col-span-2 xl:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(event) => {
                  setQ(event.target.value);
                  setOffset(0);
                }}
                placeholder="Cari nama, WhatsApp, email, unit, atau pendidikan..."
                className="min-h-11 pl-9"
                aria-label="Cari penghuni"
              />
            </div>
            <Select
              value={residentStatus}
              onValueChange={(value) => {
                setResidentStatus(value as ResidentStatus | "all");
                setOffset(0);
              }}
            >
              <SelectTrigger className="min-h-11" aria-label="Filter status penghuni">
                <SelectValue placeholder="Status penghuni" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status penghuni</SelectItem>
                <SelectItem value="pending_activation">Menunggu aktivasi</SelectItem>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="inactive">Nonaktif</SelectItem>
                <SelectItem value="draft">Draf</SelectItem>
                <SelectItem value="archived">Diarsipkan</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={accountStatus}
              onValueChange={(value) => {
                setAccountStatus(value as ResidentListRecord["accountStatus"] | "all");
                setOffset(0);
              }}
            >
              <SelectTrigger className="min-h-11" aria-label="Filter status akun">
                <SelectValue placeholder="Status akun" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status akun</SelectItem>
                <SelectItem value="active">Akun aktif</SelectItem>
                <SelectItem value="inactive">Akun nonaktif</SelectItem>
                <SelectItem value="suspended">Akun ditangguhkan</SelectItem>
                <SelectItem value="not_provisioned">Belum memiliki akun</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={gender}
              onValueChange={(value) => {
                setGender(value as "male" | "female" | "other" | "all");
                setOffset(0);
              }}
            >
              <SelectTrigger className="min-h-11" aria-label="Filter jenis kelamin">
                <SelectValue placeholder="Jenis kelamin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua jenis kelamin</SelectItem>
                <SelectItem value="male">Putra</SelectItem>
                <SelectItem value="female">Putri</SelectItem>
                <SelectItem value="other">Lainnya</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={tenancyStatus}
              onValueChange={(value) => {
                setTenancyStatus(value as "awaiting_activation" | "active" | "none" | "all");
                setOffset(0);
              }}
            >
              <SelectTrigger className="min-h-11" aria-label="Filter status penyewaan">
                <SelectValue placeholder="Status penyewaan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status penyewaan</SelectItem>
                <SelectItem value="awaiting_activation">Menunggu aktivasi kamar</SelectItem>
                <SelectItem value="active">Penyewaan aktif</SelectItem>
                <SelectItem value="none">Belum ada penyewaan</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={!hasFilter}
              onClick={resetFilters}
            >
              <X className="mr-1 h-4 w-4" /> Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {!residents.isLoading && !residents.isFetching && !residents.error ? (
        <FilterResultNotice
          key={filterSignature}
          className="mb-5"
          entityLabel="penghuni"
          resultCount={total}
          activeFilterCount={activeFilterCount}
          searchTerm={q}
        />
      ) : null}

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
                hasFilter
                  ? "Ubah kata kunci pencarian atau kosongkan filter."
                  : "Penyewaan baru disiapkan dari halaman ini."
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
                    <th className="px-4 py-3 font-medium">No Unit Kamar</th>
                    <th className="px-4 py-3 font-medium">Universitas</th>
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
                        <Button asChild variant="ghost" size="sm" className="min-h-11">
                          <Link
                            to="/tenants/$residentId"
                            params={{ residentId: resident.id }}
                            aria-label={`Lihat detail ${resident.fullName}`}
                          >
                            <Eye className="mr-1 h-4 w-4" /> Detail
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-border md:hidden">
              {list.map((resident) => (
                <Link
                  key={resident.id}
                  to="/tenants/$residentId"
                  params={{ residentId: resident.id }}
                  className="flex min-h-11 items-start gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary">
                    {resident.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium">{resident.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {resident.roomNumber ?? "Belum ditempatkan"} · {leaseDuration(resident)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <AccountStatusPill status={resident.accountStatus} />
                      <ResidentStatusPill status={resident.residentStatus} />
                    </div>
                  </div>
                </Link>
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
    </AppShell>
  );
}
