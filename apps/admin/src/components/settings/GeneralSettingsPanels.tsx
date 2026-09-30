import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Building2, ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/state/ErrorState";
import { ForbiddenState } from "@/components/state/ForbiddenState";
import { LoadingState } from "@/components/state/LoadingState";
import { useFilePreview, useFileUpload } from "@/hooks/useFileUpload";
import { toastMutationError } from "@/lib/mutation-feedback";
import type { GeneralSettingsViewModel } from "@/hooks/useGeneralSettings";
import {
  documentSettingsToDraft,
  organizationSettingsToDraft,
  validateOrganizationSettingsDraft,
  validatePropertyDocumentSettingsDraft,
  type DocumentSignatoryRole,
  type OrganizationSettingsDraft,
  type PropertyDocumentSettingsDraft,
} from "@/lib/general-settings";

const EMPTY_ORGANIZATION: OrganizationSettingsDraft = {
  companyName: "",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
};

const SIGNATORY_META: Record<DocumentSignatoryRole, { label: string; description: string }> = {
  manager: {
    label: "Pengelola",
    description: "Pihak yang tercantum pada bagian Dibuat oleh pada dokumen.",
  },
  dbo: {
    label: "DBO",
    description: "Pihak yang tercantum pada bagian Mengetahui pada dokumen.",
  },
  director: {
    label: "Direktur",
    description: "Pihak yang tercantum pada bagian Menyetujui pada dokumen.",
  },
};

const EMPTY_DOCUMENT: PropertyDocumentSettingsDraft = {
  propertyName: "",
  signatories: (["manager", "dbo", "director"] as const).map((role) => ({
    role,
    fullName: "",
    jobTitle: SIGNATORY_META[role].label,
    signatureFileId: null,
    updatedAt: new Date(0).toISOString(),
  })),
};

function SignatureField({
  role,
  fileId,
  propertyId,
  disabled,
  onChange,
}: {
  role: DocumentSignatoryRole;
  fileId: string | null;
  propertyId: string;
  disabled: boolean;
  onChange: (fileId: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = useFilePreview(fileId);
  const { uploadAsync, isUploading } = useFileUpload({ silent: true });
  useEffect(() => {
    const objectUrl = preview.data;
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [preview.data]);
  const onSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const uploaded = await uploadAsync({
        file,
        propertyId,
        filePurpose: "document_signature",
      });
      onChange(uploaded.id);
    } catch (error) {
      toastMutationError(error, "Gambar tanda tangan gagal diunggah");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={onSelect}
        disabled={disabled || isUploading}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium text-foreground">Gambar tanda tangan</p>
          <p className="mt-1 text-sm text-muted-foreground">
            JPG, PNG, atau WebP hingga 2 MB. Sistem menyesuaikan batas gambar dan area kosongnya.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 border-transparent bg-primary text-primary-foreground hover:bg-primary/90 sm:min-h-9"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || isUploading}
          >
            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {fileId ? "Ganti gambar" : "Unggah gambar"}
          </Button>
          {fileId ? (
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 sm:min-h-9"
              onClick={() => onChange(null)}
              disabled={disabled || isUploading}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Hapus gambar
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex min-h-24 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-background px-4 py-3">
        {preview.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
        {!preview.isLoading && preview.data ? (
          <img
            src={preview.data}
            alt={`Pratinjau tanda tangan ${SIGNATORY_META[role].label}`}
            className="max-h-20 max-w-full object-contain"
          />
        ) : null}
        {!preview.isLoading && !preview.data ? (
          <span className="text-center text-sm text-muted-foreground">Belum ada gambar tanda tangan.</span>
        ) : null}
      </div>
      {fileId ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Perubahan gambar diterapkan setelah Pengaturan Dokumen disimpan.
        </p>
      ) : null}
    </div>
  );
}

export function GeneralSettingsPanels({ settings }: { settings: GeneralSettingsViewModel }) {
  const [organizationDraft, setOrganizationDraft] = useState<OrganizationSettingsDraft>(EMPTY_ORGANIZATION);
  const [documentDraft, setDocumentDraft] = useState<PropertyDocumentSettingsDraft>(EMPTY_DOCUMENT);
  const organizationErrors = useMemo(
    () => validateOrganizationSettingsDraft(organizationDraft),
    [organizationDraft],
  );
  const documentErrors = useMemo(
    () => validatePropertyDocumentSettingsDraft(documentDraft),
    [documentDraft],
  );

  useEffect(() => {
    if (settings.organization) setOrganizationDraft(organizationSettingsToDraft(settings.organization));
  }, [settings.organization]);
  useEffect(() => {
    if (settings.documentSettings) setDocumentDraft(documentSettingsToDraft(settings.documentSettings));
  }, [settings.documentSettings]);

  if (!settings.canManage) {
    return (
      <ForbiddenState description="Pengaturan Umum hanya tersedia untuk Admin dengan akses pengelolaan properti." />
    );
  }
  if (!settings.hasActiveProperty) {
    return (
      <div role="alert" className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="font-medium text-foreground">Properti aktif belum tersedia</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Pilih properti aktif sebelum mengelola identitas dokumen.
        </p>
      </div>
    );
  }

  const submitOrganization = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (Object.keys(organizationErrors).length || settings.organizationSaving) return;
    void settings.saveOrganization(organizationDraft).catch(() => undefined);
  };
  const submitDocument = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (Object.keys(documentErrors).length || settings.documentSaving) return;
    void settings.saveDocumentSettings(documentDraft).catch(() => undefined);
  };
  const updateSignatory = (
    role: DocumentSignatoryRole,
    field: "fullName" | "jobTitle" | "signatureFileId",
    value: string | null,
  ) => {
    setDocumentDraft((current) => ({
      ...current,
      signatories: current.signatories.map((signatory) =>
        signatory.role === role ? { ...signatory, [field]: value } : signatory,
      ),
    }));
  };

  return (
    <div className="grid min-w-0 max-w-full grid-cols-1 gap-5">
      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
            Identitas Organisasi
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Informasi global KOSTATION yang akan dipakai pada dokumen resmi berikutnya.
          </p>
        </CardHeader>
        <CardContent>
          {settings.organizationForbidden ? (
            <ForbiddenState description="Server menolak akses ke identitas organisasi." />
          ) : settings.organizationLoading ? (
            <LoadingState label="Memuat identitas organisasi..." />
          ) : settings.organizationError ? (
            <ErrorState
              error={settings.organizationError}
              onRetry={() => void settings.retryOrganization()}
              title="Gagal memuat identitas organisasi"
            />
          ) : (
            <form onSubmit={submitOrganization} className="space-y-5" noValidate>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="min-w-0 md:col-span-2">
                  <Label htmlFor="company-name">Nama organisasi</Label>
                  <Input
                    id="company-name"
                    className="mt-1.5"
                    value={organizationDraft.companyName}
                    onChange={(event) => setOrganizationDraft((draft) => ({ ...draft, companyName: event.target.value }))}
                    aria-invalid={Boolean(organizationErrors.companyName)}
                    disabled={settings.organizationSaving}
                  />
                  {organizationErrors.companyName ? <p role="alert" className="mt-1 text-sm text-destructive">{organizationErrors.companyName}</p> : null}
                </div>
                <div className="min-w-0 md:col-span-2">
                  <Label htmlFor="company-address">Alamat organisasi</Label>
                  <Textarea
                    id="company-address"
                    className="mt-1.5"
                    value={organizationDraft.companyAddress}
                    onChange={(event) => setOrganizationDraft((draft) => ({ ...draft, companyAddress: event.target.value }))}
                    disabled={settings.organizationSaving}
                  />
                  {organizationErrors.companyAddress ? <p role="alert" className="mt-1 text-sm text-destructive">{organizationErrors.companyAddress}</p> : null}
                </div>
                <div className="min-w-0">
                  <Label htmlFor="company-phone">Nomor kontak</Label>
                  <Input
                    id="company-phone"
                    className="mt-1.5"
                    value={organizationDraft.companyPhone}
                    onChange={(event) => setOrganizationDraft((draft) => ({ ...draft, companyPhone: event.target.value }))}
                    disabled={settings.organizationSaving}
                  />
                  {organizationErrors.companyPhone ? <p role="alert" className="mt-1 text-sm text-destructive">{organizationErrors.companyPhone}</p> : null}
                </div>
                <div className="min-w-0">
                  <Label htmlFor="company-email">Email organisasi</Label>
                  <Input
                    id="company-email"
                    type="email"
                    className="mt-1.5"
                    value={organizationDraft.companyEmail}
                    onChange={(event) => setOrganizationDraft((draft) => ({ ...draft, companyEmail: event.target.value }))}
                    disabled={settings.organizationSaving}
                  />
                  {organizationErrors.companyEmail ? <p role="alert" className="mt-1 text-sm text-destructive">{organizationErrors.companyEmail}</p> : null}
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" className="min-h-11 sm:min-h-9" disabled={Boolean(Object.keys(organizationErrors).length) || settings.organizationSaving}>
                  {settings.organizationSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Simpan Identitas Organisasi
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle className="text-base">Identitas Dokumen dan Penandatangan</CardTitle>
          <p className="text-sm text-muted-foreground">
            Pengaturan ini berlaku khusus untuk properti aktif dan dipakai pada dokumen yang diterbitkan setelahnya.
          </p>
        </CardHeader>
        <CardContent>
          {settings.documentForbidden ? (
            <ForbiddenState description="Server menolak akses ke pengaturan dokumen properti." />
          ) : settings.documentLoading ? (
            <LoadingState label="Memuat pengaturan dokumen..." />
          ) : settings.documentError ? (
            <ErrorState
              error={settings.documentError}
              onRetry={() => void settings.retryDocumentSettings()}
              title="Gagal memuat pengaturan dokumen"
            />
          ) : (
            <form onSubmit={submitDocument} className="space-y-6" noValidate>
              <div className="max-w-2xl">
                <Label htmlFor="document-property-name">Nama properti pada dokumen</Label>
                <Input
                  id="document-property-name"
                  className="mt-1.5"
                  value={documentDraft.propertyName}
                  onChange={(event) => setDocumentDraft((draft) => ({ ...draft, propertyName: event.target.value }))}
                  aria-invalid={Boolean(documentErrors.propertyName)}
                  disabled={settings.documentSaving}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Nama ini juga menjadi nama operasional properti pada sistem.
                </p>
                {documentErrors.propertyName ? <p role="alert" className="mt-1 text-sm text-destructive">{documentErrors.propertyName}</p> : null}
              </div>

              <div className="space-y-5">
                {documentDraft.signatories.map((signatory) => (
                  <section key={signatory.role} aria-labelledby={`signatory-${signatory.role}`} className="rounded-xl border border-border p-4 sm:p-5">
                    <div className="mb-5">
                      <h3 id={`signatory-${signatory.role}`} className="font-semibold text-foreground">
                        {SIGNATORY_META[signatory.role].label}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">{SIGNATORY_META[signatory.role].description}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="min-w-0">
                        <Label htmlFor={`${signatory.role}-name`}>Nama lengkap</Label>
                        <Input
                          id={`${signatory.role}-name`}
                          className="mt-1.5"
                          value={signatory.fullName}
                          onChange={(event) => updateSignatory(signatory.role, "fullName", event.target.value)}
                          disabled={settings.documentSaving}
                        />
                      </div>
                      <div className="min-w-0">
                        <Label htmlFor={`${signatory.role}-title`}>Jabatan</Label>
                        <Input
                          id={`${signatory.role}-title`}
                          className="mt-1.5"
                          value={signatory.jobTitle}
                          onChange={(event) => updateSignatory(signatory.role, "jobTitle", event.target.value)}
                          disabled={settings.documentSaving}
                        />
                      </div>
                    </div>
                    {documentErrors[signatory.role] ? <p role="alert" className="mt-2 text-sm text-destructive">{documentErrors[signatory.role]}</p> : null}
                    <div className="mt-4">
                      <SignatureField
                        role={signatory.role}
                        fileId={signatory.signatureFileId}
                        propertyId={settings.documentSettings?.propertyId ?? ""}
                        disabled={settings.documentSaving}
                        onChange={(fileId) => updateSignatory(signatory.role, "signatureFileId", fileId)}
                      />
                    </div>
                  </section>
                ))}
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
                Dokumen yang sudah diterbitkan tetap memakai identitas dan tanda tangan yang tercatat saat penerbitan. Perubahan ini berlaku untuk dokumen baru atau revisi berikutnya.
              </div>
              <div className="flex justify-end">
                <Button type="submit" className="min-h-11 sm:min-h-9" disabled={Boolean(Object.keys(documentErrors).length) || settings.documentSaving}>
                  {settings.documentSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                  Simpan Pengaturan Dokumen
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
