import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Clock3, Loader2, LockKeyhole, RotateCcw, Unlock } from "lucide-react";
import type { FileResponse } from "@granada-kost/domain";
import { EvidenceFileUploadField } from "@/components/file/EvidenceFileUploadField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCreateBookingLeadHold,
  useReleaseBookingLeadHold,
} from "@/hooks/useBookingLeadHoldMutations";
import { useCancelBookingLeadPaymentCommitment } from "@/hooks/useBookingLeadCompletion";
import type { BookingLeadRecord } from "@/lib/admin-booking-lead";
import {
  canCreateBookingLeadHold,
  canReleaseBookingLeadHold,
  formatBookingHoldRemaining,
  type BookingLeadHoldCoverage,
  type BookingLeadHoldRecord,
} from "@/lib/admin-booking-lead-hold";
import { useAuth } from "@/lib/auth";
import { newIdempotencyKey } from "@/lib/idempotency";
import { useProperty } from "@/lib/property";
import { cn } from "@/lib/utils";
import { useM6LeaseAvailableRooms } from "@/hooks/useAdminUxLeases";

type HoldDialogProps = {
  open: boolean;
  mode: "create" | "release" | "cancel";
  lead: BookingLeadRecord | null;
  hold: BookingLeadHoldRecord | null;
  coverage: BookingLeadHoldCoverage | null;
  onOpenChange: (open: boolean) => void;
};

export function BookingLeadHoldStatus({
  hold,
  now,
  compact = false,
}: {
  hold: BookingLeadHoldRecord;
  now: number;
  compact?: boolean;
}) {
  if (hold.holdStatus === "committed") {
    return (
      <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-emerald-600/35 bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-950 shadow-sm dark:border-emerald-300/35 dark:bg-emerald-300/15 dark:text-emerald-100">
          <Check className="h-3.5 w-3.5" aria-hidden="true" /> Terkonfirmasi
        </span>
        <span className={cn("text-xs text-muted-foreground", compact && "text-[11px]")}>
          Pembayaran awal dicatat
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-amber-600/35 bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-950 shadow-sm dark:border-amber-300/35 dark:bg-amber-300/15 dark:text-amber-100">
        <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" /> Ditahan
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs text-muted-foreground",
          compact && "text-[11px]",
        )}
      >
        <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
        {formatBookingHoldRemaining(hold.expiresAt, now)}
      </span>
    </span>
  );
}

function safeErrorMessage(error: unknown): string | null {
  return error instanceof Error && error.message ? error.message : null;
}

function roomGenderLabel(genderPolicy: "male" | "female" | "mixed"): string {
  if (genderPolicy === "male") return "Putra";
  if (genderPolicy === "female") return "Putri";
  return "Campuran";
}

function roomCategoryLabel(category: "rukost" | "apartkost"): string {
  return category === "rukost" ? "Rumah Kost" : "Apart Kost";
}

export function BookingLeadHoldDialog({
  open,
  mode,
  lead,
  hold,
  coverage,
  onOpenChange,
}: HoldDialogProps) {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const create = useCreateBookingLeadHold();
  const release = useReleaseBookingLeadHold();
  const cancel = useCancelBookingLeadPaymentCommitment();
  const resetCreate = create.reset;
  const resetRelease = release.reset;
  const resetCancel = cancel.reset;
  const propertyAtOpen = useRef<string | null>(null);
  const leadAtOpen = useRef<string | null>(null);
  const submissionKey = useRef<string | null>(null);
  const submitting = useRef(false);
  const isPublicLead = lead?.source === "public_kamar";
  const [selectedRoomId, setSelectedRoomId] = useState(isPublicLead ? "" : (lead?.roomId ?? ""));
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const [refundMethod, setRefundMethod] = useState<"cash" | "bank_transfer">("cash");
  const [refundNote, setRefundNote] = useState("");
  const [refundEvidence, setRefundEvidence] = useState<FileResponse[]>([]);
  const [refundEvidenceBusy, setRefundEvidenceBusy] = useState(false);
  const availableRooms = useM6LeaseAvailableRooms();
  const compatibleRooms = useMemo(
    () =>
      (availableRooms.data?.items ?? [])
        .filter((room) => room.genderPolicy === "mixed" || room.genderPolicy === lead?.gender)
        .filter((room) => room.kostType.category === lead?.category),
    [availableRooms.data?.items, lead?.category, lead?.gender],
  );

  const access = {
    roles: user?.roles ?? [],
    permissions: user?.permissions ?? [],
    propertyId: currentPropertyId,
  };
  const accessAllowed = Boolean(
    lead &&
    (mode === "create"
      ? canCreateBookingLeadHold({
          ...access,
          propertyRollouts: user?.propertyRollouts,
          lead,
          coverage,
        })
      : mode === "release"
        ? canReleaseBookingLeadHold({ ...access, lead, hold })
        : Boolean(
            hold?.holdStatus === "committed" &&
            lead.status === "onboarding" &&
            access.permissions.includes("room.manage"),
          )),
  );
  const pending = create.isPending || release.isPending || cancel.isPending || submitting.current;

  useEffect(() => {
    if (!open) {
      propertyAtOpen.current = null;
      leadAtOpen.current = null;
      submissionKey.current = null;
      setSelectedRoomId(lead?.source === "public_kamar" ? "" : (lead?.roomId ?? ""));
      setRoomPickerOpen(false);
      resetCreate();
      resetRelease();
      resetCancel();
      setRefundMethod("cash");
      setRefundNote("");
      setRefundEvidence([]);
      setRefundEvidenceBusy(false);
      return;
    }
    if (propertyAtOpen.current === null && leadAtOpen.current === null) {
      propertyAtOpen.current = currentPropertyId;
      leadAtOpen.current = lead?.id ?? null;
      submissionKey.current = null;
      resetCreate();
      resetRelease();
      resetCancel();
      return;
    }
    if (currentPropertyId !== propertyAtOpen.current || lead?.id !== leadAtOpen.current) {
      submissionKey.current = null;
      resetCreate();
      resetRelease();
      onOpenChange(false);
    }
  }, [
    currentPropertyId,
    lead?.id,
    lead?.roomId,
    lead?.source,
    onOpenChange,
    open,
    resetCreate,
    resetRelease,
    resetCancel,
  ]);

  if (!lead) return null;

  const submit = async () => {
    const propertyId = propertyAtOpen.current;
    if (
      !accessAllowed ||
      !propertyId ||
      propertyId !== currentPropertyId ||
      lead.id !== leadAtOpen.current ||
      submitting.current ||
      create.isPending ||
      release.isPending ||
      cancel.isPending
    ) {
      return;
    }
    submitting.current = true;
    const idempotencyKey = submissionKey.current ?? newIdempotencyKey();
    submissionKey.current = idempotencyKey;
    try {
      if (mode === "cancel") {
        await cancel.mutateAsync({
          leadId: lead.id,
          idempotencyKey,
          input: {
            propertyId,
            refundMethod,
            refundNote,
            refundEvidenceFileIds:
              refundEvidence.length > 0 ? refundEvidence.map((file) => file.id) : undefined,
          },
        });
      } else if (mode === "create") {
        await create.mutateAsync({
          propertyId,
          leadId: lead.id,
          idempotencyKey,
          ...(lead.source === "public_kamar" ? { roomId: selectedRoomId } : {}),
        });
      } else {
        await release.mutateAsync({ propertyId, leadId: lead.id, idempotencyKey });
      }
      submissionKey.current = null;
      onOpenChange(false);
    } catch {
      // The exact backend error remains available on the mutation and in the safe toast.
    } finally {
      submitting.current = false;
    }
  };

  const createMode = mode === "create";
  const cancelMode = mode === "cancel";
  const errorMessage = safeErrorMessage(
    mode === "create" ? create.error : mode === "release" ? release.error : cancel.error,
  );
  return (
    <Dialog open={open && accessAllowed} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {createMode
              ? "Tahan kamar selama 24 jam"
              : cancelMode
                ? "Batalkan minat booking dan refund?"
                : "Lepaskan tahanan kamar?"}
          </DialogTitle>
          <DialogDescription className="break-words">
            {createMode
              ? "Tindakan ini menandai kamar sebagai Dipesan selama 24 jam. Tahanan tidak membuat penyewaan, penghuni, atau tagihan."
              : cancelMode
                ? "Pembayaran awal terverifikasi dan security deposit akan direfund sebagai satu catatan. Transfer yang masih menunggu konfirmasi dibatalkan tanpa mencatat refund dana. Pembatalan tidak tersedia setelah data menjadi penyewaan atau sewa aktif."
                : "Tahanan aktif akan dilepaskan dan kamar kembali Kosong bila tetap aman. Tindakan ini tidak membuat penyewaan, penghuni, atau tagihan."}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid min-w-0 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Calon penghuni</dt>
            <dd className="break-words font-medium">{lead.visitorName}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Kamar</dt>
            <dd className="break-words font-medium">
              {lead.source === "public_kamar"
                ? "Dipilih saat tahan kamar"
                : (lead.roomNumber ?? "Belum terhubung")}
            </dd>
          </div>
        </dl>

        {createMode && lead.source === "public_kamar" ? (
          <div className="grid gap-2 text-sm font-medium">
            <span>Pilih kamar kosong yang sesuai</span>
            <div className="min-w-0">
              <button
                type="button"
                role="combobox"
                aria-expanded={roomPickerOpen}
                aria-haspopup="listbox"
                aria-controls="booking-lead-room-options"
                disabled={pending || availableRooms.isPending}
                onClick={() => setRoomPickerOpen((isOpen) => !isOpen)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setRoomPickerOpen(false);
                }}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm font-normal transition-colors",
                  "hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  roomPickerOpen && "border-primary/70 ring-2 ring-primary/15",
                  (pending || availableRooms.isPending) && "cursor-not-allowed opacity-60",
                )}
              >
                <span className={selectedRoomId ? "text-foreground" : "text-muted-foreground"}>
                  {availableRooms.isPending
                    ? "Memuat kamar..."
                    : selectedRoomId
                      ? (() => {
                          const room = compatibleRooms.find((item) => item.id === selectedRoomId);
                          return room
                            ? `${room.number} - ${roomCategoryLabel(room.kostType.category)} - Gender: ${roomGenderLabel(room.genderPolicy)}`
                            : "Pilih kamar";
                        })()
                      : "Pilih kamar"}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    roomPickerOpen && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>

              {roomPickerOpen ? (
                <div
                  id="booking-lead-room-options"
                  role="listbox"
                  aria-label="Daftar kamar kosong"
                  className="mt-2 max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1.5 shadow-xl shadow-black/20"
                >
                  {compatibleRooms.length === 0 && !availableRooms.isPending ? (
                    <p className="px-3 py-4 text-center text-sm font-normal text-muted-foreground">
                      Belum ada kamar kosong yang sesuai.
                    </p>
                  ) : (
                    compatibleRooms.map((room) => {
                      const selected = room.id === selectedRoomId;
                      return (
                        <button
                          key={room.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => {
                            setSelectedRoomId(room.id);
                            setRoomPickerOpen(false);
                          }}
                          className={cn(
                            "flex min-h-14 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors",
                            "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                            selected && "bg-primary/10 text-primary",
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{room.number}</span>
                            <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                              {roomCategoryLabel(room.kostType.category)} - Gender:{" "}
                              {roomGenderLabel(room.genderPolicy)}
                            </span>
                          </span>
                          {selected ? (
                            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
            <span className="font-normal text-muted-foreground">
              Hanya kamar kosong kategori {roomCategoryLabel(lead.category)} untuk{" "}
              {lead.gender === "male" ? "Putra" : "Putri"} yang ditampilkan.
            </span>
          </div>
        ) : null}

        {cancelMode ? (
          <div className="grid gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <label className="grid gap-1.5 font-medium">
              Metode refund
              <select
                value={refundMethod}
                onChange={(event) =>
                  setRefundMethod(event.target.value as "cash" | "bank_transfer")
                }
                className="min-h-11 rounded-md border border-input bg-background px-3 font-normal"
                disabled={pending}
              >
                <option value="cash">Tunai</option>
                <option value="bank_transfer">Transfer Bank</option>
              </select>
            </label>
            <EvidenceFileUploadField
              propertyId={currentPropertyId ?? ""}
              label="Bukti refund"
              description={
                refundMethod === "bank_transfer"
                  ? "Wajib untuk refund Transfer Bank. Unggah JPG, PNG, WebP, atau PDF sebagai bukti pengembalian dana."
                  : "Opsional untuk refund Tunai. Unggah bukti jika tersedia."
              }
              values={refundEvidence}
              onChange={setRefundEvidence}
              onBusyChange={setRefundEvidenceBusy}
              required={refundMethod === "bank_transfer"}
              disabled={pending}
            />
            <label className="grid gap-1.5 font-medium">
              Catatan refund <span className="font-normal text-muted-foreground">(opsional)</span>
              <textarea
                value={refundNote}
                onChange={(event) => setRefundNote(event.target.value)}
                maxLength={500}
                className="min-h-20 rounded-md border border-input bg-background p-3 font-normal"
                placeholder="Contoh: calon penghuni membatalkan rencana masuk"
                disabled={pending}
              />
            </label>
          </div>
        ) : null}

        {errorMessage ? (
          <p role="alert" className="break-words text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Batal
          </Button>
          <Button
            variant={createMode ? "default" : "destructive"}
            onClick={() => void submit()}
            disabled={
              !accessAllowed ||
              pending ||
              refundEvidenceBusy ||
              (cancelMode && refundMethod === "bank_transfer" && refundEvidence.length === 0) ||
              (createMode && lead.source === "public_kamar" && !selectedRoomId)
            }
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : createMode ? (
              <LockKeyhole className="mr-2 h-4 w-4" aria-hidden="true" />
            ) : cancelMode ? (
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            ) : (
              <Unlock className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {createMode ? "Tahan Kamar" : cancelMode ? "Batalkan dan Refund" : "Lepaskan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
