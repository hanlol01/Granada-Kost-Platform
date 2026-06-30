// Form dialog for create/edit penghuni. Mirrors RoomFormDialog patterns:
// react-hook-form + zod, inline 422 mapping, no console PII.
//
// Phone/email are optional in the backend DTO. The KTP field is kept short
// (no real masking helper) because the field is server-side authoritative —
// the UI list already masks the value via maskKtp().

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
import type { ResidentRecord } from "@/hooks/useResidents";
import {
  useCreateResident,
  useUpdateResident,
  type CreateResidentInput,
} from "@/hooks/useResidentMutations";

const Schema = z.object({
  fullName: z.string().trim().min(2, "Nama lengkap minimal 2 karakter"),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z.union([z.literal(""), z.string().email("Email tidak valid")]).optional(),
  ktpNumber: z.string().trim().optional().or(z.literal("")),
  gender: z.enum(["male", "female", "other"]).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof Schema>;

export type ResidentFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ResidentRecord | null;
};

function toDefaults(initial?: ResidentRecord | null): FormValues {
  return {
    fullName: initial?.fullName ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    ktpNumber: initial?.ktpNumber ?? "",
    gender: (initial?.gender ?? "") as FormValues["gender"],
  };
}

function applyServerErrors(
  setError: ReturnType<typeof useForm<FormValues>>["setError"],
  err: unknown,
): boolean {
  if (!ApiError.isApiError(err) || err.status !== 422) return false;
  const details = err.details as Record<string, unknown> | undefined;
  if (!details || typeof details !== "object") return false;
  const map: Record<string, keyof FormValues> = {
    full_name: "fullName",
    phone: "phone",
    email: "email",
    ktp_number: "ktpNumber",
    gender: "gender",
  };
  let handled = false;
  for (const [k, msg] of Object.entries(details)) {
    const t = map[k];
    if (t) {
      setError(t, { type: "server", message: String(msg) });
      handled = true;
    }
  }
  return handled;
}

export function ResidentFormDialog({ open, onOpenChange, initial }: ResidentFormDialogProps) {
  const create = useCreateResident();
  const update = useUpdateResident();
  const pending = create.isPending || update.isPending;

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: toDefaults(initial),
  });

  useEffect(() => {
    if (open) form.reset(toDefaults(initial));
  }, [open, initial, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    const payload: CreateResidentInput = {
      fullName: values.fullName,
      phone: values.phone || null,
      email: values.email || null,
      ktpNumber: values.ktpNumber || null,
      gender: (values.gender || null) as CreateResidentInput["gender"],
    };
    try {
      if (initial) {
        await update.mutateAsync({ residentId: initial.id, input: payload });
      } else {
        await create.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch (err) {
      applyServerErrors(form.setError, err);
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Penghuni" : "Tambah Penghuni"}</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={onSubmit} noValidate>
          <Field label="Nama Lengkap" error={form.formState.errors.fullName?.message}>
            <Input {...form.register("fullName")} disabled={pending} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nomor HP" error={form.formState.errors.phone?.message}>
              <Input {...form.register("phone")} placeholder="08..." disabled={pending} />
            </Field>
            <Field label="Email" error={form.formState.errors.email?.message}>
              <Input type="email" {...form.register("email")} disabled={pending} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nomor KTP" error={form.formState.errors.ktpNumber?.message}>
              <Input {...form.register("ktpNumber")} disabled={pending} />
            </Field>
            <Field label="Gender" error={form.formState.errors.gender?.message}>
              <Select
                value={form.watch("gender") || ""}
                onValueChange={(v) => form.setValue("gender", v as FormValues["gender"])}
                disabled={pending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Pria</SelectItem>
                  <SelectItem value="female">Wanita</SelectItem>
                  <SelectItem value="other">Lainnya</SelectItem>
                </SelectContent>
              </Select>
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
                "Simpan Penghuni"
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
