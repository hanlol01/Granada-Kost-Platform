import { Link } from "@tanstack/react-router";
import {
  CalendarClock,
  CircleDollarSign,
  DoorOpen,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useM6LeaseResidentOptions,
  useM6Leases,
  useM6OverdueLeases,
} from "@/hooks/useAdminUxLeases";
import { useM4KostTypes, useM4RoomInventory } from "@/hooks/useAdminUxMaster";
import {
  leaseListFilterChange,
  LEASE_STATUS_LABEL,
  type LeaseListRouteSearch,
} from "@/lib/admin-ux-lease-helpers";
import type { LeaseStatus, LeaseSummary } from "@/lib/admin-ux-lease-types";
import { useAuth } from "@/lib/auth";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  search: LeaseListRouteSearch;
  onSearchChange: (next: Partial<LeaseListRouteSearch>) => void;
};

const EMPTY_LEASES: LeaseSummary[] = [];

const STATUS_TONE: Record<LeaseStatus, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  ended: "border-slate-700 bg-slate-800 text-slate-300",
  cancelled: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  transferred: "border-blue-500/30 bg-blue-500/10 text-blue-300",
};

function LeaseStatusBadge({ status }: { status: LeaseStatus }) {
  return (
    <Badge className={cn("border", STATUS_TONE[status])} variant="outline">
      {LEASE_STATUS_LABEL[status]}
    </Badge>
  );
}

export function LeaseListPage({ search, onSearchChange }: Props) {
  const { hasPermission } = useAuth();
  const list = useM6Leases({
    q: search.q,
    status: search.status,
    residentId: search.residentId,
    roomId: search.roomId,
    kostTypeId: search.kostTypeId,
    limit: search.limit,
    offset: search.offset,
  });
  const overdue = useM6OverdueLeases({ limit: search.limit, offset: search.offset });
  const current = search.overdue ? overdue : list;
  const leases = current.data?.items ?? EMPTY_LEASES;
  const total = current.data?.total ?? 0;
  const canCreate = hasPermission("lease.manage");
  const hasActiveFilters = Boolean(
    search.q ||
    search.status ||
    search.overdue ||
    search.residentId ||
    search.roomId ||
    search.kostTypeId,
  );

  if (current.isLoading) {
    return (
      <AppShell title="Penyewaan" subtitle="Memuat daftar penyewaan property aktif">
        <div className="space-y-5 pb-24 lg:pb-8">
          <LeaseFilters search={search} onSearchChange={onSearchChange} />
          <LoadingState label="Memuat penyewaan..." />
        </div>
      </AppShell>
    );
  }

  if (current.error) {
    return (
      <AppShell title="Penyewaan" subtitle="Daftar penyewaan dan status komersial">
        <div className="space-y-5 pb-24 lg:pb-8">
          <LeaseFilters search={search} onSearchChange={onSearchChange} />
          <ErrorState
            error={current.error}
            title="Gagal memuat penyewaan"
            onRetry={() => void current.refetch()}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Penyewaan"
      subtitle="Lease adalah sumber lifecycle kamar dan status komersial"
      actions={
        canCreate ? (
          <Button asChild>
            <Link to="/penyewaan/tambah">
              <Plus className="mr-2 h-4 w-4" /> Tambah Penyewaan
            </Link>
          </Button>
        ) : null
      }
    >
      <div className="space-y-5 pb-24 lg:pb-8">
        <LeaseFilters search={search} onSearchChange={onSearchChange} />
        <LeaseMetrics leases={leases} total={total} overdue={search.overdue} />
        {leases.length ? (
          <LeaseTable leases={leases} />
        ) : (
          <Card className="border-slate-800 bg-slate-900/80">
            <CardContent className="p-6">
              <EmptyState
                icon={<CalendarClock className="h-5 w-5" />}
                title={hasActiveFilters ? "Tidak ada hasil penyewaan" : "Belum ada penyewaan"}
                description={
                  hasActiveFilters
                    ? "Ubah atau reset filter untuk melihat data lain."
                    : "Buat penyewaan setelah penghuni aktif dan kamar kosong tersedia."
                }
                action={
                  canCreate && !hasActiveFilters ? (
                    <Button asChild>
                      <Link to="/penyewaan/tambah">Tambah Penyewaan</Link>
                    </Button>
                  ) : undefined
                }
              />
            </CardContent>
          </Card>
        )}
        <Pagination
          offset={search.offset}
          limit={search.limit}
          total={total}
          onChange={(offset) => onSearchChange({ offset })}
        />
      </div>
    </AppShell>
  );
}

function LeaseFilters({ search, onSearchChange }: Props) {
  const residentOptions = useM6LeaseResidentOptions();
  const roomOptions = useM4RoomInventory({
    limit: 100,
    offset: 0,
    includeActiveLease: false,
  });
  const kostTypeOptions = useM4KostTypes({ limit: 100, offset: 0, status: "active" });
  const changeFilter = (next: Partial<LeaseListRouteSearch>) =>
    onSearchChange(leaseListFilterChange(next));
  return (
    <Card className="border-slate-800 bg-slate-900/80">
      <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_auto_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            className="border-slate-700 bg-slate-950 pl-9 text-slate-100"
            value={search.q}
            onChange={(event) => changeFilter({ q: event.target.value })}
            placeholder="Cari kode lease, penghuni tersamarkan, atau kamar..."
          />
        </div>
        <Select
          value={search.status ?? "all"}
          onValueChange={(value) =>
            changeFilter({
              status: value === "all" ? undefined : (value as LeaseStatus),
            })
          }
        >
          <SelectTrigger className="border-slate-700 bg-slate-950 text-slate-100">
            <SelectValue placeholder="Semua status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            {Object.entries(LEASE_STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={search.overdue ? "default" : "outline"}
          onClick={() =>
            onSearchChange(
              search.overdue
                ? { overdue: false, offset: 0 }
                : {
                    q: "",
                    status: undefined,
                    overdue: true,
                    residentId: undefined,
                    roomId: undefined,
                    kostTypeId: undefined,
                    offset: 0,
                  },
            )
          }
        >
          <TriangleAlert className="mr-2 h-4 w-4" /> Tunggakan
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onSearchChange({
              q: "",
              status: undefined,
              overdue: false,
              residentId: undefined,
              roomId: undefined,
              kostTypeId: undefined,
              offset: 0,
            })
          }
        >
          Reset
        </Button>
        <div className="grid gap-3 md:col-span-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="lease-filter-resident">Penghuni</Label>
            <Select
              value={search.residentId ?? "all"}
              onValueChange={(value) =>
                changeFilter({ residentId: value === "all" ? undefined : value })
              }
              disabled={residentOptions.isLoading}
            >
              <SelectTrigger id="lease-filter-resident">
                <SelectValue placeholder="Semua penghuni" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua penghuni</SelectItem>
                {(residentOptions.data?.items ?? []).map((resident) => (
                  <SelectItem key={resident.id} value={resident.id}>
                    {resident.displayNameMasked} ·{" "}
                    {resident.residentStatus === "active" ? "Aktif" : "Nonaktif"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {residentOptions.error ? (
              <p className="text-xs text-rose-300">Pilihan penghuni tidak dapat dimuat.</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lease-filter-room">Kamar</Label>
            <Select
              value={search.roomId ?? "all"}
              onValueChange={(value) =>
                changeFilter({ roomId: value === "all" ? undefined : value })
              }
              disabled={roomOptions.isLoading}
            >
              <SelectTrigger id="lease-filter-room">
                <SelectValue placeholder="Semua kamar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua kamar</SelectItem>
                {(roomOptions.data?.items ?? []).map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.number} · {room.kostType.name}
                    {room.buildingName ? ` · ${room.buildingName}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {roomOptions.error ? (
              <p className="text-xs text-rose-300">Pilihan kamar tidak dapat dimuat.</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lease-filter-kost-type">Tipe kost</Label>
            <Select
              value={search.kostTypeId ?? "all"}
              onValueChange={(value) =>
                changeFilter({ kostTypeId: value === "all" ? undefined : value })
              }
              disabled={kostTypeOptions.isLoading}
            >
              <SelectTrigger id="lease-filter-kost-type">
                <SelectValue placeholder="Semua tipe kost" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua tipe kost</SelectItem>
                {(kostTypeOptions.data?.items ?? []).map((kostType) => (
                  <SelectItem key={kostType.id} value={kostType.id}>
                    {kostType.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {kostTypeOptions.error ? (
              <p className="text-xs text-rose-300">Pilihan tipe kost tidak dapat dimuat.</p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
function LeaseMetrics({
  leases,
  total,
  overdue,
}: {
  leases: LeaseSummary[];
  total: number;
  overdue: boolean;
}) {
  const active = leases.filter((lease) => lease.leaseStatus === "active").length;
  const outstanding = leases.reduce((sum, lease) => sum + lease.outstandingAmount, 0);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Metric
        label={overdue ? "Lease tertunggak" : "Total hasil"}
        value={String(total)}
        icon={CalendarClock}
      />
      <Metric label="Lease aktif pada halaman" value={String(active)} icon={DoorOpen} />
      <Metric
        label="Tunggakan pada halaman"
        value={formatIDR(outstanding)}
        icon={CircleDollarSign}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof CalendarClock;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900/80">
      <CardContent className="flex items-start justify-between p-4">
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-blue-300" />
      </CardContent>
    </Card>
  );
}

function LeaseTable({ leases }: { leases: LeaseSummary[] }) {
  return (
    <Card className="overflow-hidden border-slate-800 bg-slate-900/80">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Lease</th>
              <th className="px-4 py-3">Penghuni</th>
              <th className="px-4 py-3">Kamar</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Tagihan berikutnya</th>
              <th className="px-4 py-3 text-right">Tunggakan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {leases.map((lease) => (
              <tr key={lease.id} className="transition-colors hover:bg-slate-800/60">
                <td className="px-4 py-3">
                  <Link
                    to="/penyewaan/$leaseId"
                    params={{ leaseId: lease.id }}
                    search={{ panel: "detail", tab: "ringkasan" }}
                    className="font-semibold text-blue-300 hover:text-blue-200 hover:underline"
                  >
                    {lease.leaseCode}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {lease.billingCycle === "monthly" ? "Bulanan" : "Tahunan"}
                  </p>
                </td>
                <td className="px-4 py-3 text-slate-200">{lease.resident.fullNameMasked}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-100">{lease.room.number}</p>
                  <p className="text-xs text-slate-500">{lease.kostType.name}</p>
                </td>
                <td className="px-4 py-3">
                  <LeaseStatusBadge status={lease.leaseStatus} />
                </td>
                <td className="px-4 py-3 text-slate-300">{lease.nextBillingDate}</td>
                <td className="px-4 py-3 text-right">
                  <p className="font-medium text-slate-100">{formatIDR(lease.outstandingAmount)}</p>
                  {lease.lastInvoice ? (
                    <p className="text-xs text-slate-500">{lease.lastInvoice.invoiceCode}</p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Pagination({
  offset,
  limit,
  total,
  onChange,
}: {
  offset: number;
  limit: number;
  total: number;
  onChange: (offset: number) => void;
}) {
  if (total <= limit) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-slate-400">
      <span>
        {offset + 1}–{Math.min(total, offset + limit)} dari {total} lease
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={offset <= 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          Sebelumnya
        </Button>
        <Button
          variant="outline"
          disabled={offset + limit >= total}
          onClick={() => onChange(offset + limit)}
        >
          Berikutnya
        </Button>
      </div>
    </div>
  );
}
