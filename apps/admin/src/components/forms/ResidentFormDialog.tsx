// Form dialog for create/edit penghuni. Mirrors RoomFormDialog patterns:
// react-hook-form + zod, inline 422 mapping, no console PII.
//
// Phone/email are optional in the backend DTO. The KTP field is kept short
// (no real masking helper) because the field is server-side authoritative —
// the UI list already masks the value via maskKtp().

import { useEffect, useMemo, useRef } from "react";
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
import { FileUploadField, type FileUploadReference } from "@/components/file/FileUploadField";
import { UniversityCombobox } from "@/components/forms/UniversityCombobox";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
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
import { revealFirstValidationError } from "@/lib/validation-focus";
import { useProperty } from "@/lib/property";

const Schema = z.object({
  fullName: z.string().trim().min(2, "Nama lengkap minimal 2 karakter"),
  phone: z
    .string()
    .trim()
    .min(1, "Nomor HP wajib diisi")
    .regex(/^(?:\+62|62|0)8\d{7,12}$/, "Gunakan nomor WhatsApp Indonesia yang valid"),
  email: z.string().trim().min(1, "Email wajib diisi").email("Email tidak valid"),
  ktpNumber: z.string().trim().optional().or(z.literal("")),
  ktpFileId: z.string().uuid().nullable().optional(),
  dateOfBirth: z.string().optional().or(z.literal("")),
  placeOfBirth: z.string().trim().optional().or(z.literal("")),
  address: z.string().trim().optional().or(z.literal("")),
  university: z.string().trim().optional().or(z.literal("")),
  faculty: z.string().trim().optional().or(z.literal("")),
  major: z.string().trim().optional().or(z.literal("")),
  cohort: z.string().trim().optional().or(z.literal("")),
  instagram: z.string().trim().optional().or(z.literal("")),
  parentName: z.string().trim().optional().or(z.literal("")),
  parentPhone: z.string().trim().optional().or(z.literal("")),
  emergencyPhone: z.string().trim().optional().or(z.literal("")),
  gender: z
    .enum(["male", "female", "other"])
    .or(z.literal(""))
    .refine((value) => value !== "", "Pilih jenis kelamin"),
});

// React Hook Form owns the pre-validation shape as well, so it must retain
// the empty string used by the gender placeholder until the user chooses one.
type FormValues = z.input<typeof Schema>;

export type ResidentFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ResidentRecord | null;
  onSaved?: () => void;
};

function toDefaults(initial?: ResidentRecord | null): FormValues {
  return {
    fullName: initial?.fullName ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    ktpNumber: initial?.ktpNumber ?? "",
    ktpFileId: undefined,
    dateOfBirth: initial?.dateOfBirth ?? "",
    placeOfBirth: initial?.placeOfBirth ?? "",
    address: initial?.address ?? "",
    university: initial?.university ?? "",
    faculty: initial?.faculty ?? "",
    major: initial?.major ?? "",
    cohort: initial?.cohort ?? "",
    instagram: initial?.instagram ?? "",
    parentName: initial?.parentName ?? "",
    parentPhone: initial?.parentPhone ?? "",
    emergencyPhone: initial?.emergencyPhone ?? "",
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
    ktp_file_id: "ktpFileId",
    gender: "gender",
    date_of_birth: "dateOfBirth",
    place_of_birth: "placeOfBirth",
    address: "address",
    university: "university",
    faculty: "faculty",
    major: "major",
    cohort: "cohort",
    instagram: "instagram",
    parent_name: "parentName",
    parent_phone: "parentPhone",
    emergency_phone: "emergencyPhone",
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

export function ResidentFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: ResidentFormDialogProps) {
  const create = useCreateResident();
  const update = useUpdateResident();
  const { currentPropertyId } = useProperty();
  const pending = create.isPending || update.isPending;
  const formRef = useRef<HTMLFormElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: toDefaults(initial),
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  useEffect(() => {
    if (open) form.reset(toDefaults(initial));
  }, [open, initial, form]);

  useEffect(() => {
    if (open && Object.keys(form.formState.errors).length > 0) {
      revealFirstValidationError(formRef.current);
    }
  }, [form.formState.errors, open]);

  const selectedKtpFileId = form.watch("ktpFileId");
  const ktpFile = useMemo<FileUploadReference | null>(() => {
    if (selectedKtpFileId === null) return null;
    if (selectedKtpFileId) return { id: selectedKtpFileId };
    if (!initial?.ktpDocument) return null;
    return {
      id: initial.ktpDocument.fileId,
      original_filename: "Foto KTP tersimpan",
      mime_type: "application/pdf",
    };
  }, [initial?.ktpDocument, selectedKtpFileId]);

  const onSubmit = form.handleSubmit(async (values) => {
    const payload: CreateResidentInput = {
      fullName: values.fullName,
      phone: values.phone || null,
      email: values.email || null,
      ktpNumber: values.ktpNumber || null,
      ...(form.formState.dirtyFields.ktpFileId ? { ktpFileId: values.ktpFileId ?? null } : {}),
      dateOfBirth: values.dateOfBirth || null,
      placeOfBirth: values.placeOfBirth || null,
      address: values.address || null,
      university: values.university || null,
      faculty: values.faculty || null,
      major: values.major || null,
      cohort: values.cohort || null,
      instagram: values.instagram || null,
      parentName: values.parentName || null,
      parentPhone: values.parentPhone || null,
      emergencyPhone: values.emergencyPhone || null,
      gender: (values.gender || null) as CreateResidentInput["gender"],
    };
    try {
      if (initial) {
        await update.mutateAsync({ residentId: initial.id, input: payload });
      } else {
        await create.mutateAsync(payload);
      }
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      applyServerErrors(form.setError, err);
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Penghuni" : "Tambah Penghuni"}</DialogTitle>
        </DialogHeader>
        <form ref={formRef} className="space-y-5" onSubmit={onSubmit} noValidate>
          <section className="space-y-3">
            <p className="text-sm font-semibold text-foreground">Identitas dan kontak</p>
            <Field label="Nama Lengkap" required error={form.formState.errors.fullName?.message}>
              <Input
                {...form.register("fullName")}
                aria-invalid={Boolean(form.formState.errors.fullName)}
                disabled={pending}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Nomor HP / WhatsApp"
                required
                error={form.formState.errors.phone?.message}
              >
                <Input
                  {...form.register("phone")}
                  inputMode="tel"
                  placeholder="08... atau 62..."
                  aria-invalid={Boolean(form.formState.errors.phone)}
                  disabled={pending}
                />
              </Field>
              <Field label="Email" required error={form.formState.errors.email?.message}>
                <Input
                  type="email"
                  {...form.register("email")}
                  aria-invalid={Boolean(form.formState.errors.email)}
                  disabled={pending}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Jenis kelamin" required error={form.formState.errors.gender?.message}>
                <Select
                  value={form.watch("gender") || ""}
                  onValueChange={(v) =>
                    form.setValue("gender", v as FormValues["gender"], {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  disabled={pending}
                >
                  <SelectTrigger aria-invalid={Boolean(form.formState.errors.gender)}>
                    <SelectValue placeholder="Pilih jenis kelamin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Pria</SelectItem>
                    <SelectItem value="female">Wanita</SelectItem>
                    <SelectItem value="other">Lainnya</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Tempat Lahir"
                optional
                error={form.formState.errors.placeOfBirth?.message}
              >
                <Input {...form.register("placeOfBirth")} disabled={pending} />
              </Field>
              <HeroUiDatePicker
                id="resident-date-of-birth"
                label="Tanggal Lahir (opsional)"
                value={form.watch("dateOfBirth")}
                onChange={(value) =>
                  form.setValue("dateOfBirth", value ?? "", {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                error={form.formState.errors.dateOfBirth?.message}
                disabled={pending}
              />
            </div>
            <Field label="Alamat" optional error={form.formState.errors.address?.message}>
              <textarea
                {...form.register("address")}
                className="flex min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending}
              />
            </Field>
          </section>
          <section className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-semibold text-foreground">Pendidikan dan keluarga</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Universitas/Pendidikan"
                optional
                error={form.formState.errors.university?.message}
              >
                <UniversityCombobox
                  id="resident-university"
                  value={form.watch("university") ?? ""}
                  propertyId={currentPropertyId}
                  disabled={pending}
                  aria-invalid={Boolean(form.formState.errors.university)}
                  onChange={(value) =>
                    form.setValue("university", value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
              </Field>
              <Field label="Angkatan" optional error={form.formState.errors.cohort?.message}>
                <Input {...form.register("cohort")} disabled={pending} />
              </Field>
              <Field label="Fakultas" optional error={form.formState.errors.faculty?.message}>
                <Input {...form.register("faculty")} disabled={pending} />
              </Field>
              <Field label="Jurusan" optional error={form.formState.errors.major?.message}>
                <Input {...form.register("major")} disabled={pending} />
              </Field>
              <Field label="Instagram" optional error={form.formState.errors.instagram?.message}>
                <Input {...form.register("instagram")} disabled={pending} />
              </Field>
              <Field
                label="Kontak Darurat"
                optional
                error={form.formState.errors.emergencyPhone?.message}
              >
                <Input {...form.register("emergencyPhone")} disabled={pending} />
              </Field>
              <Field
                label="Nama Orang Tua"
                optional
                error={form.formState.errors.parentName?.message}
              >
                <Input {...form.register("parentName")} disabled={pending} />
              </Field>
              <Field
                label="Kontak Orang Tua"
                optional
                error={form.formState.errors.parentPhone?.message}
              >
                <Input {...form.register("parentPhone")} disabled={pending} />
              </Field>
            </div>
          </section>
          <section className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-semibold text-foreground">Identitas resmi</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nomor KTP" optional error={form.formState.errors.ktpNumber?.message}>
                <Input {...form.register("ktpNumber")} disabled={pending} />
              </Field>
            </div>
            {currentPropertyId ? (
              <FileUploadField
                propertyId={currentPropertyId}
                filePurpose="ktp"
                label="Foto KTP"
                description="JPG atau PNG akan dikompresi otomatis sebelum diunggah; PDF tidak diubah. Gunakan Lihat, Ganti, atau Hapus untuk mengelola dokumen."
                value={ktpFile}
                onChange={(file) =>
                  form.setValue("ktpFileId", file?.id ?? null, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                compressImages
                disabled={pending}
                capture="environment"
                deleteOnRemove={false}
              />
            ) : null}
          </section>
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
  required = false,
  optional = false,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
        {optional ? (
          <span className="ml-1 font-normal text-muted-foreground">(opsional)</span>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p
          className="text-[11px] text-destructive"
          data-validation-target="true"
          role="alert"
          tabIndex={-1}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
