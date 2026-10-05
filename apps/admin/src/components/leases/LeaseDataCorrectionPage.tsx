/* Hallmark · macrostructure: Workbench / guided correction · theme: incumbent KOSTATION · tone: utilitarian */
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@granada-kost/api-client";
import type { FileResponse } from "@granada-kost/domain";
import { ArrowLeft, ArrowRight, Check, Loader2, RotateCcw, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingState } from "@/components/state";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
import { EvidenceFileUploadField } from "@/components/file/EvidenceFileUploadField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NoticeAlert } from "@/components/ui/notice-alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { useM6LeaseRoomChoices } from "@/hooks/useAdminUxLeases";
import { useOwnerAssetOptions } from "@/hooks/usePropertyOwners";
import { adminUxLeaseApi } from "@/lib/admin-ux-lease-api";
import type {
  LeaseDataCorrectionPreview,
  LeaseDataCorrectionRecord,
  LeaseDataCorrectionSnapshot,
} from "@/lib/admin-ux-lease-types";
import { useAuth } from "@/lib/auth";
import { adminErrorNotice, type AdminErrorNotice } from "@/lib/error-normalizer";
import { formatIDR } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";
import { formatIndonesianDate } from "@/lib/lease-onboarding-form";
import { refreshLeaseRevisionProjections } from "@/lib/lease-revision-cache";
import {
  LeaseRevisionContractError,
  type LeaseRevisionContext,
  type LeaseDataCorrectionInput,
} from "@/lib/lease-revision-contract";
import {
  buildLeaseRevisionProposal,
  createLeaseRevisionDraft,
  leaseRevisionChanges,
  validateLeaseRevisionDraft,
  type LeaseRevisionDraft,
  type LeaseRevisionErrors,
} from "@/lib/lease-revision-form";
import { useProperty } from "@/lib/property";
import { cn } from "@/lib/utils";
import { revealFirstValidationError } from "@/lib/validation-focus";
import type { LeaseRoomOption } from "@/lib/admin-ux-lease-types";
import { isTransferRoomGenderCompatible, normalizeRoomSearch } from "./transfer-shared";

const stages = ["Kamar", "Periode", "Ketentuan", "Tinjauan"] as const;
type CorrectionRoomFilter = "all" | "available" | "inspection_required" | "maintenance";

const CORRECTION_ROOM_STATUS_LABELS: Record<Exclude<CorrectionRoomFilter, "all">, string> = {
  available: "Tersedia",
  inspection_required: "Perlu pemeriksaan",
  maintenance: "Dalam perawatan",
};

function correctionRoomListStatus(
  room: LeaseRoomOption,
): Exclude<CorrectionRoomFilter, "all"> | null {
  if (room.roomStatus === "vacant" && !room.unavailableReason) return "available";
  if (room.roomStatus === "inspection_required" && room.unavailableReason === "inspection_required")
    return "inspection_required";
  if (room.roomStatus === "maintenance" && room.unavailableReason === "maintenance")
    return "maintenance";
  return null;
}

function correctionRoomMatchesSearch(room: LeaseRoomOption, search: string) {
  const query = normalizeRoomSearch(search);
  return (
    !query ||
    [room.number, room.buildingName, room.buildingCode, room.kostType.name, room.plotNumber]
      .filter((value): value is string => Boolean(value))
      .some((value) => normalizeRoomSearch(value).includes(query))
  );
}
const stageFields: (keyof LeaseRevisionErrors)[][] = [
  ["roomId", "roomRecordingErrorConfirmed", "evidenceFileIds"],
  ["startDate", "checkedInDate", "termMonths"],
  [
    "commercialMode",
    "pricingSource",
    "agreedMonthlyPrice",
    "pricingAgreementReason",
    "pricingVarianceAcknowledged",
    "sponsoringOwnerProfileId",
    "managementFeeMode",
    "managementFeePayerName",
    "ownerSponsorshipReason",
    "paymentPlanType",
    "billingCycle",
  ],
  ["reason", "changes"],
];
type Reviewed = {
  value: LeaseDataCorrectionPreview;
  proposal: LeaseDataCorrectionInput & { reason: string };
  version: number;
};

export function LeaseDataCorrectionPage({ leaseId }: { leaseId: string }) {
  const { currentPropertyId } = useProperty();
  const { hasRole, hasPermission } = useAuth();
  const authorized = hasRole("admin") && hasPermission("lease.manage");
  const context = useQuery({
    queryKey: ["lease-revision-context", currentPropertyId, leaseId],
    queryFn: ({ signal }) =>
      adminUxLeaseApi.leases.getRevisionContext(leaseId, currentPropertyId!, signal),
    enabled: authorized && Boolean(currentPropertyId),
    refetchOnWindowFocus: false,
    retry: false,
  });
  const notice = context.error
    ? adminErrorNotice(context.error, "Data koreksi belum dapat dimuat")
    : null;
  return (
    <AppShell
      title="Koreksi Data Penyewaan"
      subtitle="Perbaiki pencatatan tanpa menghapus riwayat penghuni, transaksi atau dokumen lama."
    >
      {!authorized ? (
        <NoticeAlert
          tone="destructive"
          title="Koreksi hanya tersedia bagi Admin"
          description="Gunakan akun Admin properti dengan izin mengelola penyewaan."
        />
      ) : !currentPropertyId ? (
        <NoticeAlert
          tone="warning"
          title="Pilih properti terlebih dahulu"
          description="Koreksi hanya dapat dilakukan pada penyewaan di properti aktif."
        />
      ) : context.isPending ? (
        <LoadingState />
      ) : notice && !context.data ? (
        <NoticeAlert
          id="revision-load-error"
          tone="destructive"
          title={notice.title}
          description={notice.description}
          action={
            <Button variant="info" onClick={() => void context.refetch()}>
              Coba lagi
            </Button>
          }
        />
      ) : context.data ? (
        <>
          {notice ? (
            <NoticeAlert
              tone="warning"
              title="Data terbaru belum dapat dimuat"
              description={notice.description}
              action={
                <Button variant="info" onClick={() => void context.refetch()}>
                  Perbarui data
                </Button>
              }
            />
          ) : null}
          <CorrectionWorkspace key={`${currentPropertyId}:${leaseId}`} context={context.data} />
        </>
      ) : null}
    </AppShell>
  );
}

function CorrectionWorkspace({ context }: { context: LeaseRevisionContext }) {
  // Preserve the reviewed baseline while editing; commit rechecks current facts.
  const [baseline] = useState(context);
  const [draft, setDraft] = useState(() => createLeaseRevisionDraft(baseline));
  const [stage, setStage] = useState(0);
  const [errors, setErrors] = useState<LeaseRevisionErrors>({});
  const [notice, setNotice] = useState<AdminErrorNotice | null>(null);
  const [pending, setPending] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [evidence, setEvidence] = useState<FileResponse[]>([]);
  const [reviewed, setReviewed] = useState<Reviewed | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [saved, setSaved] = useState<LeaseDataCorrectionRecord | null>(null);
  const [roomSearch, setRoomSearch] = useState("");
  const [roomCategory, setRoomCategory] = useState(baseline.room.category);
  const [roomFilter, setRoomFilter] = useState<CorrectionRoomFilter>("all");
  const [selectedReplacementRoom, setSelectedReplacementRoom] = useState<LeaseRoomOption | null>(
    null,
  );
  const deferredRoomSearch = useDeferredValue(roomSearch);
  const version = useRef(0);
  const intentKey = useRef<string | null>(null);
  const pendingRef = useRef(false);
  const mounted = useRef(true);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const queryClient = useQueryClient();
  const rooms = useM6LeaseRoomChoices(deferredRoomSearch, draft.startDate || undefined);
  const ownerAssets = useOwnerAssetOptions();
  const locked = pending || uncertain || Boolean(saved);
  const busy = locked || uploadBusy;
  const changed = leaseRevisionChanges(baseline, draft);
  const options = rooms.data?.items ?? [];
  const selectedRoom =
    options.find((room) => room.id === draft.roomId) ??
    (selectedReplacementRoom?.id === draft.roomId ? selectedReplacementRoom : undefined);
  const candidates = options.filter(
    (room) =>
      room.id !== baseline.room.id &&
      room.kostType.category === roomCategory &&
      isTransferRoomGenderCompatible(room.genderPolicy, baseline.lease.residentGender) &&
      correctionRoomListStatus(room) !== null &&
      correctionRoomMatchesSearch(room, roomSearch),
  );
  const filteredCandidates =
    roomFilter === "all"
      ? candidates
      : candidates.filter((room) => correctionRoomListStatus(room) === roomFilter);
  const visibleCandidates =
    selectedRoom &&
    selectedRoom.id !== baseline.room.id &&
    !filteredCandidates.some((room) => room.id === selectedRoom.id)
      ? [selectedRoom, ...filteredCandidates]
      : filteredCandidates;
  const asset =
    selectedRoom?.kostType.category === "rukost"
      ? ownerAssets.data?.rumahKostBuildings.find((item) => item.id === selectedRoom.buildingId)
      : ownerAssets.data?.apartKostRooms.find((item) => item.id === draft.roomId);
  const assignedOwner = ownerAssets.isPlaceholderData ? null : (asset?.currentOwner ?? null);
  const ownerNames = useMemo(() => {
    const names = new Map<string, string>();
    if (baseline.ownerSponsorship)
      names.set(baseline.ownerSponsorship.ownerProfileId, baseline.ownerSponsorship.ownerName);
    for (const item of [
      ...(ownerAssets.data?.rumahKostBuildings ?? []),
      ...(ownerAssets.data?.apartKostRooms ?? []),
    ]) {
      if (item.currentOwner) names.set(item.currentOwner.id, item.currentOwner.fullName);
    }
    return names;
  }, [baseline.ownerSponsorship, ownerAssets.data]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (Object.keys(errors).length) revealFirstValidationError(formRef.current);
      else headingRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [stage]);

  function update(patch: Partial<LeaseRevisionDraft>) {
    if (locked) return;
    version.current++;
    setDraft((current) => ({ ...current, ...patch }));
    setReviewed(null);
    intentKey.current = null;
    setNotice(null);
    setErrors({});
    setConfirmationOpen(false);
  }
  function selectCorrectionRoom(room: LeaseRoomOption | null) {
    const roomId = room?.id ?? baseline.room.id;
    setSelectedReplacementRoom(room);
    update({
      roomId,
      roomRecordingErrorConfirmed: false,
      ...(roomId !== baseline.room.id && draft.commercialMode === "owner_sponsored"
        ? { sponsoringOwnerProfileId: "" }
        : {}),
    });
  }
  function report(error: unknown, committing = false) {
    const unknownOutcome =
      committing &&
      (error instanceof LeaseRevisionContractError ||
        !ApiError.isApiError(error) ||
        error.status === 0 ||
        error.status >= 500);
    const copy = adminErrorNotice(
      unknownOutcome
        ? new LeaseRevisionContractError("LEASE_REVISION_COMMIT_RESPONSE_INVALID", "")
        : error,
      "Koreksi belum dapat diproses",
      error,
    );
    setNotice(copy);
    setConfirmationOpen(false);
    if (unknownOutcome) setUncertain(true);
    else if (committing) {
      setReviewed(null);
      intentKey.current = null;
    }
    toast.error(copy.title, { description: copy.description });
    requestAnimationFrame(() => document.getElementById("revision-action-error")?.focus());
  }
  function showValidation(nextErrors: LeaseRevisionErrors) {
    setErrors(nextErrors);
    const first = stageFields.findIndex((fields) => fields.some((field) => nextErrors[field]));
    if (first >= 0) setStage(first);
    toast.error("Periksa data koreksi", { description: Object.values(nextErrors)[0] });
    requestAnimationFrame(() => revealFirstValidationError(formRef.current));
  }
  function nextStage() {
    const all = validateLeaseRevisionDraft(baseline, draft);
    const currentErrors = Object.fromEntries(
      stageFields[stage].filter((field) => all[field]).map((field) => [field, all[field]]),
    );
    if (Object.keys(currentErrors).length) {
      showValidation(currentErrors);
      return;
    }
    setErrors({});
    setStage((current) => Math.min(current + 1, 3));
  }
  async function review() {
    if (busy || pendingRef.current) return;
    const all = validateLeaseRevisionDraft(baseline, draft);
    if (Object.keys(all).length) {
      showValidation(all);
      return;
    }
    const proposal = buildLeaseRevisionProposal(baseline, draft);
    const currentVersion = version.current;
    pendingRef.current = true;
    setPending(true);
    setNotice(null);
    try {
      const value = await adminUxLeaseApi.leases.previewDataCorrection(
        baseline.lease.id,
        proposal,
        baseline.lease.propertyId,
      );
      if (!mounted.current || version.current !== currentVersion) return;
      setReviewed({ value, proposal, version: currentVersion });
      intentKey.current = newIdempotencyKey();
      requestAnimationFrame(() => document.getElementById("revision-review-title")?.focus());
    } catch (error) {
      if (mounted.current) report(error);
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(false);
    }
  }
  async function commit() {
    if (
      pendingRef.current ||
      uploadBusy ||
      saved ||
      !reviewed ||
      !intentKey.current ||
      reviewed.version !== version.current
    )
      return;
    pendingRef.current = true;
    setPending(true);
    setNotice(null);
    try {
      const result = await adminUxLeaseApi.leases.commitDataCorrection(
        baseline.lease.id,
        reviewed.proposal,
        intentKey.current,
        baseline.lease.propertyId,
      );
      if (!mounted.current) return;
      setSaved(result.correction);
      setUncertain(false);
      setConfirmationOpen(false);
      toast.success(`Koreksi penyewaan ${baseline.lease.leaseCode} tersimpan`);
      requestAnimationFrame(() => document.getElementById("revision-saved")?.focus());
      // Refresh failure must never turn a confirmed database commit into a false save failure.
      const refreshed = await refreshLeaseRevisionProjections(queryClient, {
        propertyId: baseline.lease.propertyId,
        leaseId: baseline.lease.id,
        residentId: baseline.lease.residentId,
      });
      if (mounted.current && !refreshed)
        setNotice({
          title: "Koreksi tersimpan; tampilan lain perlu diperbarui",
          description:
            "Data sudah tersimpan. Buka ulang detail penghuni untuk memuat tampilan terbaru; jangan simpan koreksi yang sama lagi.",
          code: "REVISION_REFRESH_PENDING",
          kind: "network",
        });
    } catch (error) {
      if (mounted.current) report(error, true);
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(false);
    }
  }
  const error = (field: keyof LeaseRevisionErrors) =>
    errors[field] ? (
      <p id={`revision-${field}-error`} className="text-sm text-destructive" role="alert">
        {errors[field]}
      </p>
    ) : null;
  const invalid = (field: keyof LeaseRevisionErrors) => ({
    "aria-invalid": Boolean(errors[field]),
    "aria-describedby": errors[field] ? `revision-${field}-error` : undefined,
  });
  const policyLocked = !changed.mode && !baseline.policies.sponsorshipPolicyChange.allowed;
  const ownerOption =
    assignedOwner ??
    (!changed.room
      ? baseline.ownerSponsorship && {
          id: baseline.ownerSponsorship.ownerProfileId,
          fullName: baseline.ownerSponsorship.ownerName,
        }
      : null);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Button variant="info" asChild>
        <Link to="/tenants/$residentId" params={{ residentId: baseline.lease.residentId }}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Detail penghuni
        </Link>
      </Button>
      <Card className="border-info/40 bg-info/5">
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="break-words text-xl">{baseline.lease.residentName}</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              {baseline.lease.leaseCode} · Kamar {baseline.room.number} · No. Kavling{" "}
              {baseline.room.plotNumber || "—"}
            </p>
          </div>
          <StatusBadge
            label={baseline.lease.physicalCheckInRecorded ? "Sudah check-in" : "Belum check-in"}
            tone={baseline.lease.physicalCheckInRecorded ? "success" : "warning"}
          />
        </CardHeader>
        <CardContent>
          <p className="max-w-[72ch] text-sm leading-6 text-muted-foreground">
            Identitas penghuni tetap sama. Koreksi mencatat data sebelum dan sesudah, alasan, waktu
            dan Admin yang menyimpan. Untuk perpindahan fisik, gunakan Pindah Kamar.
          </p>
        </CardContent>
      </Card>
      <Card className="border-destructive/35 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-base">Tindakan penyewaan lainnya</CardTitle>
          <CardDescription className="max-w-[72ch] leading-6">
            Jika penyewaan ini salah dicatat dan perlu dibatalkan, lanjutkan ke tinjauan pembatalan.
            Untuk hunian yang benar-benar sudah berlangsung, gunakan proses check-out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" className="min-h-11" asChild>
            <Link to="/tenants/cancellation/$leaseId" params={{ leaseId: baseline.lease.id }}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Batalkan dan arsipkan penyewaan
            </Link>
          </Button>
        </CardContent>
      </Card>
      {!baseline.policies.correction.allowed ? (
        <NoticeAlert
          tone="warning"
          title="Penyewaan belum dapat dikoreksi"
          description={baseline.policies.correction.message}
        />
      ) : null}
      {notice ? (
        <NoticeAlert
          id="revision-action-error"
          tone={saved ? "info" : "destructive"}
          title={notice.title}
          description={notice.description}
        />
      ) : null}
      {saved ? (
        <NoticeAlert
          id="revision-saved"
          tone="success"
          title={`Koreksi ke-${saved.sequenceNumber} tersimpan`}
          description={`Penyewaan ${baseline.lease.leaseCode} telah diperbarui. Data lama dan transaksi tetap tersimpan dalam riwayat.`}
          action={
            <Button variant="info" asChild>
              <Link to="/tenants/$residentId" params={{ residentId: baseline.lease.residentId }}>
                Lihat riwayat koreksi
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <ol
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            aria-label="Tahap koreksi penyewaan"
          >
            {stages.map((label, index) => (
              <li key={label}>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-auto min-h-14 w-full justify-start whitespace-nowrap px-3",
                    stage === index && "border-info/45 bg-info/10 text-info hover:bg-info/15",
                    index < stage &&
                      "border-success/45 bg-success/10 text-success hover:bg-success/15",
                  )}
                  disabled={busy || index > stage}
                  aria-current={stage === index ? "step" : undefined}
                  onClick={() => {
                    setErrors({});
                    setStage(index);
                  }}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs",
                      stage === index && "bg-info/15 text-info",
                      index < stage && "bg-success/15 text-success",
                    )}
                  >
                    {index < stage ? <Check className="size-4" aria-hidden="true" /> : index + 1}
                  </span>
                  {label}
                </Button>
              </li>
            ))}
          </ol>
          <form
            ref={formRef}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (stage < 3) nextStage();
              else void review();
            }}
            className="space-y-6"
            aria-busy={pending}
          >
            <fieldset
              disabled={locked || !baseline.policies.correction.allowed}
              className="min-w-0 space-y-6"
            >
              <Card>
                <CardHeader>
                  <CardTitle ref={headingRef} tabIndex={-1} className="text-lg outline-none">
                    {
                      [
                        "Penghuni dan kamar",
                        "Periode dan check-in",
                        "Tarif dan jenis hunian",
                        "Tinjau koreksi sebelum disimpan",
                      ][stage]
                    }
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {stage === 0 ? (
                    <>
                      <NoticeAlert
                        density="compact"
                        title="Pertahankan kamar atau koreksi pencatatan"
                        description="Kamar tidak dilepas ketika Anda mempertahankannya. Pilih kamar lain hanya jika kamar pada pencatatan awal memang keliru."
                      />
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="revision-roomPickerSearch">
                            Pilih kamar yang perlu dikoreksi
                          </Label>
                          <div className="relative">
                            <Search
                              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <Input
                              id="revision-roomPickerSearch"
                              className="pl-10"
                              placeholder="Cari nomor kamar, bangunan, jenis kost, atau kavling"
                              value={roomSearch}
                              disabled={locked || !baseline.policies.roomCorrection.allowed}
                              autoComplete="off"
                              {...invalid("roomId")}
                              aria-describedby={[
                                "revision-room-picker-help",
                                invalid("roomId")["aria-describedby"],
                              ].filter(Boolean).join(" ")}
                              onChange={(event) => setRoomSearch(event.target.value)}
                            />
                          </div>
                          <p
                            id="revision-room-picker-help"
                            className="text-xs leading-5 text-muted-foreground"
                          >
                            Pilih kamar yang tercatat benar. Kamar saat ini tetap dapat
                            dipertahankan; hanya kamar yang sesuai gender penghuni ditampilkan.
                          </p>
                        </div>
                        <div
                          className="grid grid-cols-2 gap-3"
                          role="group"
                          aria-label="Kategori kamar"
                        >
                          {(
                            [
                              ["rukost", "Rumah Kost"],
                              ["apartkost", "Apart Kost"],
                            ] as const
                          ).map(([category, label]) => (
                            <Button
                              key={category}
                              type="button"
                              variant={roomCategory === category ? "default" : "outline"}
                              className="min-h-11"
                              aria-pressed={roomCategory === category}
                              disabled={locked || !baseline.policies.roomCorrection.allowed}
                              onClick={() => {
                                setRoomCategory(category);
                                setRoomFilter("all");
                              }}
                            >
                              {label}
                            </Button>
                          ))}
                        </div>
                        <div
                          className="flex flex-wrap gap-2"
                          role="group"
                          aria-label="Status pilihan kamar"
                        >
                          {(
                            [
                              ["all", "Semua"],
                              ["available", "Tersedia"],
                              ["inspection_required", "Perlu pemeriksaan"],
                              ["maintenance", "Dalam perawatan"],
                            ] as const
                          ).map(([filter, label]) => (
                            <Button
                              key={filter}
                              type="button"
                              size="sm"
                              variant={roomFilter === filter ? "default" : "outline"}
                              aria-pressed={roomFilter === filter}
                              disabled={locked || !baseline.policies.roomCorrection.allowed}
                              onClick={() => setRoomFilter(filter)}
                            >
                              {label}
                            </Button>
                          ))}
                        </div>
                        <div className="max-h-[32rem] overflow-y-auto overscroll-contain pr-1">
                          <div className="grid gap-3 md:grid-cols-2">
                            <button
                              type="button"
                              className={cn(
                                "min-h-32 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                draft.roomId === baseline.room.id
                                  ? "border-primary bg-primary/10"
                                  : "border-border bg-card hover:border-primary/50 hover:bg-muted/40",
                              )}
                              aria-pressed={draft.roomId === baseline.room.id}
                              disabled={locked || !baseline.policies.roomCorrection.allowed}
                              onClick={() => selectCorrectionRoom(null)}
                            >
                              <span className="flex items-start justify-between gap-3">
                                <span className="font-semibold">{baseline.room.number}</span>
                                <StatusBadge label="Kamar saat ini" tone="info" />
                              </span>
                              <span className="mt-2 block text-sm text-muted-foreground">
                                {baseline.room.managerRoomLabel ?? "Kamar yang sedang tercatat"}
                              </span>
                              <span className="mt-1 block text-sm text-muted-foreground">
                                No. Kavling: {baseline.room.plotNumber || "-"}
                              </span>
                              <span className="mt-3 block text-sm font-medium text-primary">
                                Pertahankan kamar ini
                              </span>
                            </button>
                            {visibleCandidates.map((room) => {
                              const status = correctionRoomListStatus(room);
                              const selectable = status === "available";
                              const selected = draft.roomId === room.id;
                              return (
                                <button
                                  key={room.id}
                                  type="button"
                                  className={cn(
                                    "min-h-32 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                    selected
                                      ? "border-primary bg-primary/10"
                                      : selectable
                                        ? "border-border bg-card hover:border-primary/50 hover:bg-muted/40"
                                        : "cursor-not-allowed border-border bg-muted/35 text-muted-foreground",
                                  )}
                                  aria-pressed={selected}
                                  disabled={
                                    locked ||
                                    !baseline.policies.roomCorrection.allowed ||
                                    !selectable
                                  }
                                  onClick={() => selectCorrectionRoom(room)}
                                >
                                  <span className="flex items-start justify-between gap-3">
                                    <span className="font-semibold">{room.number}</span>
                                    {status ? (
                                      <StatusBadge
                                        label={CORRECTION_ROOM_STATUS_LABELS[status]}
                                        tone={selectable ? "success" : "warning"}
                                      />
                                    ) : null}
                                  </span>
                                  <span className="mt-2 block text-sm text-muted-foreground">
                                    {room.kostType.name}
                                    {room.buildingName ? ` - ${room.buildingName}` : ""}
                                  </span>
                                  <span className="mt-1 block text-sm text-muted-foreground">
                                    No. Kavling: {room.plotNumber || "-"}
                                  </span>
                                  <span
                                    className={cn(
                                      "mt-3 block text-sm font-medium",
                                      selectable ? "text-primary" : "text-muted-foreground",
                                    )}
                                  >
                                    {selectable
                                      ? "Pilih sebagai kamar yang benar"
                                      : "Kamar ini belum dapat dipilih"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        {error("roomId")}
                        <p className="text-xs leading-5 text-muted-foreground">
                          Kamar tersedia dapat dipilih. Kamar yang perlu pemeriksaan atau dalam
                          perawatan hanya ditampilkan sebagai informasi. Ketersediaan dan
                          kepemilikan akan diverifikasi kembali saat tinjauan dan penyimpanan.
                        </p>
                      </div>
                      {rooms.isFetching ? (
                        <p className="text-sm text-muted-foreground" role="status">
                          Memuat pilihan kamar…
                        </p>
                      ) : rooms.isError ? (
                        <NoticeAlert
                          density="compact"
                          tone="warning"
                          title="Pilihan kamar belum dapat dimuat"
                          description="Kamar semula tetap dipertahankan. Muat ulang pilihan jika Anda perlu mengoreksi kamar."
                          action={
                            <Button
                              type="button"
                              variant="info"
                              onClick={() => void rooms.refetch()}
                            >
                              Muat pilihan
                            </Button>
                          }
                        />
                      ) : filteredCandidates.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Tidak ada kamar lain yang cocok dengan pencarian dan filter saat ini.
                        </p>
                      ) : null}
                      {!baseline.policies.roomCorrection.allowed ? (
                        <NoticeAlert
                          density="compact"
                          tone="warning"
                          title="Kamar belum dapat diubah"
                          description={baseline.policies.roomCorrection.message}
                        />
                      ) : null}
                      {changed.room ? (
                        <>
                          <label
                            className="flex min-h-11 items-start gap-3 rounded-lg border border-warning/35 bg-warning/5 p-4 text-sm"
                            htmlFor="revision-roomRecordingErrorConfirmed"
                          >
                            <Checkbox
                              id="revision-roomRecordingErrorConfirmed"
                              className="mt-1"
                              checked={draft.roomRecordingErrorConfirmed}
                              disabled={locked}
                              onCheckedChange={(value) =>
                                update({ roomRecordingErrorConfirmed: value === true })
                              }
                              {...invalid("roomRecordingErrorConfirmed")}
                            />
                            <span>
                              Saya memastikan kamar semula salah dicatat, bukan penghuni yang
                              berpindah secara fisik.
                            </span>
                          </label>
                          {error("roomRecordingErrorConfirmed")}
                          <EvidenceFileUploadField
                            propertyId={baseline.lease.propertyId}
                            filePurpose="lease_revision_evidence"
                            label="Bukti koreksi pencatatan kamar"
                            description="Maksimal 5 berkas, masing-masing 5 MB. Foto dikompresi otomatis. Bukti ini hanya dapat diakses Admin yang berwenang."
                            values={evidence}
                            required={baseline.policies.roomCorrection.requiresEvidence}
                            invalid={Boolean(errors.evidenceFileIds)}
                            errorId="revision-evidenceFileIds-error"
                            maxFiles={5}
                            disabled={locked}
                            onBusyChange={setUploadBusy}
                            onChange={(files) => {
                              setEvidence(files);
                              update({ evidenceFileIds: files.map((file) => file.id) });
                            }}
                          />
                          {error("evidenceFileIds")}
                        </>
                      ) : null}
                    </>
                  ) : null}
                  {stage === 1 ? (
                    <>
                      <NoticeAlert
                        density="compact"
                        title={
                          baseline.lease.physicalCheckInRecorded
                            ? "Periode mengikuti check-in aktual"
                            : "Periode sewa belum dimulai"
                        }
                        description={
                          baseline.lease.physicalCheckInRecorded
                            ? "Perbaiki tanggal check-in hanya jika pencatatan kejadian awal keliru. Perubahan tanggal check-in dan kamar perlu ditinjau terpisah."
                            : "Pembayaran atau aktivasi administrasi tidak memulai masa sewa. Tanggal berikut adalah rencana; check-in baru tetap dilakukan melalui Aktifkan kamar & check-in."
                        }
                      />
                      <div className="grid items-start gap-5 sm:grid-cols-2">
                        <HeroUiDatePicker
                          id="revision-startDate"
                          label={
                            baseline.lease.physicalCheckInRecorded
                              ? "Tanggal mulai mengikuti check-in"
                              : "Tanggal rencana mulai sewa"
                          }
                          value={draft.startDate}
                          disabled={locked || baseline.lease.physicalCheckInRecorded}
                          required
                          forceBottom
                          error={errors.startDate}
                          onChange={(value) => update({ startDate: value ?? "" })}
                        />
                        <div className="space-y-2">
                          <Label htmlFor="revision-termMonths">
                            Durasi sewa (bulan) <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            id="revision-termMonths"
                            value={draft.termMonths}
                            inputMode="numeric"
                            type="number"
                            min={1}
                            max={120}
                            step={1}
                            {...invalid("termMonths")}
                            onChange={(event) => update({ termMonths: event.target.value })}
                          />
                          {error("termMonths")}
                          <p className="text-xs leading-5 text-muted-foreground">
                            Tanggal akhir dan nilai kontrak dihitung otomatis pada tahap tinjauan.
                          </p>
                        </div>
                        {baseline.lease.physicalCheckInRecorded ? (
                          <HeroUiDatePicker
                            id="revision-checkedInDate"
                            label="Tanggal check-in aktual"
                            required
                            value={draft.checkedInDate}
                            disabled={locked}
                            error={errors.checkedInDate}
                            onChange={(value) =>
                              update({ checkedInDate: value ?? "", startDate: value ?? "" })
                            }
                          />
                        ) : null}
                      </div>
                    </>
                  ) : null}
                  {stage === 2 ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="revision-commercialMode">Jenis pengelolaan hunian</Label>
                        <Select
                          value={draft.commercialMode}
                          disabled={locked || !baseline.policies.commercialModeChange.allowed}
                          onValueChange={(value: LeaseRevisionDraft["commercialMode"]) =>
                            update({ commercialMode: value })
                          }
                        >
                          <SelectTrigger
                            id="revision-commercialMode"
                            {...invalid("commercialMode")}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="rent">Penyewaan berbayar</SelectItem>
                            <SelectItem value="owner_sponsored">Hunian Tanggungan Owner</SelectItem>
                          </SelectContent>
                        </Select>
                        {error("commercialMode")}
                      </div>
                      {!baseline.policies.commercialModeChange.allowed ? (
                        <NoticeAlert
                          density="compact"
                          tone="warning"
                          title="Jenis hunian dipertahankan"
                          description={baseline.policies.commercialModeChange.message}
                        />
                      ) : null}
                      {draft.commercialMode === "rent" ? (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="revision-pricingSource">Ketentuan tarif</Label>
                            <Select
                              value={draft.pricingSource}
                              disabled={locked}
                              onValueChange={(value: LeaseRevisionDraft["pricingSource"]) =>
                                update({ pricingSource: value, pricingVarianceAcknowledged: false })
                              }
                            >
                              <SelectTrigger id="revision-pricingSource">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="standard">
                                  Tarif standar kamar dan durasi
                                </SelectItem>
                                <SelectItem value="negotiated">Tarif kesepakatan khusus</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs leading-5 text-muted-foreground">
                              Tarif standar mengikuti referensi kamar pada periode hasil koreksi,
                              bukan perkiraan Admin.
                            </p>
                          </div>
                          {draft.pricingSource === "negotiated" ? (
                            <>
                              <div className="grid items-start gap-5 sm:grid-cols-2">
                                <div className="space-y-2">
                                  <Label htmlFor="revision-agreedMonthlyPrice">
                                    Tarif kesepakatan per bulan{" "}
                                    <span className="text-destructive">*</span>
                                  </Label>
                                  <CurrencyInput
                                    id="revision-agreedMonthlyPrice"
                                    value={draft.agreedMonthlyPrice}
                                    onValueChange={(value) =>
                                      update({
                                        agreedMonthlyPrice: value,
                                        pricingVarianceAcknowledged: false,
                                      })
                                    }
                                    formatOnChange
                                    error={Boolean(errors.agreedMonthlyPrice)}
                                    {...invalid("agreedMonthlyPrice")}
                                  />
                                  {error("agreedMonthlyPrice")}
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="revision-pricingAgreementReason">
                                    Catatan kesepakatan <span className="text-destructive">*</span>
                                  </Label>
                                  <Textarea
                                    id="revision-pricingAgreementReason"
                                    value={draft.pricingAgreementReason}
                                    maxLength={500}
                                    rows={3}
                                    {...invalid("pricingAgreementReason")}
                                    onChange={(event) =>
                                      update({ pricingAgreementReason: event.target.value })
                                    }
                                  />
                                  {error("pricingAgreementReason")}
                                </div>
                              </div>
                              <label
                                className="flex min-h-11 items-start gap-3 text-sm"
                                htmlFor="revision-pricingVarianceAcknowledged"
                              >
                                <Checkbox
                                  id="revision-pricingVarianceAcknowledged"
                                  className="mt-1"
                                  checked={draft.pricingVarianceAcknowledged}
                                  disabled={locked}
                                  {...invalid("pricingVarianceAcknowledged")}
                                  onCheckedChange={(value) =>
                                    update({ pricingVarianceAcknowledged: value === true })
                                  }
                                />
                                <span>
                                  Saya telah memeriksa tarif kesepakatan dan memastikan nominalnya
                                  benar.
                                </span>
                              </label>
                              {error("pricingVarianceAcknowledged")}
                            </>
                          ) : null}
                          {changed.mode ? (
                            <div className="grid gap-5 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor="revision-paymentPlanType">
                                  Ketentuan pelunasan baru{" "}
                                  <span className="text-destructive">*</span>
                                </Label>
                                <Select
                                  value={draft.paymentPlanType}
                                  disabled={locked}
                                  onValueChange={(value: LeaseRevisionDraft["paymentPlanType"]) =>
                                    update({ paymentPlanType: value })
                                  }
                                >
                                  <SelectTrigger
                                    id="revision-paymentPlanType"
                                    {...invalid("paymentPlanType")}
                                  >
                                    <SelectValue placeholder="Pilih ketentuan pelunasan" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="annual_full">Pelunasan penuh</SelectItem>
                                    <SelectItem value="two_month_installments">
                                      Pelunasan dua tahap
                                    </SelectItem>
                                    <SelectItem value="monthly_installments">
                                      Pembayaran bertahap
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                {error("paymentPlanType")}
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="revision-billingCycle">
                                  Siklus tagihan baru <span className="text-destructive">*</span>
                                </Label>
                                <Select
                                  value={draft.billingCycle}
                                  disabled={locked}
                                  onValueChange={(value: LeaseRevisionDraft["billingCycle"]) =>
                                    update({ billingCycle: value })
                                  }
                                >
                                  <SelectTrigger
                                    id="revision-billingCycle"
                                    {...invalid("billingCycle")}
                                  >
                                    <SelectValue placeholder="Pilih siklus tagihan" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="monthly">Bulanan</SelectItem>
                                    <SelectItem value="yearly">Tahunan</SelectItem>
                                  </SelectContent>
                                </Select>
                                {error("billingCycle")}
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <NoticeAlert
                            density="compact"
                            title="Sewa dan hak sewa Owner tetap Rp 0"
                            description="Biaya pengelolaan memiliki ketentuan tersendiri. Pembebasan biaya bukan pengembalian transaksi lama."
                          />
                          {ownerAssets.isError ? (
                            <NoticeAlert
                              density="compact"
                              tone="warning"
                              title="Kepemilikan kamar belum dapat dimuat"
                              description="Ketentuan lama tetap tersimpan. Muat ulang kepemilikan sebelum memilih atau mengganti Owner penanggung."
                              action={
                                <Button
                                  type="button"
                                  variant="info"
                                  onClick={() => void ownerAssets.refetch()}
                                >
                                  Muat kepemilikan
                                </Button>
                              }
                            />
                          ) : null}
                          <div className="grid items-start gap-5 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="revision-sponsoringOwnerProfileId">
                                Owner penanggung <span className="text-destructive">*</span>
                              </Label>
                              <Select
                                value={draft.sponsoringOwnerProfileId}
                                disabled={locked || policyLocked || ownerAssets.isFetching}
                                onValueChange={(value) =>
                                  update({ sponsoringOwnerProfileId: value })
                                }
                              >
                                <SelectTrigger
                                  id="revision-sponsoringOwnerProfileId"
                                  {...invalid("sponsoringOwnerProfileId")}
                                >
                                  <SelectValue placeholder="Pilih Owner kamar ini" />
                                </SelectTrigger>
                                <SelectContent>
                                  {ownerOption ? (
                                    <SelectItem value={ownerOption.id}>
                                      {ownerOption.fullName}
                                    </SelectItem>
                                  ) : (
                                    <SelectItem value="unavailable" disabled>
                                      Belum ada Owner kamar yang tersedia
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                              {error("sponsoringOwnerProfileId")}
                              <p className="text-xs leading-5 text-muted-foreground">
                                Owner harus memiliki kamar yang dikoreksi. Perbarui kepemilikan aset
                                bila pilihan belum sesuai.
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="revision-managementFeeMode">Biaya pengelolaan</Label>
                              <Select
                                value={draft.managementFeeMode}
                                disabled={locked || policyLocked}
                                onValueChange={(value: LeaseRevisionDraft["managementFeeMode"]) =>
                                  update({ managementFeeMode: value })
                                }
                              >
                                <SelectTrigger
                                  id="revision-managementFeeMode"
                                  {...invalid("managementFeeMode")}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="charged">Dengan biaya pengelolaan</SelectItem>
                                  <SelectItem value="waived">Tanpa biaya pengelolaan</SelectItem>
                                </SelectContent>
                              </Select>
                              {error("managementFeeMode")}
                            </div>
                          </div>
                          {draft.managementFeeMode === "charged" ? (
                            <div className="grid items-start gap-5 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor="revision-managementFeePayer">
                                  Penanggung biaya pengelolaan
                                </Label>
                                <Select
                                  value={draft.managementFeePayer}
                                  disabled={locked || policyLocked}
                                  onValueChange={(
                                    value: LeaseRevisionDraft["managementFeePayer"],
                                  ) => update({ managementFeePayer: value })}
                                >
                                  <SelectTrigger id="revision-managementFeePayer">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="resident">Penghuni</SelectItem>
                                    <SelectItem value="owner">Owner</SelectItem>
                                    <SelectItem value="other">Pihak lain</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              {draft.managementFeePayer === "other" ? (
                                <div className="space-y-2">
                                  <Label htmlFor="revision-managementFeePayerName">
                                    Nama penanggung lain <span className="text-destructive">*</span>
                                  </Label>
                                  <Input
                                    id="revision-managementFeePayerName"
                                    disabled={locked || policyLocked}
                                    value={draft.managementFeePayerName}
                                    maxLength={160}
                                    {...invalid("managementFeePayerName")}
                                    onChange={(event) =>
                                      update({ managementFeePayerName: event.target.value })
                                    }
                                  />
                                  {error("managementFeePayerName")}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          <div className="space-y-2">
                            <Label htmlFor="revision-ownerSponsorshipReason">
                              Alasan tanggungan Owner <span className="text-destructive">*</span>
                            </Label>
                            <Textarea
                              id="revision-ownerSponsorshipReason"
                              disabled={locked || policyLocked}
                              value={draft.ownerSponsorshipReason}
                              maxLength={500}
                              rows={3}
                              {...invalid("ownerSponsorshipReason")}
                              onChange={(event) =>
                                update({ ownerSponsorshipReason: event.target.value })
                              }
                            />
                            {error("ownerSponsorshipReason")}
                          </div>
                          {policyLocked ? (
                            <NoticeAlert
                              density="compact"
                              tone="warning"
                              title="Ketentuan penanggung dipertahankan"
                              description={baseline.policies.sponsorshipPolicyChange.message}
                            />
                          ) : null}
                        </>
                      )}
                    </>
                  ) : null}
                  {stage === 3 ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="revision-reason">
                          Alasan koreksi <span className="text-destructive">*</span>
                        </Label>
                        <Textarea
                          id="revision-reason"
                          value={draft.reason}
                          rows={4}
                          maxLength={2000}
                          placeholder="Jelaskan pencatatan awal yang keliru dan data yang benar."
                          {...invalid("reason")}
                          onChange={(event) => update({ reason: event.target.value })}
                        />
                        {error("reason")}
                      </div>
                      {errors.changes ? (
                        <NoticeAlert
                          tone="warning"
                          title="Perubahan perlu diperiksa"
                          description={errors.changes}
                        />
                      ) : null}
                      <p className="max-w-[72ch] text-sm leading-6 text-muted-foreground">
                        Pada tahap tinjauan, sistem memeriksa tanggal, kamar, kepemilikan, nominal,
                        dan riwayat keuangan. Data belum berubah sampai Anda mengonfirmasi
                        penyimpanan.
                      </p>
                      {!reviewed ? (
                        <Button
                          type="button"
                          variant="info"
                          className="min-h-11"
                          disabled={busy}
                          onClick={() => void review()}
                        >
                          {pending ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          ) : null}
                          {pending ? "Meninjau…" : "Tinjau dampak koreksi"}
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </CardContent>
              </Card>
            </fieldset>
            {stage === 3 && reviewed ? (
              <section className="space-y-5" aria-labelledby="revision-review-title">
                <h2
                  id="revision-review-title"
                  tabIndex={-1}
                  className="text-lg font-semibold outline-none"
                >
                  Perbandingan sebelum dan sesudah
                </h2>
                <div className="grid min-w-0 gap-5 lg:grid-cols-2">
                  <RevisionSnapshot
                    title="Data sebelumnya"
                    snapshot={reviewed.value.previous}
                    pendingService={!baseline.lease.physicalCheckInRecorded}
                    ownerNames={ownerNames}
                  />
                  <RevisionSnapshot
                    title="Hasil koreksi"
                    snapshot={reviewed.value.corrected}
                    pendingService={!baseline.lease.physicalCheckInRecorded}
                    ownerNames={ownerNames}
                  />
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Ringkasan dampak keuangan</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        ["Selisih nilai kontrak", reviewed.value.impact.contractAmountDelta],
                        ["Tambahan kewajiban", reviewed.value.impact.additionalChargeAmount],
                        ["Kredit kontrak", reviewed.value.impact.contractCreditAmount],
                        [
                          "Pembayaran sewa terverifikasi",
                          reviewed.value.impact.verifiedRentPaymentAmount,
                        ],
                        [
                          "Sisa kewajiban setelah koreksi",
                          reviewed.value.impact.outstandingAmountAfter,
                        ],
                        [
                          "Kelebihan pembayaran setelah koreksi",
                          reviewed.value.impact.overpaymentAmountAfter,
                        ],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="min-w-0">
                          <dt className="text-xs leading-5 text-muted-foreground">{label}</dt>
                          <dd className="mt-1 break-words font-semibold tabular-nums">
                            {formatIDR(Number(value))}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Biaya pengelolaan dan estimasi hak Owner
                    </CardTitle>
                    <CardDescription>{reviewed.value.ownerImpact.notice}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid min-w-0 gap-5 sm:grid-cols-2">
                      {(["previous", "corrected"] as const).map((key) => {
                        const projection = reviewed.value.ownerImpact[key];
                        return (
                          <div key={key} className="min-w-0 space-y-2">
                            <dt className="font-semibold">
                              {key === "previous" ? "Sebelum koreksi" : "Setelah koreksi"}
                            </dt>
                            <dd className="break-words">
                              {projection.ownerName || "Owner belum ditentukan"}
                            </dd>
                            <dd>
                              Biaya pengelolaan seluruh durasi:{" "}
                              <span className="font-semibold tabular-nums">
                                {formatIDR(projection.managementFeeAmount)}
                              </span>
                            </dd>
                            <dd>
                              Estimasi hak sewa Owner:{" "}
                              <span className="font-semibold tabular-nums">
                                {formatIDR(projection.projectedOwnerEntitlement)}
                              </span>
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Dampak pada dokumen terkait</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {reviewed.value.documentImpact.length === 0 ? (
                      <p>Belum ada tagihan atau dokumen yang diterbitkan pada penyewaan ini.</p>
                    ) : (
                      <details>
                        <summary className="cursor-pointer rounded-md py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                          Tinjau {reviewed.value.documentImpact.length} dokumen terkait
                        </summary>
                        <ul className="mt-3 divide-y divide-border">
                          {reviewed.value.documentImpact.map((document) => (
                            <li
                              key={`${document.documentType}:${document.documentCode}`}
                              className="min-w-0 space-y-1 py-3"
                            >
                              <p className="break-words font-semibold">
                                {document.documentCode} ·{" "}
                                {
                                  {
                                    retained: "Tetap tersimpan",
                                    voided: "Tagihan dibatalkan",
                                    invalidated: "Tidak berlaku setelah koreksi",
                                    already_invalidated: "Sudah tidak berlaku",
                                  }[document.effect]
                                }
                              </p>
                              <p className="break-words leading-relaxed">{document.notice}</p>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </CardContent>
                </Card>
                {reviewed.value.roomChange ? (
                  <NoticeAlert
                    tone="warning"
                    title={`Koreksi kamar ${reviewed.value.roomChange.previousRoomNumber} → ${reviewed.value.roomChange.correctedRoomNumber}`}
                    description={reviewed.value.roomChange.notice}
                  />
                ) : null}
                {reviewed.value.sponsorshipChange ? (
                  <NoticeAlert
                    title="Ketentuan penanggung dicatat sebagai versi baru"
                    description={reviewed.value.sponsorshipChange.notice}
                  />
                ) : null}
                {reviewed.value.corrected.commercialChange ? (
                  <NoticeAlert
                    tone="warning"
                    title="Tagihan lama dibatalkan, bukan dihapus"
                    description={
                      <>
                        <p>{reviewed.value.corrected.commercialChange.notice}</p>
                        <p className="mt-2">
                          Tagihan terkait:{" "}
                          {reviewed.value.corrected.commercialChange.invoicesToVoid
                            .map((invoice) => invoice.invoiceCode)
                            .join(", ") || "Tidak ada tagihan lama"}
                          .
                        </p>
                      </>
                    }
                  />
                ) : null}
                <NoticeAlert
                  density="compact"
                  title="Dokumen dan transaksi lama tetap tersimpan"
                  description="Koreksi tidak mengembalikan uang secara otomatis. Dokumen baru mengikuti pencatatan hasil koreksi; pembayaran dan dokumen sebelumnya tetap dapat ditinjau sesuai riwayatnya."
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="success"
                    className="min-h-11 border-success bg-success text-success-foreground shadow-sm hover:bg-success/90"
                    disabled={pending || uploadBusy}
                    onClick={() => setConfirmationOpen(true)}
                  >
                    <Save className="size-4" aria-hidden="true" />
                    {uncertain ? "Coba ulang penyimpanan" : "Simpan Koreksi"}
                  </Button>
                </div>
              </section>
            ) : null}
            {!uncertain ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                <Button
                  type="button"
                  variant="info"
                  className="min-h-11"
                  disabled={busy || stage === 0}
                  onClick={() => {
                    setErrors({});
                    setStage((current) => current - 1);
                  }}
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Kembali
                </Button>
                {stage < 3 ? (
                  <Button
                    type="submit"
                    variant="info"
                    className="min-h-11"
                    disabled={busy || !baseline.policies.correction.allowed}
                  >
                    Lanjutkan
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Button>
                ) : reviewed ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => {
                      setReviewed(null);
                      intentKey.current = null;
                    }}
                  >
                    <RotateCcw className="size-4" aria-hidden="true" />
                    Ubah tinjauan
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                Isian dikunci sementara hasil penyimpanan belum pasti. Periksa riwayat atau ulangi
                penyimpanan yang sama.
              </p>
            )}
          </form>
          <ConfirmDialog
            open={confirmationOpen}
            onOpenChange={setConfirmationOpen}
            title={uncertain ? "Coba ulang koreksi yang sama?" : "Simpan koreksi resmi?"}
            description={`Penyewaan ${baseline.lease.leaseCode} milik ${baseline.lease.residentName} akan mengikuti hasil tinjauan. Riwayat lama dan transaksi tetap dipertahankan.`}
            confirmLabel={uncertain ? "Coba ulang" : "Simpan koreksi"}
            pending={pending}
            confirmDisabled={!reviewed || uploadBusy || reviewed.version !== version.current}
            onConfirm={commit}
          />
        </>
      )}
    </div>
  );
}

function RevisionSnapshot({
  title,
  snapshot,
  pendingService,
  ownerNames,
}: {
  title: string;
  snapshot: LeaseDataCorrectionSnapshot;
  pendingService: boolean;
  ownerNames: Map<string, string>;
}) {
  const dateText = (value: string | null) =>
    value ? formatIndonesianDate(value) : "Belum check-in";
  const policy = snapshot.ownerSponsorship;
  const rows: [string, ReactNode][] = [
    ["Kamar", snapshot.roomNumber || "—"],
    ["Nomor Kamar by Pengelola", snapshot.managerRoomLabel || "—"],
    ["No. Kavling", snapshot.plotNumber || "—"],
    [
      "Jenis hunian",
      snapshot.commercialMode === "owner_sponsored"
        ? "Hunian Tanggungan Owner"
        : "Penyewaan berbayar",
    ],
    [pendingService ? "Rencana tanggal mulai" : "Tanggal mulai sewa", dateText(snapshot.startDate)],
    [pendingService ? "Rencana tanggal akhir" : "Tanggal akhir sewa", dateText(snapshot.endDate)],
    ["Durasi", `${snapshot.termMonths} bulan`],
    ["Check-in aktual", dateText(snapshot.checkedInDate)],
    [
      "Tarif",
      snapshot.pricingSource === "negotiated"
        ? "Kesepakatan khusus"
        : snapshot.pricingSource === "owner_sponsored"
          ? "Tanggungan Owner"
          : "Standar kamar dan durasi",
    ],
    ["Tarif bulanan", formatIDR(snapshot.agreedMonthlyPrice)],
    ["Nilai kontrak sewa", formatIDR(snapshot.contractRentAmount)],
  ];
  if (policy)
    rows.push(
      ["Owner penanggung", ownerNames.get(policy.ownerProfileId) || "Owner terkait kamar"],
      ["Biaya pengelolaan", policy.managementFeeMode === "waived" ? "Dibebaskan" : "Dikenakan"],
      [
        "Penanggung biaya",
        policy.managementFeeMode === "waived"
          ? "—"
          : policy.managementFeePayer === "owner"
            ? "Owner"
            : policy.managementFeePayer === "resident"
              ? "Penghuni"
              : policy.managementFeePayerName || "Pihak lain",
      ],
      ["Proyeksi biaya pengelolaan", formatIDR(policy.projectedManagementFeeAmount)],
      ["Alasan tanggungan", policy.sponsorshipReason],
    );
  return (
    <Card
      className={
        title === "Hasil koreksi" ? "border-success/40 bg-success/5" : "border-info/40 bg-info/5"
      }
    >
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y divide-border">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="grid min-w-0 gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] sm:gap-4"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
