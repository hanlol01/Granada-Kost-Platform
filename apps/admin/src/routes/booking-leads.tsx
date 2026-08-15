import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Eye,
  Globe2,
  Inbox,
  Loader2,
  Lock,
  MoreHorizontal,
  MonitorSmartphone,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Unlock,
} from "lucide-react";
import { BookingLeadDetailsDialog } from "@/components/booking-leads/BookingLeadDetailsDialog";
import { BookingLeadStatusBadge } from "@/components/booking-leads/BookingLeadStatusBadge";
import { CompleteBookingLeadDialog } from "@/components/booking-leads/CompleteBookingLeadDialog";
import {
  BookingLeadHoldDialog,
  BookingLeadHoldStatus,
} from "@/components/booking-leads/BookingLeadHoldDialog";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterResultNotice } from "@/components/ui/filter-result-notice";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useBookingLeadHolds } from "@/hooks/useBookingLeadHolds";
import { useArchiveBookingLead, useUpdateBookingLeadStatus } from "@/hooks/useBookingLeadMutations";
import {
  allowedBookingLeadTransitions,
  BOOKING_LEAD_CATEGORY_LABEL,
  BOOKING_LEAD_GENDER_LABEL,
  BOOKING_LEAD_SOURCE_LABEL,
  BOOKING_LEAD_STATUS_LABEL,
  useBookingLeads,
  type BookingLeadCategory,
  type BookingLeadGender,
  type BookingLeadRecord,
  type BookingLeadSource,
  type BookingLeadStatus,
} from "@/hooks/useBookingLeads";
import {
  activeBookingLeadHold,
  canCreateBookingLeadHold,
  canReleaseBookingLeadHold,
  type BookingLeadHoldRecord,
} from "@/lib/admin-booking-lead-hold";
import { isBookingHoldWriteEnabledForProperty } from "@/lib/admin-ux-dashboard";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";
import { useProperty } from "@/lib/property";
import { cn } from "@/lib/utils";
import { buildLeadWhatsAppUrl } from "@/lib/whatsapp-lead";

export const Route = createFileRoute("/booking-leads")({ component: BookingLeadsPage });

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;
const BOOKING_LEAD_STATUS_OPTIONS = Object.entries(BOOKING_LEAD_STATUS_LABEL) as [
  BookingLeadStatus,
  string,
][];
const WHATSAPP_BUTTON_CLASS =
  "min-h-11 min-w-[7.5rem] justify-center bg-[#25D366] text-white shadow-sm shadow-[#25D366]/20 hover:bg-[#1ebe5d] hover:text-white focus-visible:ring-[#25D366]/50 dark:text-black dark:hover:text-black";

function WhatsAppIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

function LeadStatusBadge({ status }: { status: BookingLeadStatus }) {
  return <BookingLeadStatusBadge label={BOOKING_LEAD_STATUS_LABEL[status]} status={status} />;
}

function LeadSourceBadge({ source }: { source: BookingLeadRecord["source"] }) {
  const isPublic = source === "public_kamar";
  const Icon = isPublic ? Globe2 : MonitorSmartphone;
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        isPublic
          ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
          : "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {BOOKING_LEAD_SOURCE_LABEL[source] ?? source}
    </span>
  );
}

function roomTarget(lead: BookingLeadRecord): string {
  if (!lead.roomNumber) return "Belum dipilih";
  return lead.roomNumber;
}

function moveInDate(lead: BookingLeadRecord): string {
  if (lead.status === "leased") {
    return lead.activeLeaseStartDate
      ? formatDate(lead.activeLeaseStartDate)
      : "Tanggal sewa belum tersedia";
  }
  return lead.preferredMoveInDate ? formatDate(lead.preferredMoveInDate) : "Belum ditentukan";
}

function whatsAppUrlFor(lead: BookingLeadRecord): string | null {
  return buildLeadWhatsAppUrl({
    visitorName: lead.visitorName,
    visitorPhone: lead.visitorPhone,
    categoryLabel: BOOKING_LEAD_CATEGORY_LABEL[lead.category],
    genderLabel: BOOKING_LEAD_GENDER_LABEL[lead.gender],
    preferredMoveInDate: lead.preferredMoveInDate ? formatDate(lead.preferredMoveInDate) : null,
  });
}

function BookingLeadsPage() {
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | BookingLeadStatus>("all");
  const [category, setCategory] = useState<"all" | BookingLeadCategory>("all");
  const [gender, setGender] = useState<"all" | BookingLeadGender>("all");
  const [source, setSource] = useState<"all" | BookingLeadSource>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedLead, setSelectedLead] = useState<BookingLeadRecord | null>(null);
  const [pending, setPending] = useState<{
    lead: BookingLeadRecord;
    next: BookingLeadStatus;
    idempotencyKey: string;
  } | null>(null);
  const [holdIntent, setHoldIntent] = useState<{
    mode: "create" | "release" | "cancel";
    lead: BookingLeadRecord;
    hold: BookingLeadHoldRecord | null;
  } | null>(null);
  const [completionLead, setCompletionLead] = useState<BookingLeadRecord | null>(null);

  const { user, hasPermission } = useAuth();
  const { currentPropertyId } = useProperty();
  const navigate = Route.useNavigate();
  const canManage = hasPermission("room.manage");
  const canManageOnboarding =
    hasPermission("resident.manage") &&
    Boolean(user?.roles.some((role) => role === "owner" || role === "manager" || role === "admin"));
  const canManageHolds =
    canManage && Boolean(user?.roles.some((role) => role === "manager" || role === "admin"));
  const leadsQuery = useBookingLeads({
    status: status === "all" ? undefined : status,
    category: category === "all" ? undefined : category,
    gender: gender === "all" ? undefined : gender,
    source: source === "all" ? undefined : source,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    search: search || undefined,
    limit: PAGE_SIZE,
    offset,
  });
  const statusMutation = useUpdateBookingLeadStatus();
  const archiveMutation = useArchiveBookingLead();
  const holdsQuery = useBookingLeadHolds();
  const holdCoverage = holdsQuery.data ?? null;
  const [holdNow, setHoldNow] = useState(() => Date.now());
  const bookingHoldWriteEnabled = isBookingHoldWriteEnabledForProperty(
    user?.propertyRollouts,
    currentPropertyId,
  );

  useEffect(() => {
    setOffset(0);
    setPending(null);
    setSelectedLead(null);
    setHoldIntent(null);
  }, [currentPropertyId]);

  useEffect(() => {
    setHoldNow(Date.now());
    const interval = setInterval(() => setHoldNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, [currentPropertyId]);

  useEffect(() => {
    const nextSearch = searchDraft.trim();
    const timeout = window.setTimeout(() => {
      if (nextSearch === search) return;
      setOffset(0);
      setSearch(nextSearch);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [search, searchDraft]);

  const holdAccess = {
    roles: user?.roles ?? [],
    permissions: user?.permissions ?? [],
    propertyId: currentPropertyId,
  };
  const leads = leadsQuery.data?.data ?? [];
  const meta = leadsQuery.data?.meta;
  const hasFilter =
    search !== "" ||
    status !== "all" ||
    category !== "all" ||
    gender !== "all" ||
    source !== "all" ||
    dateFrom !== "" ||
    dateTo !== "";
  const activeFilterCount =
    Number(search !== "") +
    Number(status !== "all") +
    Number(category !== "all") +
    Number(gender !== "all") +
    Number(source !== "all") +
    Number(dateFrom !== "") +
    Number(dateTo !== "");
  const filterSignature = [search, status, category, gender, source, dateFrom, dateTo].join("|");
  const filterCriteria = [
    search ? `pencarian \"${search}\"` : "",
    status !== "all" ? `status: ${BOOKING_LEAD_STATUS_LABEL[status]}` : "",
    category !== "all" ? `kategori: ${BOOKING_LEAD_CATEGORY_LABEL[category]}` : "",
    gender !== "all" ? `jenis kelamin: ${BOOKING_LEAD_GENDER_LABEL[gender]}` : "",
    source !== "all" ? `sumber: ${BOOKING_LEAD_SOURCE_LABEL[source]}` : "",
    dateFrom && dateTo
      ? `dicatat ${formatDate(dateFrom)} sampai ${formatDate(dateTo)}`
      : dateFrom
        ? `dicatat mulai ${formatDate(dateFrom)}`
        : dateTo
          ? `dicatat sampai ${formatDate(dateTo)}`
          : "",
  ].filter(Boolean);

  const resetFilters = () => {
    setSearchDraft("");
    setSearch("");
    setStatus("all");
    setCategory("all");
    setGender("all");
    setSource("all");
    setDateFrom("");
    setDateTo("");
    setOffset(0);
  };

  const openHoldDialog = (lead: BookingLeadRecord) => {
    const hold = activeBookingLeadHold(holdCoverage, lead);
    if (hold?.holdStatus === "committed" && lead.status === "onboarding") {
      setHoldIntent({ mode: "cancel", lead, hold });
      return;
    }
    if (canReleaseBookingLeadHold({ ...holdAccess, lead, hold })) {
      setHoldIntent({ mode: "release", lead, hold });
      return;
    }
    if (
      canCreateBookingLeadHold({
        ...holdAccess,
        propertyRollouts: user?.propertyRollouts,
        lead,
        coverage: holdCoverage,
      })
    ) {
      setHoldIntent({ mode: "create", lead, hold: null });
    }
  };

  const queueStatusChange = (lead: BookingLeadRecord, next: BookingLeadStatus) => {
    setPending({ lead, next, idempotencyKey: newIdempotencyKey() });
  };

  const runTransition = async () => {
    if (!pending || !currentPropertyId || pending.lead.propertyId !== currentPropertyId) return;
    try {
      await statusMutation.mutateAsync({
        propertyId: currentPropertyId,
        leadId: pending.lead.id,
        status: pending.next,
        idempotencyKey: pending.idempotencyKey,
      });
      setPending(null);
    } catch {
      // The mutation hook provides safe recovery feedback; keep the same key for retry.
    }
  };

  const setCategoryFilter = (next: "all" | BookingLeadCategory) => {
    setCategory(next);
    setOffset(0);
    setSelectedLead(null);
  };

  return (
    <AppShell
      title="Minat Booking"
      subtitle="Antrean calon penyewa dari publik /kamar dan input cepat Admin. Minat belum menjadi penyewaan atau occupancy."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {[
          "Belum otomatis menahan kamar",
          "Tidak membuat penghuni atau penyewaan",
          "WhatsApp hanya membuka komunikasi manual",
        ].map((note) => (
          <span
            key={note}
            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> {note}
          </span>
        ))}
      </div>
      {canManageOnboarding ? (
        <div className="mb-4 flex justify-end">
          <Button
            type="button"
            variant="default"
            className="min-h-11 shadow-sm shadow-primary/20"
            onClick={() => navigate({ to: "/tenants", search: { flow: "new-lease" } })}
          >
            <Plus aria-hidden="true" />
            Tambah Penyewaan
          </Button>
        </div>
      ) : null}

      {holdsQuery.accessEnabled && holdsQuery.isPending ? (
        <div
          role="status"
          className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Memuat status tahanan
          kamar...
        </div>
      ) : null}
      {canManageHolds && !bookingHoldWriteEnabled ? (
        <div className="mb-4 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Penahanan kamar belum diaktifkan untuk property ini. Tahanan aktif tetap dapat dilepaskan.
        </div>
      ) : null}
      {holdsQuery.accessEnabled && holdsQuery.isError ? (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <ErrorState
            error={holdsQuery.error}
            onRetry={() => void holdsQuery.refetch()}
            title="Status tahanan kamar belum dapat dimuat."
          />
        </div>
      ) : null}

      <section
        aria-label="Pencarian dan filter minat booking"
        className="mb-4 rounded-xl border border-border bg-card p-3"
      >
        <div className="grid gap-3 lg:grid-cols-12">
          <div className="relative min-w-0 lg:col-span-5">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Cari calon penyewa"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Cari nama, WhatsApp, email, universitas, kamar, atau bangunan..."
              className="h-11 pl-9"
            />
          </div>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as "all" | BookingLeadStatus);
              setOffset(0);
            }}
          >
            <SelectTrigger className="min-h-11 lg:col-span-3" aria-label="Filter status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              {BOOKING_LEAD_STATUS_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={source}
            onValueChange={(value) => {
              setSource(value as "all" | BookingLeadSource);
              setOffset(0);
            }}
          >
            <SelectTrigger className="min-h-11 lg:col-span-2" aria-label="Filter sumber data">
              <SelectValue placeholder="Semua sumber" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Sumber</SelectItem>
              <SelectItem value="public_kamar">Halaman Publik</SelectItem>
              <SelectItem value="admin_quick_entry">Input Cepat Admin</SelectItem>
            </SelectContent>
          </Select>
          <Button
            className="min-h-11 lg:col-span-2"
            type="button"
            variant="destructive"
            disabled={!hasFilter}
            onClick={resetFilters}
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Reset Filter
          </Button>

          <Select
            value={category}
            onValueChange={(value) => setCategoryFilter(value as "all" | BookingLeadCategory)}
          >
            <SelectTrigger className="min-h-11 lg:col-span-3" aria-label="Filter kategori kost">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kategori</SelectItem>
              <SelectItem value="rukost">Rumah Kost</SelectItem>
              <SelectItem value="apartkost">Apart Kost</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={gender}
            onValueChange={(value) => {
              setGender(value as "all" | BookingLeadGender);
              setOffset(0);
            }}
          >
            <SelectTrigger className="min-h-11 lg:col-span-3" aria-label="Filter jenis kelamin">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Jenis Kelamin</SelectItem>
              <SelectItem value="male">Putra</SelectItem>
              <SelectItem value="female">Putri</SelectItem>
            </SelectContent>
          </Select>
          <div className="lg:col-span-6">
            <div className="grid grid-cols-[minmax(0,1fr)_1.25rem_minmax(0,1fr)] items-center gap-2">
              <HeroUiDatePicker
                ariaLabel="Tanggal pencatatan awal"
                id="lead-date-from"
                maxDate={dateTo || undefined}
                onChange={(value) => {
                  setDateFrom(value ?? "");
                  setOffset(0);
                }}
                placeholder="dd/mm/yyyy"
                value={dateFrom}
              />
              <span
                aria-hidden="true"
                className="text-center text-base font-semibold text-muted-foreground"
              >
                –
              </span>
              <HeroUiDatePicker
                ariaLabel="Tanggal pencatatan akhir"
                id="lead-date-to"
                minDate={dateFrom || undefined}
                onChange={(value) => {
                  setDateTo(value ?? "");
                  setOffset(0);
                }}
                placeholder="dd/mm/yyyy"
                value={dateTo}
              />
            </div>
          </div>
        </div>
      </section>

      {!leadsQuery.isLoading && !leadsQuery.isFetching && !leadsQuery.error && meta ? (
        <FilterResultNotice
          key={filterSignature}
          className="mb-4"
          entityLabel="minat booking"
          resultCount={meta.total}
          activeFilterCount={activeFilterCount}
          searchTerm={search}
          criteria={filterCriteria}
        />
      ) : null}

      {leadsQuery.error ? (
        <ErrorState
          error={leadsQuery.error}
          onRetry={() => void leadsQuery.refetch()}
          title="Data minat booking belum dapat dimuat."
        />
      ) : leadsQuery.isLoading ? (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 p-4">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : leads.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<Inbox className="h-5 w-5" />}
              title={
                offset > 0
                  ? "Tidak ada lead di halaman ini"
                  : hasFilter
                    ? "Tidak ada lead yang cocok"
                    : "Belum ada minat booking"
              }
              description={
                offset > 0
                  ? "Kembali ke halaman sebelumnya untuk melihat antrean yang tersedia."
                  : hasFilter
                    ? "Ubah pencarian atau filter antrean."
                    : "Lead publik dan input cepat Admin akan tampil di sini."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card className={cn(leadsQuery.isFetching && "opacity-90 transition-opacity")}>
          <CardContent className="p-0">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1180px] text-sm">
                <thead className="border-b border-border bg-muted/40">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">No</th>
                    <th className="px-4 py-3 font-medium">Calon Penyewa</th>
                    <th className="px-4 py-3 font-medium">Kategori Kost</th>
                    <th className="px-4 py-3 font-medium">Jenis Kelamin</th>
                    <th className="px-4 py-3 font-medium">Universitas/Pendidikan</th>
                    <th className="px-4 py-3 font-medium">Sumber</th>
                    <th className="px-4 py-3 font-medium">Kamar/Target</th>
                    <th className="px-4 py-3 font-medium">Rencana Masuk</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, index) => {
                    const transitions = allowedBookingLeadTransitions(lead.status);
                    const waUrl = whatsAppUrlFor(lead);
                    const activeHold = activeBookingLeadHold(holdCoverage, lead);
                    const canCreateHold = canCreateBookingLeadHold({
                      ...holdAccess,
                      propertyRollouts: user?.propertyRollouts,
                      lead,
                      coverage: holdCoverage,
                    });
                    const canReleaseHold = canReleaseBookingLeadHold({
                      ...holdAccess,
                      lead,
                      hold: activeHold,
                    });
                    const canCancelCommittedHold = Boolean(
                      activeHold?.holdStatus === "committed" &&
                      lead.status === "onboarding" &&
                      holdAccess.permissions.includes("room.manage"),
                    );
                    return (
                      <tr
                        key={lead.id}
                        className="border-b border-border last:border-0 hover:bg-muted/30"
                      >
                        <td className="px-4 py-3 text-muted-foreground">{offset + index + 1}</td>
                        <td className="max-w-52 px-4 py-3">
                          <p className="break-words font-medium">{lead.visitorName}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {lead.visitorPhone}
                          </p>
                        </td>
                        <td className="px-4 py-3">{BOOKING_LEAD_CATEGORY_LABEL[lead.category]}</td>
                        <td className="px-4 py-3">{BOOKING_LEAD_GENDER_LABEL[lead.gender]}</td>
                        <td className="max-w-52 px-4 py-3 break-words text-muted-foreground">
                          {lead.visitorUniversity || "Belum tersedia"}
                        </td>
                        <td className="px-4 py-3">
                          <LeadSourceBadge source={lead.source} />
                        </td>
                        <td className="max-w-52 px-4 py-3 break-words">{roomTarget(lead)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{moveInDate(lead)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1.5">
                            <LeadStatusBadge status={lead.status} />
                            {activeHold ? (
                              <BookingLeadHoldStatus hold={activeHold} now={holdNow} compact />
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              className="min-h-11"
                              size="sm"
                              variant="info"
                              onClick={() => setSelectedLead(lead)}
                            >
                              <Eye className="mr-1 h-4 w-4" /> Detail
                            </Button>
                            {!holdsQuery.isPending &&
                            !holdsQuery.isError &&
                            (canCreateHold || canReleaseHold || canCancelCommittedHold) ? (
                              <Button
                                className="min-h-11"
                                size="sm"
                                variant={
                                  canReleaseHold
                                    ? "outline"
                                    : canCancelCommittedHold
                                      ? "destructive"
                                      : "default"
                                }
                                onClick={() => openHoldDialog(lead)}
                              >
                                {canReleaseHold ? (
                                  <Unlock aria-hidden="true" />
                                ) : canCancelCommittedHold ? (
                                  <RotateCcw aria-hidden="true" />
                                ) : (
                                  <Lock aria-hidden="true" />
                                )}
                                {canReleaseHold
                                  ? "Lepaskan"
                                  : canCancelCommittedHold
                                    ? "Batalkan / Refund"
                                    : "Tahan Kamar"}
                              </Button>
                            ) : null}
                            {waUrl ? (
                              <Button className={WHATSAPP_BUTTON_CLASS} asChild size="sm">
                                <a href={waUrl} target="_blank" rel="noopener noreferrer">
                                  <WhatsAppIcon /> WhatsApp
                                </a>
                              </Button>
                            ) : null}
                            {canManage && transitions.length > 0 ? (
                              <StatusMenu
                                transitions={transitions}
                                onSelect={(next) => queueStatusChange(lead, next)}
                              />
                            ) : null}
                            {canManageOnboarding && activeHold && lead.status === "onboarding" ? (
                              <Button
                                className="min-h-11"
                                size="sm"
                                onClick={() =>
                                  navigate({
                                    to: "/tenants",
                                    search: { flow: "new-lease", bookingLeadId: lead.id },
                                  })
                                }
                              >
                                Lengkapi Data Penyewaan
                              </Button>
                            ) : null}
                            {canManageOnboarding &&
                            activeHold &&
                            [
                              "new",
                              "contacted",
                              "visit_scheduled",
                              "negotiating",
                              "awaiting_dp",
                            ].includes(lead.status) ? (
                              <Button
                                className="min-h-11"
                                size="sm"
                                onClick={() => setCompletionLead(lead)}
                              >
                                Selesaikan Minat Booking
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border md:hidden">
              {leads.map((lead, index) => {
                const transitions = allowedBookingLeadTransitions(lead.status);
                const waUrl = whatsAppUrlFor(lead);
                const activeHold = activeBookingLeadHold(holdCoverage, lead);
                const canCreateHold = canCreateBookingLeadHold({
                  ...holdAccess,
                  propertyRollouts: user?.propertyRollouts,
                  lead,
                  coverage: holdCoverage,
                });
                const canReleaseHold = canReleaseBookingLeadHold({
                  ...holdAccess,
                  lead,
                  hold: activeHold,
                });
                const canCancelCommittedHold = Boolean(
                  activeHold?.holdStatus === "committed" &&
                  lead.status === "onboarding" &&
                  holdAccess.permissions.includes("room.manage"),
                );
                return (
                  <article key={lead.id} className="min-w-0 space-y-3 p-4">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">No. {offset + index + 1}</p>
                        <h2 className="break-words font-medium">{lead.visitorName}</h2>
                        <p className="font-mono text-xs text-muted-foreground">
                          {lead.visitorPhone}
                        </p>
                      </div>
                      <LeadStatusBadge status={lead.status} />
                    </div>
                    <dl className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 text-sm">
                      <MobileFact
                        label="Kategori Kost"
                        value={BOOKING_LEAD_CATEGORY_LABEL[lead.category]}
                      />
                      <MobileFact
                        label="Jenis Kelamin"
                        value={BOOKING_LEAD_GENDER_LABEL[lead.gender]}
                      />
                      <MobileFact
                        label="Universitas/Pendidikan"
                        value={lead.visitorUniversity || "Belum tersedia"}
                      />
                      <div>
                        <dt className="text-xs text-muted-foreground">Sumber</dt>
                        <dd className="mt-1">
                          <LeadSourceBadge source={lead.source} />
                        </dd>
                      </div>
                      <MobileFact label="Kamar/Target" value={roomTarget(lead)} />
                      <MobileFact
                        label={lead.status === "leased" ? "Mulai Sewa" : "Rencana Masuk"}
                        value={moveInDate(lead)}
                      />
                    </dl>
                    {activeHold ? (
                      <BookingLeadHoldStatus hold={activeHold} now={holdNow} compact />
                    ) : null}
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <Button
                        className="min-h-11"
                        size="sm"
                        variant="info"
                        onClick={() => setSelectedLead(lead)}
                      >
                        <Eye className="mr-1 h-4 w-4" /> Detail
                      </Button>
                      {!holdsQuery.isPending &&
                      !holdsQuery.isError &&
                      (canCreateHold || canReleaseHold || canCancelCommittedHold) ? (
                        <Button
                          className="min-h-11"
                          size="sm"
                          variant={
                            canReleaseHold
                              ? "outline"
                              : canCancelCommittedHold
                                ? "destructive"
                                : "default"
                          }
                          onClick={() => openHoldDialog(lead)}
                        >
                          {canReleaseHold ? (
                            <Unlock aria-hidden="true" />
                          ) : canCancelCommittedHold ? (
                            <RotateCcw aria-hidden="true" />
                          ) : (
                            <Lock aria-hidden="true" />
                          )}
                          {canReleaseHold
                            ? "Lepaskan"
                            : canCancelCommittedHold
                              ? "Batalkan / Refund"
                              : "Tahan Kamar"}
                        </Button>
                      ) : null}
                      {waUrl ? (
                        <Button className={WHATSAPP_BUTTON_CLASS} asChild size="sm">
                          <a href={waUrl} target="_blank" rel="noopener noreferrer">
                            <WhatsAppIcon /> WhatsApp
                          </a>
                        </Button>
                      ) : null}
                      {canManage && transitions.length > 0 ? (
                        <StatusMenu
                          transitions={transitions}
                          onSelect={(next) => queueStatusChange(lead, next)}
                        />
                      ) : null}
                      {canManageOnboarding && activeHold && lead.status === "onboarding" ? (
                        <Button
                          className="min-h-11"
                          size="sm"
                          onClick={() =>
                            navigate({
                              to: "/tenants",
                              search: { flow: "new-lease", bookingLeadId: lead.id },
                            })
                          }
                        >
                          Lengkapi Data Penyewaan
                        </Button>
                      ) : null}
                      {canManageOnboarding &&
                      activeHold &&
                      [
                        "new",
                        "contacted",
                        "visit_scheduled",
                        "negotiating",
                        "awaiting_dp",
                      ].includes(lead.status) ? (
                        <Button
                          className="min-h-11"
                          size="sm"
                          onClick={() => setCompletionLead(lead)}
                        >
                          Selesaikan Minat Booking
                        </Button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {meta ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            {meta.total === 0
              ? "0 lead"
              : offset >= meta.total
                ? `Tidak ada lead di halaman ini · ${meta.total} lead total`
                : `${offset + 1}–${Math.min(offset + meta.limit, meta.total)} dari ${meta.total} lead`}
          </p>
          <div className="flex gap-2">
            <Button
              className="min-h-11"
              variant="outline"
              disabled={offset === 0 || leadsQuery.isFetching}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Sebelumnya
            </Button>
            <Button
              className="min-h-11"
              variant="outline"
              disabled={offset + PAGE_SIZE >= meta.total || leadsQuery.isFetching}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Berikutnya
            </Button>
          </div>
        </div>
      ) : null}

      <BookingLeadDetailsDialog
        lead={selectedLead}
        open={selectedLead !== null}
        onOpenChange={(open) => !open && setSelectedLead(null)}
        archivePending={archiveMutation.isPending}
        onArchive={async (lead) => {
          await archiveMutation.mutateAsync({
            propertyId: lead.propertyId,
            leadId: lead.id,
            idempotencyKey: newIdempotencyKey(),
          });
          setSelectedLead(null);
        }}
        onViewResident={(residentId) => {
          setSelectedLead(null);
          void navigate({ to: "/tenants/$residentId", params: { residentId } });
        }}
        onViewRoom={(roomNumber) => {
          setSelectedLead(null);
          void navigate({ to: "/rooms/$roomNumber", params: { roomNumber } });
        }}
      />
      <BookingLeadHoldDialog
        open={holdIntent !== null}
        mode={holdIntent?.mode ?? "create"}
        lead={holdIntent?.lead ?? null}
        hold={holdIntent?.hold ?? null}
        coverage={holdCoverage}
        onOpenChange={(open) => !open && setHoldIntent(null)}
      />
      <CompleteBookingLeadDialog
        lead={completionLead}
        open={completionLead !== null}
        onOpenChange={(open) => !open && setCompletionLead(null)}
        onComplete={(leadId) => {
          setCompletionLead(null);
          void navigate({
            to: "/tenants",
            search: { flow: "new-lease", bookingLeadId: leadId },
          });
        }}
      />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && !statusMutation.isPending && setPending(null)}
        title={pending ? `Ubah status ke ${BOOKING_LEAD_STATUS_LABEL[pending.next]}` : ""}
        description={
          pending
            ? `${pending.lead.visitorName}. ${pending.next === "rejected" || pending.next === "expired" ? "Status ini bersifat terminal." : "Tandai bahwa komunikasi manual sudah dilakukan."}`
            : null
        }
        confirmLabel={pending ? BOOKING_LEAD_STATUS_LABEL[pending.next] : "Konfirmasi"}
        destructive={pending ? pending.next === "rejected" || pending.next === "expired" : false}
        pending={statusMutation.isPending}
        onConfirm={runTransition}
      />
    </AppShell>
  );
}

function MobileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

function StatusMenu({
  transitions,
  onSelect,
}: {
  transitions: BookingLeadStatus[];
  onSelect: (status: BookingLeadStatus) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="min-h-11 min-w-11"
          variant="outline"
          size="sm"
          aria-label="Ubah status lead"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {transitions.map((next, index) => (
          <div key={next}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              className={next === "rejected" || next === "expired" ? "text-destructive" : undefined}
              onClick={() => onSelect(next)}
            >
              {BOOKING_LEAD_STATUS_LABEL[next]}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
