// Form drawer for create/edit kamar. Phase 1B: converted from small Dialog
// popup to wide Sheet drawer per owner requirement. Uses react-hook-form + zod.
// Submits through useCreateRoom / useUpdateRoom. Backend remains final
// authority; 422 details are mapped into inline errors per ADR-FE-008.

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  BedDouble,
  DollarSign,
  Loader2,
  Settings2,
  Tags,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@granada-kost/api-client";
import type { RoomRecord } from "@/hooks/useRooms";
import {
  useCreateRoom,
  useUpdateRoom,
  type CreateRoomInput,
} from "@/hooks/useRoomMutations";
import { useRoomTypes } from "@/hooks/useRoomTypes";
import { useRoomFacilities } from "@/hooks/useRoomFacilities";

/* ─── Schema ─── */

const Schema = z.object({
  number: z.string().trim().min(1, "Nomor kamar wajib diisi"),
  unitCode: z.string().trim().optional().or(z.literal("")),
  floor: z.string().trim().optional().or(z.literal("")),
  sizeLabel: z.string().trim().optional().or(z.literal("")),
  genderPolicy: z.enum(["male", "female", "mixed"]),
  monthlyPrice: z.coerce.number().int().min(0, "Harga tidak boleh negatif"),
  depositAmount: z.coerce.number().int().min(0, "Deposit tidak boleh negatif"),
  roomTypeId: z.string().optional().or(z.literal("")),
  facilityIds: z.array(z.string()).optional(),
});

type FormValues = z.infer<typeof Schema>;

/* ─── Props ─── */

export type RoomFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits an existing room. Otherwise it creates. */
  initial?: RoomRecord | null;
  /** List of unique unit/building codes from loaded rooms (for Unit dropdown). */
  buildingOptions?: string[];
};

/* ─── Defaults ─── */

function toDefaults(initial?: RoomRecord | null): FormValues {
  return {
    number: initial?.number ?? "",
    unitCode: initial?.unitCode ?? "",
    floor: initial?.floor ?? "",
    sizeLabel: initial?.sizeLabel ?? "",
    genderPolicy: (initial?.genderPolicy ?? "male") as FormValues["genderPolicy"],
    monthlyPrice: initial?.monthlyPrice ?? 0,
    depositAmount: initial?.depositAmount ?? 0,
    roomTypeId: initial?.roomTypeId ?? "",
    facilityIds: initial?.facilities?.map((f) => f.id) ?? [],
  };
}

/* ─── Server Error Mapping ─── */

function applyServerErrors(
  setError: ReturnType<typeof useForm<FormValues>>["setError"],
  err: unknown,
): boolean {
  if (!ApiError.isApiError(err) || err.status !== 422) return false;
  const details = err.details as Record<string, unknown> | undefined;
  if (!details || typeof details !== "object") return false;
  let handled = false;
  const fieldMap: Record<string, keyof FormValues> = {
    number: "number",
    unit_code: "unitCode",
    floor: "floor",
    size_label: "sizeLabel",
    gender_policy: "genderPolicy",
    monthly_price: "monthlyPrice",
    deposit_amount: "depositAmount",
    room_type_id: "roomTypeId",
    facility_ids: "facilityIds",
  };
  for (const [key, message] of Object.entries(details)) {
    const target = fieldMap[key];
    if (target) {
      setError(target, { type: "server", message: String(message) });
      handled = true;
    }
  }
  return handled;
}

/* ─── Floor Options ─── */

const FLOOR_OPTIONS = [
  { value: "B", label: "Lantai 1 / Bawah" },
  { value: "A", label: "Lantai 2 / Atas" },
] as const;

/* ─── Main Component ─── */

export function RoomFormDialog({
  open,
  onOpenChange,
  initial,
  buildingOptions = [],
}: RoomFormDialogProps) {
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const pending = create.isPending || update.isPending;

  // Load room types and facilities for dropdowns
  const { data: roomTypes } = useRoomTypes();
  const { data: facilities } = useRoomFacilities();

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: toDefaults(initial),
  });

  // Reset whenever the drawer re-opens or switches between create/edit.
  useEffect(() => {
    if (open) form.reset(toDefaults(initial));
  }, [open, initial, form]);

  // Determine if Campur option should be shown
  const showCampur = initial?.genderPolicy === "mixed";

  const onSubmit = form.handleSubmit(async (values) => {
    const payload: CreateRoomInput = {
      number: values.number,
      unitCode: values.unitCode || null,
      floor: values.floor || null,
      sizeLabel: values.sizeLabel || null,
      genderPolicy: values.genderPolicy,
      monthlyPrice: values.monthlyPrice,
      depositAmount: values.depositAmount,
      roomTypeId: values.roomTypeId || null,
      facilityIds:
        values.facilityIds && values.facilityIds.length > 0
          ? values.facilityIds
          : undefined,
    };
    try {
      if (initial) {
        await update.mutateAsync({ roomId: initial.id, input: payload });
      } else {
        await create.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch (err) {
      // Already toasted by the hook; map 422 to inline errors when possible.
      applyServerErrors(form.setError, err);
    }
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!pending) onOpenChange(nextOpen);
  };

  // Facility toggle helper
  const currentFacilityIds = form.watch("facilityIds") ?? [];
  const toggleFacility = (facilityId: string) => {
    const current = form.getValues("facilityIds") ?? [];
    if (current.includes(facilityId)) {
      form.setValue(
        "facilityIds",
        current.filter((id) => id !== facilityId),
      );
    } else {
      form.setValue("facilityIds", [...current, facilityId]);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BedDouble className="h-5 w-5 text-primary" />
            {initial ? "Edit Kamar" : "Tambah Kamar"}
          </SheetTitle>
          <SheetDescription>
            {initial
              ? `Ubah data kamar ${initial.roomCode ?? initial.number}`
              : "Isi data kamar baru untuk ditambahkan ke inventori."}
          </SheetDescription>
        </SheetHeader>

        <form
          className="flex flex-1 flex-col gap-5 py-4"
          onSubmit={onSubmit}
          noValidate
        >
          {/* ─── Section: Identitas Kamar ─── */}
          <section className="space-y-3">
            <SectionHeader icon={BedDouble} title="Identitas Kamar" />
            <Field
              label="Nomor Kamar"
              error={form.formState.errors.number?.message}
              hint="Nomor unik kamar di dalam unit, misal: 101, 1B, 5A"
            >
              <Input
                {...form.register("number")}
                placeholder="Mis. 101"
                disabled={pending}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Unit/Gedung"
                error={form.formState.errors.unitCode?.message}
                hint="Pilih unit/gedung tempat kamar ini berada"
              >
                {buildingOptions.length > 0 ? (
                  <Select
                    value={form.watch("unitCode") || ""}
                    onValueChange={(v) =>
                      form.setValue("unitCode", v === "__none__" ? "" : v)
                    }
                    disabled={pending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih unit..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Tidak diisi —</SelectItem>
                      {buildingOptions.map((code) => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    {...form.register("unitCode")}
                    placeholder="RKA-101"
                    disabled={pending}
                  />
                )}
              </Field>
              <Field
                label="Lantai"
                error={form.formState.errors.floor?.message}
              >
                <Select
                  value={form.watch("floor") || ""}
                  onValueChange={(v) =>
                    form.setValue("floor", v === "__none__" ? "" : v)
                  }
                  disabled={pending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih lantai..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Tidak diisi —</SelectItem>
                    {FLOOR_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field
              label="Ukuran Kamar"
              error={form.formState.errors.sizeLabel?.message}
              hint="Dimensi kamar, misal: 3x4"
            >
              <Input
                {...form.register("sizeLabel")}
                placeholder="3x4"
                disabled={pending}
              />
            </Field>
          </section>

          <Separator />

          {/* ─── Section: Konfigurasi ─── */}
          <section className="space-y-3">
            <SectionHeader icon={Settings2} title="Konfigurasi" />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Kebijakan Gender"
                error={form.formState.errors.genderPolicy?.message}
              >
                <Select
                  value={form.watch("genderPolicy")}
                  onValueChange={(v) =>
                    form.setValue(
                      "genderPolicy",
                      v as FormValues["genderPolicy"],
                    )
                  }
                  disabled={pending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Putra</SelectItem>
                    <SelectItem value="female">Putri</SelectItem>
                    {showCampur && (
                      <SelectItem value="mixed">
                        Campur (jarang digunakan)
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Tipe Kamar"
                error={form.formState.errors.roomTypeId?.message}
                hint="Opsional — pilih jika sudah ada tipe"
              >
                <Select
                  value={form.watch("roomTypeId") || ""}
                  onValueChange={(v) =>
                    form.setValue("roomTypeId", v === "__none__" ? "" : v)
                  }
                  disabled={pending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih tipe..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Tidak diisi —</SelectItem>
                    {(roomTypes ?? []).map((rt) => (
                      <SelectItem key={rt.id} value={rt.id}>
                        {rt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </section>

          <Separator />

          {/* ─── Section: Harga ─── */}
          <section className="space-y-3">
            <SectionHeader icon={DollarSign} title="Harga" />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Harga Bulanan (IDR)"
                error={form.formState.errors.monthlyPrice?.message}
              >
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  {...form.register("monthlyPrice")}
                  disabled={pending}
                />
              </Field>
              <Field
                label="Deposit (IDR)"
                error={form.formState.errors.depositAmount?.message}
              >
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  {...form.register("depositAmount")}
                  disabled={pending}
                />
              </Field>
            </div>
          </section>

          <Separator />

          {/* ─── Section: Fasilitas ─── */}
          <section className="space-y-3">
            <SectionHeader icon={Tags} title="Fasilitas" />
            {facilities && facilities.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {facilities.map((fac) => (
                  <label
                    key={fac.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted"
                  >
                    <Checkbox
                      checked={currentFacilityIds.includes(fac.id)}
                      onCheckedChange={() => toggleFacility(fac.id)}
                      disabled={pending}
                    />
                    <span>{fac.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Belum ada fasilitas terdaftar. Fasilitas dapat ditambahkan
                melalui menu Master Data.
              </p>
            )}
          </section>

          {/* ─── Footer ─── */}
          <div className="mt-auto" />
          <SheetFooter className="border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
                  Menyimpan...
                </span>
              ) : initial ? (
                "Simpan Perubahan"
              ) : (
                "Simpan Kamar"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* ─── Sub-components ─── */

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: React.ElementType;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && !error ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
