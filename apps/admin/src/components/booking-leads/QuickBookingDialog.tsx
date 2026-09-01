import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UniversityCombobox } from "@/components/forms/UniversityCombobox";
import { useCreateAdminBookingLead } from "@/hooks/useBookingLeadMutations";
import {
  canCreateAdminBookingLead,
  initialQuickBookingDraft,
  validateQuickBookingDraft,
  type BookingLeadGender,
  type QuickBookingDraft,
} from "@/lib/admin-booking-lead";
import { KOST_TYPE_LABEL } from "@/lib/admin-ux-master-helpers";
import type { RoomInventory } from "@/lib/admin-ux-master-api";
import { useAuth } from "@/lib/auth";
import { newIdempotencyKey } from "@/lib/idempotency";
import { useProperty } from "@/lib/property";
import { revealFirstValidationError } from "@/lib/validation-focus";

type Props = {
  room: RoomInventory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const GENDER_LABEL = { male: "Putra", female: "Putri", mixed: "Campur" } as const;

function roomLabel(room: RoomInventory): string {
  return room.roomCode?.trim() || room.number;
}

export function QuickBookingDialog({ room, open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const createLead = useCreateAdminBookingLead();
  const resetCreateLead = createLead.reset;
  const propertyAtOpen = useRef<string | null>(null);
  const roomAtOpen = useRef<string | null>(null);
  const submissionKey = useRef<string | null>(null);
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<QuickBookingDraft>(() =>
    initialQuickBookingDraft(room?.genderPolicy),
  );
  const [errors, setErrors] = useState<Partial<Record<keyof QuickBookingDraft, string>>>({});

  useEffect(() => {
    if (!open) {
      propertyAtOpen.current = null;
      roomAtOpen.current = null;
      submissionKey.current = null;
      resetCreateLead();
      return;
    }
    if (propertyAtOpen.current === null && roomAtOpen.current === null) {
      propertyAtOpen.current = currentPropertyId;
      roomAtOpen.current = room?.id ?? null;
      submissionKey.current = null;
      setDraft(initialQuickBookingDraft(room?.genderPolicy));
      setErrors({});
      resetCreateLead();
      return;
    }
    if (currentPropertyId !== propertyAtOpen.current || room?.id !== roomAtOpen.current) {
      submissionKey.current = null;
      setDraft(initialQuickBookingDraft(room?.genderPolicy));
      setErrors({});
      resetCreateLead();
      onOpenChange(false);
    }
  }, [currentPropertyId, onOpenChange, open, resetCreateLead, room?.genderPolicy, room?.id]);

  useEffect(() => {
    if (open && Object.keys(errors).length > 0) {
      revealFirstValidationError(formRef.current);
    }
  }, [errors, open]);

  if (!room) return null;

  const genderPolicy = room.genderPolicy ?? "mixed";
  const hasAccess = canCreateAdminBookingLead({
    roles: user?.roles ?? [],
    permissions: user?.permissions ?? [],
    propertyId: currentPropertyId,
    room,
  });
  const pending = createLead.isPending || submitting.current;

  const update = <K extends keyof QuickBookingDraft>(key: K, value: QuickBookingDraft[K]) => {
    submissionKey.current = null;
    if (createLead.error) resetCreateLead();
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || createLead.isPending) return;
    const nextErrors = validateQuickBookingDraft(draft, genderPolicy);
    const propertyId = propertyAtOpen.current;
    if (!hasAccess || !propertyId || currentPropertyId !== propertyId) {
      setErrors({ visitorName: "Akses atau property aktif telah berubah. Tutup dan coba lagi." });
      return;
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    submitting.current = true;
    const idempotencyKey = submissionKey.current ?? newIdempotencyKey();
    submissionKey.current = idempotencyKey;
    try {
      await createLead.mutateAsync({
        propertyId,
        roomId: room.id,
        genderPolicy,
        draft,
        idempotencyKey,
      });
      submissionKey.current = null;
      onOpenChange(false);
      await navigate({ to: "/booking-leads" });
    } catch {
      // The mutation boundary emits a safe, normalized error toast.
    } finally {
      submitting.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Catat minat booking · Kamar {roomLabel(room)}</DialogTitle>
          <DialogDescription>
            Minat booking belum mereservasi kamar; status kamar tetap Kosong sampai proses reservasi
            atau penyewaan dikonfirmasi.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Kamar</dt>
            <dd className="font-medium">{roomLabel(room)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Bangunan</dt>
            <dd className="font-medium">
              {room.buildingName || room.buildingCode || "Belum bernama"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Kategori</dt>
            <dd className="font-medium">{KOST_TYPE_LABEL[room.kostType.category]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Kebijakan gender</dt>
            <dd className="font-medium">{GENDER_LABEL[genderPolicy]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-medium text-success">Kosong</dd>
          </div>
        </dl>

        <form ref={formRef} className="space-y-4" onSubmit={submit} noValidate>
          <Field
            id="quick-booking-name"
            label="Nama calon penghuni"
            error={errors.visitorName}
            required
          >
            <Input
              id="quick-booking-name"
              value={draft.visitorName}
              maxLength={120}
              disabled={pending}
              aria-invalid={Boolean(errors.visitorName)}
              aria-describedby={errors.visitorName ? "quick-booking-name-error" : undefined}
              onChange={(event) => update("visitorName", event.target.value)}
              autoFocus
            />
          </Field>
          <Field id="quick-booking-gender" label="Jenis kelamin" error={errors.gender} required>
            <Select
              value={draft.gender || undefined}
              disabled={pending || genderPolicy !== "mixed"}
              onValueChange={(value) => update("gender", value as BookingLeadGender)}
            >
              <SelectTrigger
                id="quick-booking-gender"
                aria-invalid={Boolean(errors.gender)}
                aria-describedby={errors.gender ? "quick-booking-gender-error" : undefined}
              >
                <SelectValue placeholder="Pilih jenis kelamin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Putra</SelectItem>
                <SelectItem value="female">Putri</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="quick-booking-address" label="Alamat" error={errors.visitorAddress} required>
            <Textarea
              id="quick-booking-address"
              value={draft.visitorAddress}
              maxLength={500}
              disabled={pending}
              aria-invalid={Boolean(errors.visitorAddress)}
              aria-describedby={errors.visitorAddress ? "quick-booking-address-error" : undefined}
              onChange={(event) => update("visitorAddress", event.target.value)}
            />
          </Field>
          <Field id="quick-booking-university" label="Universitas" error={errors.visitorUniversity}>
            <UniversityCombobox
              id="quick-booking-university"
              value={draft.visitorUniversity}
              propertyId={currentPropertyId}
              disabled={pending}
              aria-invalid={Boolean(errors.visitorUniversity)}
              aria-describedby={
                errors.visitorUniversity ? "quick-booking-university-error" : undefined
              }
              onChange={(value) => update("visitorUniversity", value)}
            />
          </Field>
          <Field
            id="quick-booking-phone"
            label="Nomor WhatsApp"
            error={errors.visitorPhone}
            required
          >
            <Input
              id="quick-booking-phone"
              value={draft.visitorPhone}
              maxLength={32}
              inputMode="tel"
              disabled={pending}
              aria-invalid={Boolean(errors.visitorPhone)}
              aria-describedby={errors.visitorPhone ? "quick-booking-phone-error" : undefined}
              onChange={(event) => update("visitorPhone", event.target.value)}
              placeholder="Contoh: +62 812-3456-7890"
            />
          </Field>

          {createLead.error ? (
            <p role="alert" className="text-sm text-destructive">
              Minat booking belum dapat disimpan. Periksa data lalu coba lagi.
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={pending || !hasAccess}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Simpan minat booking
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
