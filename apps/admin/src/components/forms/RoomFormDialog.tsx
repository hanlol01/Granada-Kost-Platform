// Form dialog for create/edit kamar. Uses react-hook-form + zod, keeps the
// existing Lovable card surface unchanged, and submits through useCreateRoom
// or useUpdateRoom. Backend remains final authority; 422 details are mapped
// into inline errors per ADR-FE-008.

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
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
import { ApiError } from "@granada-kost/api-client";
import type { RoomRecord } from "@/hooks/useRooms";
import { useCreateRoom, useUpdateRoom, type CreateRoomInput } from "@/hooks/useRoomMutations";

const Schema = z.object({
  number: z.string().trim().min(1, "Nomor kamar wajib diisi"),
  unitCode: z.string().trim().optional().or(z.literal("")),
  floor: z.string().trim().optional().or(z.literal("")),
  sizeLabel: z.string().trim().optional().or(z.literal("")),
  genderPolicy: z.enum(["male", "female", "mixed"]),
  monthlyPrice: z.coerce.number().int().min(0, "Harga tidak boleh negatif"),
  depositAmount: z.coerce.number().int().min(0, "Deposit tidak boleh negatif"),
});

type FormValues = z.infer<typeof Schema>;

export type RoomFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // When set, the dialog edits an existing room. Otherwise it creates a new one.
  initial?: RoomRecord | null;
};

function toDefaults(initial?: RoomRecord | null): FormValues {
  return {
    number: initial?.number ?? "",
    unitCode: initial?.unitCode ?? "",
    floor: initial?.floor ?? "",
    sizeLabel: initial?.sizeLabel ?? "",
    genderPolicy: (initial?.genderPolicy ?? "mixed") as FormValues["genderPolicy"],
    monthlyPrice: initial?.monthlyPrice ?? 0,
    depositAmount: initial?.depositAmount ?? 0,
  };
}

function applyServerErrors(
  setError: ReturnType<typeof useForm<FormValues>>["setError"],
  err: unknown,
): boolean {
  if (!ApiError.isApiError(err) || err.status !== 422) return false;
  const details = err.details as Record<string, unknown> | undefined;
  if (!details || typeof details !== "object") return false;
  let handled = false;
  for (const [key, message] of Object.entries(details)) {
    const fieldMap: Record<string, keyof FormValues> = {
      number: "number",
      unit_code: "unitCode",
      floor: "floor",
      size_label: "sizeLabel",
      gender_policy: "genderPolicy",
      monthly_price: "monthlyPrice",
      deposit_amount: "depositAmount",
    };
    const target = fieldMap[key];
    if (target) {
      setError(target, { type: "server", message: String(message) });
      handled = true;
    }
  }
  return handled;
}

export function RoomFormDialog({ open, onOpenChange, initial }: RoomFormDialogProps) {
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const pending = create.isPending || update.isPending;

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: toDefaults(initial),
  });

  // Reset whenever the dialog re-opens or switches between create/edit.
  useEffect(() => {
    if (open) form.reset(toDefaults(initial));
  }, [open, initial, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    const payload: CreateRoomInput = {
      number: values.number,
      unitCode: values.unitCode || null,
      floor: values.floor || null,
      sizeLabel: values.sizeLabel || null,
      genderPolicy: values.genderPolicy,
      monthlyPrice: values.monthlyPrice,
      depositAmount: values.depositAmount,
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

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Kamar" : "Tambah Kamar"}</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={onSubmit} noValidate>
          <Field label="Nomor Kamar" error={form.formState.errors.number?.message}>
            <Input {...form.register("number")} placeholder="Mis. 101" disabled={pending} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kode Unit" error={form.formState.errors.unitCode?.message}>
              <Input {...form.register("unitCode")} placeholder="RKA-101" disabled={pending} />
            </Field>
            <Field label="Lantai" error={form.formState.errors.floor?.message}>
              <Input {...form.register("floor")} placeholder="1" disabled={pending} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Label Ukuran" error={form.formState.errors.sizeLabel?.message}>
              <Input {...form.register("sizeLabel")} placeholder="3x4" disabled={pending} />
            </Field>
            <Field label="Gender Policy" error={form.formState.errors.genderPolicy?.message}>
              <Select
                value={form.watch("genderPolicy")}
                onValueChange={(v) =>
                  form.setValue("genderPolicy", v as FormValues["genderPolicy"])
                }
                disabled={pending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mixed">Campur</SelectItem>
                  <SelectItem value="male">Pria</SelectItem>
                  <SelectItem value="female">Wanita</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Harga Bulanan (IDR)" error={form.formState.errors.monthlyPrice?.message}>
              <Input
                type="number"
                min={0}
                step={1000}
                {...form.register("monthlyPrice")}
                disabled={pending}
              />
            </Field>
            <Field label="Deposit (IDR)" error={form.formState.errors.depositAmount?.message}>
              <Input
                type="number"
                min={0}
                step={1000}
                {...form.register("depositAmount")}
                disabled={pending}
              />
            </Field>
          </div>
          <DialogFooter>
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
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Menyimpan...
                </span>
              ) : initial ? (
                "Simpan Perubahan"
              ) : (
                "Simpan Kamar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
