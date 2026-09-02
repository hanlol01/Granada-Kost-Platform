import { useId, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  BedDouble,
  Building2,
  CalendarClock,
  Car,
  CreditCard,
  FileText,
  History,
  Home,
  MessageSquareWarning,
  Pencil,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { RoomInventoryEditor, type BuildingOption } from "@/components/rooms/KostTypeInventoryPage";
import { ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  useM4KostTypes,
  useM4RoomBuildings,
  useRoomDetailByNumber,
} from "@/hooks/useAdminUxMaster";
import { roomDetailToInventory, type RoomInventory } from "@/lib/admin-ux-master-api";
import {
  hasRoomWriteAuthority,
  KOST_TYPE_LABEL,
  ROOM_STATUS_LABEL,
} from "@/lib/admin-ux-master-helpers";
import { useAuth } from "@/lib/auth";
import { normalizeAdminError } from "@/lib/error-normalizer";
import { formatDate, formatIDR } from "@/lib/format";
import { useProperty } from "@/lib/property";

const EMPTY_TEXT = "Belum ada data pada sumber operasional saat ini.";

function ownershipSourceLabel(
  source: "building_assignment" | "room_assignment" | "kostation_default",
) {
  if (source === "room_assignment") return "Penugasan kamar Apart Kost";
  if (source === "building_assignment") return "Penugasan bangunan Rumah Kost";
  return "Belum ada assignment Owner Property";
}

function ownershipPeriodLabel(effectiveFrom: string | null, effectiveUntil: string | null) {
  if (!effectiveFrom) return "Tidak ada periode assignment";
  return `${formatDate(effectiveFrom)} — ${effectiveUntil ? formatDate(effectiveUntil) : "Tanpa batas akhir"}`;
}

function roomStatusBadgeClass(status: string): string {
  const base = "border text-foreground shadow-sm";
  if (status === "occupied") return `${base} border-success/45 bg-success/10`;
  if (status === "reserved") return `${base} border-warning/50 bg-warning/15`;
  if (status === "maintenance" || status === "requires_review") {
    return `${base} border-warning/55 bg-warning/20`;
  }
  if (status === "inactive") return `${base} border-destructive/45 bg-destructive/10`;
  return `${base} border-foreground/15 bg-muted/70`;
}

export function RoomDetailPage({ roomNumber }: { roomNumber: string }) {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const { currentPropertyId } = useProperty();
  const detailQuery = useRoomDetailByNumber(roomNumber);
  const detail = detailQuery.data;
  const category = detail?.category.code;
  const typesQuery = useM4KostTypes({ category, limit: 100 });
  const buildingsQuery = useM4RoomBuildings(category);
  const [editorOpen, setEditorOpen] = useState(false);

  const canManage = hasRoomWriteAuthority(
    user?.roles ?? [],
    hasPermission("room.manage"),
    currentPropertyId,
  );
  const types = useMemo(
    () =>
      (typesQuery.data?.items ?? []).filter(
        (item) =>
          item.propertyId === currentPropertyId &&
          item.category === category &&
          item.status === "active",
      ),
    [category, currentPropertyId, typesQuery.data],
  );
  const buildings: BuildingOption[] = useMemo(
    () =>
      (buildingsQuery.data ?? [])
        .filter(
          (building) => building.propertyId === currentPropertyId && building.category === category,
        )
        .map((building) => ({
          id: building.id,
          label: building.buildingName || building.buildingCode,
          category: building.category,
          genderPolicy: building.genderPolicy,
        }))
        .sort((left, right) => left.label.localeCompare(right.label, "id-ID")),
    [buildingsQuery.data, category, currentPropertyId],
  );

  if (detailQuery.isLoading) {
    return (
      <AppShell title="Detail Kamar" subtitle="Menyiapkan sumber operasional kamar">
        <LoadingState label="Memuat detail kamar..." />
      </AppShell>
    );
  }

  if (detailQuery.error || !detail) {
    const presentation = roomDetailErrorPresentation(detailQuery.error);
    return (
      <AppShell title="Detail Kamar" subtitle="Sumber operasional kamar">
        <ErrorState
          error={detailQuery.error ?? new Error("Kamar tidak ditemukan pada properti aktif.")}
          title={presentation.title}
          onRetry={presentation.retry ? () => void detailQuery.refetch() : undefined}
        />
      </AppShell>
    );
  }

  const room = roomDetailToInventory(detail);
  const editorReady =
    canManage &&
    !typesQuery.isLoading &&
    !buildingsQuery.isLoading &&
    !typesQuery.error &&
    !buildingsQuery.error &&
    types.some((item) => item.id === detail.category.id) &&
    buildings.some((item) => item.id === detail.building.id);
  const categoryPath =
    detail.category.code === "rukost" ? "/rooms/rumah-kost" : "/rooms/apart-kost";

  return (
    <AppShell
      title={detail.number}
      subtitle={`${detail.building.name} · ${KOST_TYPE_LABEL[detail.category.code]}`}
      actions={
        <>
          <Button variant="secondary" className="min-h-11" asChild>
            <Link to={categoryPath} search={{ q: "", offset: 0, limit: 20 }}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali
            </Link>
          </Button>
          {canManage ? (
            <Button
              className="min-h-11"
              disabled={!editorReady}
              title={
                editorReady
                  ? undefined
                  : "Referensi bangunan dan tipe kost belum siap untuk edit aman."
              }
              onClick={() => setEditorOpen(true)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit Kamar
            </Button>
          ) : null}
        </>
      }
    >
      <div className="mx-auto max-w-7xl space-y-5 overflow-x-hidden pb-24 lg:pb-8">
        <nav aria-label="Breadcrumb detail kamar" className="text-sm text-foreground/70">
          <ol className="flex min-w-0 flex-wrap items-center gap-2">
            <li>
              <Link
                className="inline-flex min-h-11 items-center rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                to="/rooms"
                search={{ q: "", offset: 0, limit: 20 }}
              >
                Kamar
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                className="inline-flex min-h-11 items-center rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                to={categoryPath}
                search={{ q: "", offset: 0, limit: 20 }}
              >
                {KOST_TYPE_LABEL[detail.category.code]}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="min-w-0 break-all font-medium text-foreground" aria-current="page">
              {detail.number}
            </li>
          </ol>
        </nav>

        <header className="rounded-xl border border-foreground/15 bg-card p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={roomStatusBadgeClass(detail.physical.status)}>
                  {ROOM_STATUS_LABEL[detail.physical.status]}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-info/45 bg-info/10 text-foreground shadow-sm"
                >
                  {detail.physical.genderPolicy === "male" ? "Putra" : "Putri"}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-primary/45 bg-primary/10 text-foreground shadow-sm"
                >
                  {KOST_TYPE_LABEL[detail.category.code]}
                </Badge>
              </div>
              <p className="mt-3 break-words text-2xl font-semibold tracking-tight text-foreground">
                Kamar {detail.number}
              </p>
              <p className="mt-1 break-words text-sm text-foreground/70">
                {detail.building.name} · {detail.physical.floorLabel}
              </p>
            </div>
            <div className="text-sm text-foreground/70">
              Diperbarui {formatDate(detail.updatedAt)}
            </div>
          </div>
        </header>

        {detail.reconciliation.state !== "normal" ? (
          <section
            aria-labelledby="room-attention-title"
            role="alert"
            className="rounded-xl border border-warning/55 bg-warning/10 p-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              <div className="min-w-0">
                <h2 id="room-attention-title" className="font-semibold text-foreground">
                  Perlu perhatian operasional
                </h2>
                <ul className="mt-1 space-y-1 text-sm text-foreground/75">
                  {detail.reconciliation.messages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ) : null}

        <div className="grid items-stretch gap-5 xl:grid-cols-3">
          <DetailSection title="Inventori fisik" icon={BedDouble}>
            <DefinitionGrid
              items={[
                ["Nomor kamar", detail.number],
                ["Kode kamar", detail.roomCode ?? "Belum ditetapkan"],
                ["Bangunan", `${detail.building.code} · ${detail.building.name}`],
                ["Kategori", detail.category.name],
                ["Unit", detail.physical.floorLabel],
                ["Ukuran", detail.physical.sizeLabel ?? "Belum dicatat"],
                ["Visibilitas", detail.physical.publicVisible ? "Tampil di katalog" : "Internal"],
                ["Catatan operasional", detail.physical.notes ?? "Tidak ada catatan operasional"],
              ]}
            />
          </DetailSection>

          <DetailSection title="Sumber komersial kategori" icon={CreditCard}>
            <p className="mb-4 text-sm leading-6 text-foreground/75">
              Nilai ini berasal dari tipe kost aktif dan tidak dapat diedit dari inventori kamar.
            </p>
            <DefinitionGrid
              items={[
                ["Harga bulanan", formatIDR(detail.commercial.monthlyPrice)],
                ["Nilai kontrak tahunan", formatIDR(detail.commercial.annualContractValue)],
                ["DP rekomendasi", detail.commercial.minimumDpLabel],
                ["Deposit keamanan", formatIDR(detail.commercial.securityDepositRequired)],
                ["Rencana pembayaran", detail.commercial.paymentPlanDescription],
              ]}
            />
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Fasilitas kategori
              </p>
              {detail.commercial.facilities.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {detail.commercial.facilities.map((facility) => (
                    <Badge
                      key={facility.id}
                      variant="outline"
                      className="border-primary/30 bg-primary/10 text-foreground shadow-sm"
                    >
                      {facility.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <EmptySectionCopy />
              )}
            </div>
          </DetailSection>

          <DetailSection title="Kepemilikan" icon={ShieldCheck}>
            <DefinitionGrid
              items={[
                ["Otoritas saat ini", detail.ownership.displayName],
                ["Sumber", ownershipSourceLabel(detail.ownership.source)],
                [
                  "Periode efektif",
                  ownershipPeriodLabel(
                    detail.ownership.effectiveFrom,
                    detail.ownership.effectiveUntil,
                  ),
                ],
                [
                  "Status",
                  detail.ownership.assignmentStatus === "active" ? "Aktif" : "Milik Kostation",
                ],
              ]}
            />
            {detail.ownership.ownerProfileId ? (
              <div className="mt-5 flex flex-wrap gap-3 border-t border-foreground/10 pt-4">
                <Button variant="info" className="min-h-11" asChild>
                  <Link
                    to="/property-owners/$ownerId"
                    params={{ ownerId: detail.ownership.ownerProfileId }}
                  >
                    <UserRound className="mr-2 h-4 w-4" />
                    Buka detail owner
                  </Link>
                </Button>
                <p className="basis-full text-xs leading-5 text-muted-foreground">
                  Pembayaran owner belum tersedia sebagai rute admin yang terikat ke pemilik dan
                  periode.
                </p>
              </div>
            ) : null}
          </DetailSection>
        </div>

        <div className="grid items-stretch gap-5 xl:grid-cols-2">
          <DetailSection title="Penghuni aktif" icon={UserRound}>
            {detail.resident ? (
              <>
                <DefinitionGrid
                  items={[
                    ["Nama", detail.resident.displayName],
                    ["Status akun", operationalLabel(detail.resident.accountStatus)],
                    ["Universitas", detail.resident.university ?? "Belum dicatat"],
                    ["Mulai hunian", formatDate(detail.resident.occupancyStart)],
                  ]}
                />
                <UnavailableLink label="Detail penghuni belum menerima filter aman pada KMO-W02A." />
              </>
            ) : (
              <EmptySectionCopy text="Belum ada penghuni aktif pada kamar ini." />
            )}
          </DetailSection>

          <DetailSection title="Penyewaan dan hunian" icon={FileText}>
            {detail.lease ? (
              <>
                <DefinitionGrid
                  items={[
                    ["Kode penyewaan", detail.lease.code],
                    ["Status penyewaan", operationalLabel(detail.lease.status)],
                    ["Mulai", formatDate(detail.lease.startDate)],
                    [
                      "Selesai",
                      detail.lease.endDate ? formatDate(detail.lease.endDate) : "Belum ditetapkan",
                    ],
                    ["Durasi", `${detail.lease.durationMonths} bulan`],
                    ["Rencana pembayaran", operationalLabel(detail.lease.paymentPlan)],
                    [
                      "Status hunian",
                      detail.lease.occupancyState
                        ? operationalLabel(detail.lease.occupancyState)
                        : "Belum tercatat",
                    ],
                  ]}
                />
                <SafeAction
                  href={detail.links.resident}
                  enabledLabel="Buka detail penghuni"
                  unavailableLabel="Detail penghuni belum tersedia"
                  icon={UserRound}
                />
              </>
            ) : (
              <EmptySectionCopy
                text={
                  detail.resident
                    ? "Hunian aktif belum memiliki penyewaan aktif yang selaras."
                    : "Belum ada penyewaan aktif pada kamar ini."
                }
              />
            )}
          </DetailSection>
        </div>

        <DetailSection title="Ringkasan Penyewaan dan Pembayaran" icon={CreditCard}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Nilai kontrak"
              value={moneyOrUnavailable(detail.billing.contractValue)}
            />
            <Metric
              label="Pembayaran teralokasi terverifikasi"
              value={formatIDR(detail.billing.verifiedInvoiceAllocated)}
            />
            <Metric label="Belum dibayar" value={formatIDR(detail.billing.unpaidAmount)} />
            <Metric
              label="Menunggu konfirmasi"
              value={formatIDR(detail.billing.awaitingConfirmationAmount)}
            />
            <Metric label="Minimum DP" value={formatIDR(detail.billing.minimumDpAmount)} />
            <Metric
              label="DP terverifikasi"
              value={moneyOrUnavailable(detail.billing.dpVerifiedAmount)}
            />
            <Metric label="Deposit ditahan" value={formatIDR(detail.billing.depositHeld)} />
            <Metric
              label="Deposit dikembalikan / dipotong"
              value={`${formatIDR(detail.billing.depositRefunded)} / ${formatIDR(detail.billing.depositDeducted)}`}
            />
          </div>
          <p className="mt-3 text-sm text-foreground/75">{detail.billing.dpProgressLabel}</p>
          <UnavailableLink label="Tagihan belum menerima filter kamar aman pada KMO-W02A." />
        </DetailSection>

        <div className="grid items-stretch gap-5 xl:grid-cols-2">
          <DetailSection title="Kendaraan dan parkir" icon={Car}>
            {detail.vehicles.length ? (
              <ul className="divide-y divide-foreground/15">
                {detail.vehicles.map((vehicle) => (
                  <li key={vehicle.code} className="py-3 first:pt-0 last:pb-0">
                    <p className="break-words font-medium text-foreground">
                      {vehicle.code} · {vehicle.plateNumber}
                    </p>
                    <p className="text-sm text-foreground/70">
                      {operationalLabel(vehicle.vehicleType)} ·{" "}
                      {vehicle.parkingState
                        ? operationalLabel(vehicle.parkingState)
                        : "Parkir belum dialokasikan"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptySectionCopy text="Belum ada kendaraan aktif yang terkait penghuni kamar ini." />
            )}
            <UnavailableLink label="Kendaraan belum menerima filter kamar aman pada KMO-W02A." />
          </DetailSection>

          <DetailSection title="Komplain dan work order" icon={MessageSquareWarning}>
            {detail.complaints.length ? (
              <ul className="divide-y divide-foreground/15">
                {detail.complaints.map((complaint) => (
                  <li
                    key={`${complaint.code}:${complaint.workOrderCode ?? "none"}`}
                    className="py-3 first:pt-0 last:pb-0"
                  >
                    <p className="break-words font-medium text-foreground">
                      {complaint.code} · {complaint.category}
                    </p>
                    <p className="text-sm text-foreground/70">
                      {operationalLabel(complaint.status)} · Prioritas{" "}
                      {operationalLabel(complaint.priority)}
                    </p>
                    {complaint.workOrderCode ? (
                      <p className="mt-1 text-sm text-foreground/70">
                        {complaint.workOrderCode} ·{" "}
                        {complaint.workOrderStatus
                          ? operationalLabel(complaint.workOrderStatus)
                          : "Status belum tersedia"}
                        {complaint.technicianName ? ` · ${complaint.technicianName}` : ""}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptySectionCopy text="Tidak ada komplain aktif untuk kamar ini." />
            )}
            <UnavailableLink label="Komplain belum menerima filter kamar aman pada KMO-W02A." />
          </DetailSection>
        </div>

        <DetailSection title="Aktivitas kamar" icon={History}>
          {detail.timeline.length ? (
            <ol className="space-y-3">
              {detail.timeline.map((event, index) => (
                <li
                  key={`${event.eventType}:${event.occurredAt}:${index}`}
                  className="flex items-start gap-3"
                >
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-foreground/65" />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-foreground">{event.label}</p>
                    <p className="text-xs text-foreground/70">{formatDate(event.occurredAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptySectionCopy text="Belum ada aktivitas aman yang dapat ditampilkan." />
          )}
        </DetailSection>
      </div>

      <RoomInventoryEditor
        room={room}
        propertyId={currentPropertyId}
        category={detail.category.code}
        types={types}
        buildings={buildings}
        canPersist={editorReady}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={(updated: RoomInventory) => {
          if (updated.number !== detail.number) {
            void navigate({
              replace: true,
              to: "/rooms/$roomNumber",
              params: { roomNumber: updated.number },
            });
          }
        }}
      />
    </AppShell>
  );
}

function DetailSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Home;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="min-w-0 h-full">
      <Card className="h-full min-w-0 border-foreground/15 bg-card shadow-sm">
        <CardHeader className="border-b border-foreground/10 px-6 py-5">
          <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold">
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            {title}
          </h2>
        </CardHeader>
        <CardContent className="min-w-0 px-6 pb-6 pt-5">{children}</CardContent>
      </Card>
    </section>
  );
}

function DefinitionGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid min-w-0 gap-x-8 gap-y-5 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
            {label}
          </dt>
          <dd className="mt-1 break-words text-sm font-medium leading-6 text-foreground">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-foreground/15 bg-muted/65 p-3">
      <p className="text-xs font-medium text-foreground/70">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function EmptySectionCopy({ text = EMPTY_TEXT }: { text?: string }) {
  return <p className="text-sm leading-6 text-foreground/70">{text}</p>;
}

function UnavailableLink({ label }: { label: string }) {
  return (
    <p className="mt-4 rounded-lg border border-dashed border-foreground/20 bg-muted/45 p-3 text-sm leading-6 text-foreground/70">
      {label}
    </p>
  );
}

function SafeAction({
  href,
  enabledLabel,
  unavailableLabel,
  icon: Icon,
}: {
  href: string | null;
  enabledLabel: string;
  unavailableLabel: string;
  icon: typeof Home;
}) {
  if (!href) return <UnavailableLink label={unavailableLabel} />;
  return (
    <Button variant="info" className="mt-4 min-h-11 max-w-full" asChild>
      <a href={href}>
        <Icon className="mr-2 h-4 w-4" />
        {enabledLabel}
      </a>
    </Button>
  );
}

function roomDetailErrorPresentation(error: unknown): { title: string; retry: boolean } {
  if (!error) return { title: "Kamar tidak ditemukan", retry: false };
  if (
    error instanceof Error &&
    (error.message.startsWith("Invalid room detail") ||
      error.message === "ROOM_DETAIL_SCOPE_MISMATCH")
  ) {
    return { title: "Respons detail kamar tidak valid", retry: true };
  }
  const normalized = normalizeAdminError(error);
  if (normalized.kind === "not-found") {
    return { title: "Kamar tidak ditemukan", retry: false };
  }
  if (normalized.kind === "forbidden") {
    return { title: "Akses detail kamar ditolak", retry: false };
  }
  return { title: "Detail kamar tidak tersedia", retry: true };
}

function moneyOrUnavailable(value: number | null): string {
  return value === null ? "Belum tersedia" : formatIDR(value);
}

function operationalLabel(value: string): string {
  const labels: Record<string, string> = {
    active: "Aktif",
    inactive: "Tidak aktif",
    suspended: "Ditangguhkan",
    yearly: "Tahunan",
    monthly: "Bulanan",
    bi_monthly: "Setiap dua bulan",
    open: "Terbuka",
    acknowledged: "Diterima",
    assigned: "Ditugaskan",
    in_progress: "Dikerjakan",
    on_hold: "Ditunda",
    completed: "Selesai",
    verified: "Terverifikasi",
    cancelled: "Dibatalkan",
    low: "Rendah",
    medium: "Sedang",
    high: "Tinggi",
    urgent: "Mendesak",
    motorcycle: "Motor",
    car: "Mobil",
    occupied: "Terisi",
    reserved: "Dipesan",
    available: "Tersedia",
    maintenance: "Perawatan",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}
