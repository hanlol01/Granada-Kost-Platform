// Admin Booking Lead Management (M17C). Consumes the M17B backend:
//   GET   /booking-leads                 (list + filters; manager|admin, room.read)
//   PATCH /booking-leads/:leadId/status  (manual status marker; room.manage)
// A lead is booking INTEREST only (M17A freeze): no room reservation, no invoice,
// no occupancy/resident creation, no payment, no exact room number exposure.
// WhatsApp remains the primary follow-up/confirmation channel.

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
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
  type BookingLeadStatus,
} from "@/hooks/useBookingLeads";
import { useUpdateBookingLeadStatus } from "@/hooks/useBookingLeadMutations";
import { buildLeadWhatsAppUrl } from "@/lib/whatsapp-lead";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { Inbox, MessageCircle, MoreHorizontal, Search, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/booking-leads")({ component: BookingLeadsPage });

const STATUS_CLS: Record<BookingLeadStatus, string> = {
  new: "bg-warning/20 text-warning-foreground",
  contacted: "bg-chart-4/15 text-chart-4",
  visit_scheduled: "bg-primary/10 text-primary",
  converted: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  expired: "bg-muted text-muted-foreground",
};

const SAFETY_NOTES = [
  "Belum otomatis reservasi kamar",
  "Tidak membuat invoice",
  "Konfirmasi tetap via admin/WhatsApp",
] as const;

function LeadStatusBadge({ status }: { status: BookingLeadStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap",
        STATUS_CLS[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {BOOKING_LEAD_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function interestLabel(lead: BookingLeadRecord): string {
  return [
    BOOKING_LEAD_CATEGORY_LABEL[lead.category] ?? lead.category,
    BOOKING_LEAD_GENDER_LABEL[lead.gender] ?? lead.gender,
  ].join(" · ");
}

function interestDetail(lead: BookingLeadRecord): string | null {
  const parts: string[] = [];
  if (lead.buildingCode) parts.push(`Unit ${lead.buildingCode}`);
  if (lead.floorCode) parts.push(`Lantai ${lead.floorCode}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function whatsAppUrlFor(lead: BookingLeadRecord): string | null {
  return buildLeadWhatsAppUrl({
    visitorName: lead.visitorName,
    visitorPhone: lead.visitorPhone,
    categoryLabel: BOOKING_LEAD_CATEGORY_LABEL[lead.category] ?? lead.category,
    genderLabel: BOOKING_LEAD_GENDER_LABEL[lead.gender] ?? lead.gender,
    preferredMoveInDate: lead.preferredMoveInDate ? formatDate(lead.preferredMoveInDate) : null,
  });
}

function BookingLeadsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | BookingLeadStatus>("all");
  const [category, setCategory] = useState<"all" | BookingLeadCategory>("all");
  const [gender, setGender] = useState<"all" | BookingLeadGender>("all");
  const [pending, setPending] = useState<{
    lead: BookingLeadRecord;
    next: BookingLeadStatus;
  } | null>(null);

  const { hasPermission } = useAuth();
  const canManage = hasPermission("room.manage");

  const { data, isLoading, error, refetch, isFetching } = useBookingLeads({
    status: status === "all" ? undefined : status,
    category: category === "all" ? undefined : category,
    gender: gender === "all" ? undefined : gender,
    limit: 100,
  });

  const statusMut = useUpdateBookingLeadStatus();

  const filtered = useMemo(() => {
    const leads = data ?? [];
    if (!q) return leads;
    const needle = q.toLowerCase();
    const digits = q.replace(/\D+/g, "");
    return leads.filter(
      (l) =>
        l.visitorName.toLowerCase().includes(needle) ||
        (digits.length > 0 && l.visitorPhone.includes(digits)) ||
        (l.buildingCode?.toLowerCase().includes(needle) ?? false),
    );
  }, [data, q]);

  const hasFilter = q !== "" || status !== "all" || category !== "all" || gender !== "all";

  const confirmDescription = (lead: BookingLeadRecord, next: BookingLeadStatus): string => {
    const base = `${lead.visitorName} · ${interestLabel(lead)}`;
    if (next === "converted") {
      return `${base}. Status Dikonversi hanya penanda manual pada MVP ini - tidak membuat penghuni, occupancy, invoice, atau reservasi kamar otomatis. Status ini terminal.`;
    }
    if (next === "rejected" || next === "expired") {
      return `${base}. Status ini terminal dan tidak dapat diubah kembali.`;
    }
    return base;
  };

  const runTransition = async (lead: BookingLeadRecord, next: BookingLeadStatus) => {
    try {
      await statusMut.mutateAsync({ leadId: lead.id, status: next });
      setPending(null);
    } catch {
      // Already toasted by the mutation hook.
    }
  };

  return (
    <AppShell
      title="Minat Booking"
      subtitle="Kelola calon penyewa dari halaman publik /kamar. Lead belum menjadi booking resmi sampai dikonfirmasi admin."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {SAFETY_NOTES.map((note) => (
          <span
            key={note}
            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> {note}
          </span>
        ))}
        <span className="text-xs text-muted-foreground">
          Status Dikonversi hanya penanda manual pada MVP ini.
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama, nomor WhatsApp, atau unit..."
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as "all" | BookingLeadStatus)}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="new">Baru</SelectItem>
            <SelectItem value="contacted">Sudah Dihubungi</SelectItem>
            <SelectItem value="visit_scheduled">Jadwal Survey</SelectItem>
            <SelectItem value="converted">Dikonversi</SelectItem>
            <SelectItem value="rejected">Ditolak</SelectItem>
            <SelectItem value="expired">Kedaluwarsa</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={category}
          onValueChange={(v) => setCategory(v as "all" | BookingLeadCategory)}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Kategori</SelectItem>
            <SelectItem value="rukost">Rumah Kost</SelectItem>
            <SelectItem value="apartkost">Apart Kost</SelectItem>
          </SelectContent>
        </Select>
        <Select value={gender} onValueChange={(v) => setGender(v as "all" | BookingLeadGender)}>
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Gender</SelectItem>
            <SelectItem value="male">Putra</SelectItem>
            <SelectItem value="female">Putri</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <ErrorState
          error={error}
          onRetry={() => refetch()}
          title="Data minat booking belum dapat dimuat."
        />
      ) : isLoading ? (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<Inbox className="h-5 w-5" />}
              title={hasFilter ? "Tidak ada lead yang cocok" : "Belum ada minat booking."}
              description={
                hasFilter
                  ? "Ubah pencarian atau filter status/kategori/gender."
                  : "Lead akan tampil setelah pengunjung mengajukan minat dari halaman publik /kamar."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card className={cn(isFetching && "opacity-90 transition-opacity")}>
          <CardContent className="p-0">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Pengunjung</th>
                    <th className="px-5 py-3 font-medium">Minat</th>
                    <th className="px-5 py-3 font-medium">Tanggal Pindah</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Masuk</th>
                    <th className="px-5 py-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => {
                    const transitions = allowedBookingLeadTransitions(l.status);
                    const waUrl = whatsAppUrlFor(l);
                    return (
                      <tr
                        key={l.id}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-5 py-3">
                          <p className="font-medium">{l.visitorName}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {l.visitorPhone}
                          </p>
                          {l.visitorMessage ? (
                            <p
                              className="text-xs text-muted-foreground italic max-w-[260px] truncate"
                              title={l.visitorMessage}
                            >
                              {l.visitorMessage}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-medium">{interestLabel(l)}</p>
                          {interestDetail(l) ? (
                            <p className="text-xs text-muted-foreground">{interestDetail(l)}</p>
                          ) : null}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">
                          {l.preferredMoveInDate ? formatDate(l.preferredMoveInDate) : "–"}
                        </td>
                        <td className="px-5 py-3">
                          <LeadStatusBadge status={l.status} />
                        </td>
                        <td className="px-5 py-3">
                          <p>{formatDate(l.createdAt)}</p>
                          <p className="text-xs text-muted-foreground">
                            {BOOKING_LEAD_SOURCE_LABEL[l.source] ?? l.source} · Update{" "}
                            {formatDate(l.updatedAt)}
                          </p>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {waUrl ? (
                              <Button asChild variant="outline" size="sm">
                                <a href={waUrl} target="_blank" rel="noopener noreferrer">
                                  <MessageCircle className="h-3.5 w-3.5 mr-1" /> Hubungi via
                                  WhatsApp
                                </a>
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Nomor tidak valid
                              </span>
                            )}
                            {canManage && transitions.length > 0 ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm" aria-label="Ubah status lead">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {transitions.map((next, idx) => (
                                    <div key={next}>
                                      {idx > 0 ? <DropdownMenuSeparator /> : null}
                                      <DropdownMenuItem
                                        className={
                                          next === "rejected" || next === "expired"
                                            ? "text-destructive"
                                            : undefined
                                        }
                                        onClick={() => setPending({ lead: l, next })}
                                      >
                                        {BOOKING_LEAD_STATUS_LABEL[next]}
                                      </DropdownMenuItem>
                                    </div>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-border">
              {filtered.map((l) => {
                const transitions = allowedBookingLeadTransitions(l.status);
                const waUrl = whatsAppUrlFor(l);
                return (
                  <div key={l.id} className="p-4 flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary-soft text-primary flex items-center justify-center shrink-0">
                      <Inbox className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{l.visitorName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{l.visitorPhone}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {interestLabel(l)}
                        {interestDetail(l) ? ` · ${interestDetail(l)}` : ""}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <LeadStatusBadge status={l.status} />
                        {waUrl ? (
                          <Button asChild variant="outline" size="sm">
                            <a href={waUrl} target="_blank" rel="noopener noreferrer">
                              <MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {canManage && transitions.length > 0 ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" aria-label="Ubah status lead">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {transitions.map((next) => (
                            <DropdownMenuItem
                              key={next}
                              className={
                                next === "rejected" || next === "expired"
                                  ? "text-destructive"
                                  : undefined
                              }
                              onClick={() => setPending({ lead: l, next })}
                            >
                              {BOOKING_LEAD_STATUS_LABEL[next]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending ? `Ubah status ke ${BOOKING_LEAD_STATUS_LABEL[pending.next]}` : ""}
        description={pending ? confirmDescription(pending.lead, pending.next) : null}
        confirmLabel={pending ? BOOKING_LEAD_STATUS_LABEL[pending.next] : "Konfirmasi"}
        destructive={pending ? pending.next === "rejected" || pending.next === "expired" : false}
        pending={statusMut.isPending}
        onConfirm={async () => {
          if (!pending) return;
          await runTransition(pending.lead, pending.next);
        }}
      />
    </AppShell>
  );
}
