import { ApiError } from "@granada-kost/api-client";
import { normalizeAdminError, type NormalizedAdminError } from "@/lib/error-normalizer";

export type OnboardingErrorNotice = {
  title: string;
  description: string;
  step?: 1 | 2;
};

export type OnboardingStageOneField =
  | "fullName"
  | "phone"
  | "email"
  | "gender"
  | "placeOfBirth"
  | "dateOfBirth"
  | "address"
  | "university"
  | "faculty"
  | "major"
  | "cohort"
  | "instagram"
  | "parentName"
  | "parentPhone"
  | "emergencyPhone"
  | "ktpNumber"
  | "ktpFileId"
  | "startDate"
  | "termMonths"
  | "notes";

const CODE_NOTICES: Readonly<Record<string, OnboardingErrorNotice>> = {
  IDEMPOTENCY_KEY_REQUIRED: {
    title: "Permintaan belum dapat diproses",
    description: "Muat ulang halaman lalu coba simpan kembali.",
  },
  ONBOARDING_INPUT_INVALID: {
    title: "Periksa data penghuni",
    description: "Lengkapi kembali data wajib pada tahap Penghuni & Penyewaan.",
    step: 1,
  },
  BOOKING_FEE_MINIMUM_NOT_MET: {
    title: "Booking fee belum valid",
    description: "Booking fee harus Rp0 atau sekurang-kurangnya Rp1.000.000.",
    step: 2,
  },
  ROOM_REQUIRED: {
    title: "Kamar belum dipilih",
    description: "Pilih satu kamar kosong yang sesuai sebelum menyimpan commitment.",
    step: 2,
  },
  RESIDENT_IDENTITY_REQUIRED: {
    title: "Nomor WhatsApp belum diisi",
    description: "Isi Nomor Telepon / WhatsApp sebagai identitas login utama Penghuni.",
    step: 1,
  },
  RESIDENT_PHONE_REQUIRED: {
    title: "Nomor WhatsApp belum diisi",
    description: "Isi Nomor Telepon / WhatsApp sebagai identitas login utama Penghuni.",
    step: 1,
  },
  RESIDENT_PHONE_INVALID: {
    title: "Nomor telepon belum valid",
    description: "Gunakan nomor Indonesia yang valid, misalnya 081234567890.",
    step: 1,
  },
  RESIDENT_KTP_DOCUMENT_INVALID: {
    title: "Foto KTP tidak dapat digunakan",
    description: "Unggah ulang foto KTP pada properti yang sedang aktif, lalu coba kembali.",
    step: 1,
  },
  RESIDENT_PROFILE_PHOTO_INVALID: {
    title: "Foto penghuni tidak dapat digunakan",
    description: "Unggah ulang foto pada properti yang sedang aktif, lalu coba kembali.",
    step: 1,
  },
  ONBOARDING_FINANCIAL_OBLIGATION_UNMET: {
    title: "Pembayaran awal belum memenuhi ketentuan",
    description: "Periksa kembali booking fee, DP atau pelunasan sewa, dan security deposit.",
    step: 2,
  },
  ROOM_NOT_AVAILABLE: {
    title: "Kamar sudah tidak tersedia",
    description: "Pilih kamar kosong lain karena status kamar telah berubah.",
    step: 2,
  },
  ROOM_LIFECYCLE_CONFLICT: {
    title: "Kamar memiliki penyewaan aktif",
    description: "Pilih kamar lain atau tinjau lifecycle kamar sebelum melanjutkan.",
    step: 2,
  },
  ROOM_COMPATIBILITY_MISMATCH: {
    title: "Kamar tidak sesuai data penghuni",
    description: "Pilih kamar dengan kategori dan kebijakan gender yang sesuai.",
    step: 2,
  },
};

const VALIDATION_FIELD_META: Readonly<Record<string, { label: string; step: 1 | 2 }>> = {
  property_id: { label: "properti aktif", step: 1 },
  booking_lead_id: { label: "minat booking", step: 1 },
  resident_id: { label: "penghuni", step: 1 },
  visitor_name: { label: "Nama lengkap", step: 1 },
  visitor_phone: { label: "Nomor Telepon / WhatsApp", step: 1 },
  visitor_email: { label: "Email untuk akses Penghuni", step: 1 },
  gender: { label: "Jenis kelamin", step: 1 },
  place_of_birth: { label: "Tempat lahir", step: 1 },
  date_of_birth: { label: "Tanggal lahir", step: 1 },
  address: { label: "Alamat", step: 1 },
  university: { label: "Universitas", step: 1 },
  faculty: { label: "Fakultas", step: 1 },
  major: { label: "Jurusan", step: 1 },
  cohort: { label: "Angkatan", step: 1 },
  instagram: { label: "Username Instagram", step: 1 },
  parent_name: { label: "Nama orang tua", step: 1 },
  parent_phone: { label: "Telepon / WhatsApp orang tua", step: 1 },
  emergency_phone: { label: "Kontak darurat", step: 1 },
  ktp_number: { label: "NIK", step: 1 },
  ktp_file_id: { label: "Foto KTP", step: 1 },
  profile_photo_file_id: { label: "Foto penghuni", step: 1 },
  start_date: { label: "Tanggal mulai sewa", step: 1 },
  term_months: { label: "Durasi sewa", step: 1 },
  billing_cycle: { label: "Siklus tagihan", step: 1 },
  payment_plan_type: { label: "Pilihan pembayaran awal", step: 2 },
  accepted_terms_version: { label: "persetujuan ketentuan", step: 2 },
  room_id: { label: "Kamar Kost", step: 2 },
  dp_verified_amount: { label: "DP / uang muka sewa", step: 2 },
  security_deposit_funded_amount: { label: "Security deposit", step: 2 },
  booking_fee_paid_amount: { label: "Booking fee", step: 2 },
  payment_method: { label: "Metode pembayaran", step: 2 },
  payment_evidence_file_ids: { label: "Bukti pembayaran", step: 2 },
  payment_note: { label: "Catatan pembayaran", step: 2 },
  notes: { label: "Catatan internal", step: 1 },
};

const STAGE_ONE_FIELD_BY_API_FIELD: Readonly<Record<string, OnboardingStageOneField>> = {
  visitor_name: "fullName",
  visitor_phone: "phone",
  visitor_email: "email",
  gender: "gender",
  place_of_birth: "placeOfBirth",
  date_of_birth: "dateOfBirth",
  address: "address",
  university: "university",
  faculty: "faculty",
  major: "major",
  cohort: "cohort",
  instagram: "instagram",
  parent_name: "parentName",
  parent_phone: "parentPhone",
  emergency_phone: "emergencyPhone",
  ktp_number: "ktpNumber",
  ktp_file_id: "ktpFileId",
  start_date: "startDate",
  term_months: "termMonths",
  notes: "notes",
};

function validationNotice(details: unknown): OnboardingErrorNotice | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;

  const fields = Object.keys(details)
    .map((key) => VALIDATION_FIELD_META[key])
    .filter((field): field is { label: string; step: 1 | 2 } => Boolean(field));
  const uniqueFields = fields.filter(
    (field, index) => fields.findIndex((candidate) => candidate.label === field.label) === index,
  );
  if (uniqueFields.length === 0) return null;

  const labels = uniqueFields.map((field) => field.label);
  const readableLabels =
    labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} dan ${labels.at(-1)}`;
  const steps = new Set(uniqueFields.map((field) => field.step));
  const step = steps.size === 1 ? uniqueFields[0]?.step : undefined;
  const location =
    step === 1
      ? "pada tahap Penghuni & Penyewaan"
      : step === 2
        ? "pada tahap Pilih Kamar Kost"
        : "pada formulir onboarding";

  return {
    title: "Data onboarding belum valid",
    description: `Periksa ${readableLabels} ${location}.`,
    step,
  };
}

function readableFields(details: unknown): { labels: string; step?: 1 | 2 } | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const fields = Object.keys(details)
    .map((key) => VALIDATION_FIELD_META[key])
    .filter((field): field is { label: string; step: 1 | 2 } => Boolean(field));
  const uniqueFields = fields.filter(
    (field, index) => fields.findIndex((candidate) => candidate.label === field.label) === index,
  );
  if (uniqueFields.length === 0) return null;
  const labels = uniqueFields.map((field) => field.label);
  return {
    labels:
      labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} dan ${labels.at(-1)}`,
    step:
      new Set(uniqueFields.map((field) => field.step)).size === 1
        ? uniqueFields[0]?.step
        : undefined,
  };
}

/** Maps a server-side identity conflict to the exact editable field in stage one. */
export function onboardingErrorFieldErrors(
  error: unknown,
): Partial<Record<OnboardingStageOneField, string>> {
  if (!ApiError.isApiError(error)) return {};
  if (error.code === "RESIDENT_PHONE_INVALID") {
    return { phone: "Gunakan nomor Indonesia yang valid, misalnya 081234567890." };
  }
  if (error.code !== "RESIDENT_IDENTITY_DUPLICATE") return {};
  if (!error.details || typeof error.details !== "object" || Array.isArray(error.details))
    return {};
  const errors: Partial<Record<OnboardingStageOneField, string>> = {};
  for (const field of Object.keys(error.details)) {
    const target = STAGE_ONE_FIELD_BY_API_FIELD[field];
    if (target) errors[target] = "Data ini sudah digunakan oleh penghuni lain pada properti ini.";
  }
  return errors;
}

export function resolveOnboardingErrorNotice(
  error: Pick<NormalizedAdminError, "code" | "kind" | "message">,
): OnboardingErrorNotice {
  const exact = CODE_NOTICES[error.code];
  if (exact) return exact;

  if (error.kind === "validation") {
    return {
      title: "Data onboarding belum valid",
      description: "Periksa isian yang ditandai pada tahap Penghuni & Penyewaan.",
      step: 1,
    };
  }
  if (error.kind === "forbidden") {
    return {
      title: "Akses ditolak",
      description: error.message,
    };
  }
  if (error.kind === "conflict") {
    return {
      title: "Commitment belum dapat disimpan",
      description: "Data kamar atau penyewaan telah berubah. Tinjau pilihan lalu coba kembali.",
      step: 2,
    };
  }
  return {
    title: "Commitment belum dapat disimpan",
    description: error.message,
  };
}

export function onboardingErrorNotice(error: unknown): OnboardingErrorNotice {
  if (ApiError.isApiError(error) && error.code === "RESIDENT_IDENTITY_DUPLICATE") {
    const fields = readableFields(error.details);
    if (fields)
      return {
        title: "Data penghuni sudah terdaftar",
        description: `${fields.labels} sudah digunakan oleh penghuni lain pada properti ini. Gunakan data yang berbeda.`,
        step: fields.step ?? 1,
      };
  }
  if (ApiError.isApiError(error) && error.code === "VALIDATION_ERROR") {
    const notice = validationNotice(error.details);
    if (notice) return notice;
  }
  return resolveOnboardingErrorNotice(normalizeAdminError(error));
}
