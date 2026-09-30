export type DocumentSignatoryRole = "manager" | "dbo" | "director";

export type OrganizationSettings = {
  companyName: string;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  updatedAt: string;
};

export type PropertyDocumentSignatory = {
  role: DocumentSignatoryRole;
  fullName: string;
  jobTitle: string;
  signatureFileId: string | null;
  updatedAt: string;
};

export type PropertyDocumentSettings = {
  propertyId: string;
  propertyName: string;
  signatories: PropertyDocumentSignatory[];
};

export type OrganizationSettingsDraft = {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
};

export type PropertyDocumentSettingsDraft = {
  propertyName: string;
  signatories: PropertyDocumentSignatory[];
};

type SettingsRequester = {
  get: (path: string, options?: { signal?: AbortSignal }) => Promise<unknown>;
  patch: (path: string, body?: unknown) => Promise<unknown>;
};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGNATORY_ROLES: readonly DocumentSignatoryRole[] = ["manager", "dbo", "director"];

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Respons ${label} tidak valid.`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`Respons ${label} tidak valid.`);
  return value;
}

function optionalString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return string(value, label);
}

function uuid(value: unknown, label: string): string {
  const result = string(value, label);
  if (!UUID_V4.test(result)) throw new Error(`Respons ${label} tidak valid.`);
  return result;
}

function timestamp(value: unknown, label: string): string {
  const result = string(value, label);
  if (Number.isNaN(Date.parse(result))) throw new Error(`Respons ${label} tidak valid.`);
  return result;
}

function signatoryRole(value: unknown): DocumentSignatoryRole {
  if (typeof value !== "string" || !SIGNATORY_ROLES.includes(value as DocumentSignatoryRole)) {
    throw new Error("Respons penandatangan tidak valid.");
  }
  return value as DocumentSignatoryRole;
}

export function parseOrganizationSettings(value: unknown): OrganizationSettings {
  const raw = record(value, "pengaturan organisasi");
  return {
    companyName: string(raw.companyName, "nama organisasi"),
    companyAddress: optionalString(raw.companyAddress, "alamat organisasi"),
    companyPhone: optionalString(raw.companyPhone, "kontak organisasi"),
    companyEmail: optionalString(raw.companyEmail, "email organisasi"),
    updatedAt: timestamp(raw.updatedAt, "waktu pembaruan organisasi"),
  };
}

export function parsePropertyDocumentSettings(value: unknown): PropertyDocumentSettings {
  const raw = record(value, "pengaturan dokumen properti");
  if (!Array.isArray(raw.signatories) || raw.signatories.length !== SIGNATORY_ROLES.length) {
    throw new Error("Respons penandatangan tidak lengkap.");
  }
  const signatories = raw.signatories.map((value) => {
    const signatory = record(value, "penandatangan");
    return {
      role: signatoryRole(signatory.role),
      fullName: string(signatory.fullName, "nama penandatangan"),
      jobTitle: string(signatory.jobTitle, "jabatan penandatangan"),
      signatureFileId: optionalString(signatory.signatureFileId, "berkas tanda tangan"),
      updatedAt: timestamp(signatory.updatedAt, "waktu pembaruan penandatangan"),
    } satisfies PropertyDocumentSignatory;
  });
  if (new Set(signatories.map((signatory) => signatory.role)).size !== SIGNATORY_ROLES.length) {
    throw new Error("Respons peran penandatangan tidak lengkap.");
  }
  return {
    propertyId: uuid(raw.propertyId, "properti dokumen"),
    propertyName: string(raw.propertyName, "nama properti dokumen"),
    signatories,
  };
}

export function organizationSettingsToDraft(settings: OrganizationSettings): OrganizationSettingsDraft {
  return {
    companyName: settings.companyName,
    companyAddress: settings.companyAddress ?? "",
    companyPhone: settings.companyPhone ?? "",
    companyEmail: settings.companyEmail ?? "",
  };
}

export function documentSettingsToDraft(
  settings: PropertyDocumentSettings,
): PropertyDocumentSettingsDraft {
  return {
    propertyName: settings.propertyName,
    signatories: settings.signatories.map((signatory) => ({ ...signatory })),
  };
}

export function validateOrganizationSettingsDraft(draft: OrganizationSettingsDraft) {
  const errors: Partial<Record<keyof OrganizationSettingsDraft, string>> = {};
  if (!draft.companyName.trim()) errors.companyName = "Nama organisasi wajib diisi.";
  else if (draft.companyName.trim().length > 160) errors.companyName = "Nama organisasi maksimal 160 karakter.";
  if (draft.companyAddress.trim().length > 500) errors.companyAddress = "Alamat maksimal 500 karakter.";
  if (draft.companyPhone.trim().length > 50) errors.companyPhone = "Nomor kontak maksimal 50 karakter.";
  if (draft.companyEmail.trim() && !EMAIL.test(draft.companyEmail.trim())) {
    errors.companyEmail = "Masukkan email organisasi yang valid.";
  }
  return errors;
}

export function validatePropertyDocumentSettingsDraft(draft: PropertyDocumentSettingsDraft) {
  const errors: Partial<Record<"propertyName" | DocumentSignatoryRole, string>> = {};
  if (!draft.propertyName.trim()) errors.propertyName = "Nama properti wajib diisi.";
  else if (draft.propertyName.trim().length > 160) errors.propertyName = "Nama properti maksimal 160 karakter.";
  for (const signatory of draft.signatories) {
    if (signatory.fullName.trim().length > 120 || signatory.jobTitle.trim().length > 120) {
      errors[signatory.role] = "Nama dan jabatan maksimal 120 karakter.";
    }
  }
  return errors;
}

export async function requestOrganizationSettings(
  requester: SettingsRequester,
  propertyId: string,
  signal?: AbortSignal,
): Promise<OrganizationSettings> {
  const response = await requester.get(
    `/properties/${encodeURIComponent(propertyId)}/organization-settings`,
    { signal },
  );
  return parseOrganizationSettings(response);
}

export async function requestPropertyDocumentSettings(
  requester: SettingsRequester,
  propertyId: string,
  signal?: AbortSignal,
): Promise<PropertyDocumentSettings> {
  const response = await requester.get(
    `/properties/${encodeURIComponent(propertyId)}/document-settings`,
    { signal },
  );
  return parsePropertyDocumentSettings(response);
}

export async function updateOrganizationSettings(
  requester: SettingsRequester,
  propertyId: string,
  draft: OrganizationSettingsDraft,
): Promise<OrganizationSettings> {
  const response = await requester.patch(
    `/properties/${encodeURIComponent(propertyId)}/organization-settings`,
    {
      company_name: draft.companyName.trim(),
      company_address: draft.companyAddress.trim() || null,
      company_phone: draft.companyPhone.trim() || null,
      company_email: draft.companyEmail.trim() || null,
    },
  );
  return parseOrganizationSettings(response);
}

export async function updatePropertyDocumentSettings(
  requester: SettingsRequester,
  propertyId: string,
  draft: PropertyDocumentSettingsDraft,
): Promise<PropertyDocumentSettings> {
  const response = await requester.patch(
    `/properties/${encodeURIComponent(propertyId)}/document-settings`,
    {
      property_name: draft.propertyName.trim(),
      signatories: draft.signatories.map((signatory) => ({
        role: signatory.role,
        full_name: signatory.fullName.trim(),
        job_title: signatory.jobTitle.trim(),
        signature_file_id: signatory.signatureFileId,
      })),
    },
  );
  return parsePropertyDocumentSettings(response);
}
