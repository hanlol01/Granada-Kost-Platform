export type NewLeaseDraftValidationInput = {
  fullName: string;
  phone: string;
  email: string;
  gender: string;
  startDate: string;
  termMonths: number;
  placeOfBirth?: string;
  dateOfBirth?: string;
  address?: string;
  university?: string;
  faculty?: string;
  major?: string;
  cohort?: string;
  parentName?: string;
  parentPhone?: string;
  emergencyPhone?: string;
  instagram?: string;
  ktpNumber?: string;
  notes?: string;
};

export type NewLeaseDraftErrors = Partial<Record<keyof NewLeaseDraftValidationInput, string>>;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateOnly(value: string): boolean {
  const match = DATE_ONLY.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function calculateLeaseEndDate(startDate: string, termMonths: number): string {
  if (!isValidDateOnly(startDate) || !Number.isInteger(termMonths) || termMonths < 3) {
    return "";
  }

  const [, yearValue, monthValue, dayValue] = DATE_ONLY.exec(startDate)!;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const endDate = new Date(Date.UTC(year, month - 1 + termMonths, day));

  return endDate.toISOString().slice(0, 10);
}

export function formatDateWithDashes(value: string): string {
  if (!isValidDateOnly(value)) return "—";
  const [, year, month, day] = DATE_ONLY.exec(value)!;
  return `${day} - ${month} - ${year}`;
}

export function formatIndonesianDate(value: string): string {
  if (!isValidDateOnly(value)) return "—";
  const [, year, month, day] = DATE_ONLY.exec(value)!;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
}

export function normalizeDigits(value: string): number {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return 0;

  const amount = Number(digits);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : 0;
}

export function formatIdrInput(value: number): string {
  const amount = Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(amount);
}

export function isDigitsOnly(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

export function isValidIndonesianPhone(value: string): boolean {
  const compact = value.trim().replace(/[\s().-]/g, "");
  if (!/^\+?\d+$/.test(compact)) return false;

  const normalized = compact.startsWith("+62")
    ? compact.slice(1)
    : compact.startsWith("0")
      ? `62${compact.slice(1)}`
      : compact;

  return normalized.startsWith("62") && normalized.length >= 10 && normalized.length <= 15;
}

export function validateNewLeaseDraft(input: NewLeaseDraftValidationInput): NewLeaseDraftErrors {
  const errors: NewLeaseDraftErrors = {};

  const maxLength = (
    key: keyof NewLeaseDraftValidationInput,
    value: string | undefined,
    maximum: number,
    label: string,
  ) => {
    if ((value?.trim().length ?? 0) > maximum) {
      errors[key] = `${label} maksimal ${maximum} karakter.`;
    }
  };

  const optionalPhone = (
    key: "parentPhone" | "emergencyPhone",
    value: string | undefined,
    label: string,
  ) => {
    const normalized = value?.trim() ?? "";
    if (!normalized) return;
    if (!isDigitsOnly(normalized)) errors[key] = `${label} hanya boleh berisi angka.`;
    else if (normalized.length > 20) errors[key] = `${label} maksimal 20 digit.`;
  };

  if (!input.fullName.trim()) errors.fullName = "Nama lengkap wajib diisi.";
  else if (input.fullName.trim().length > 160)
    errors.fullName = "Nama lengkap maksimal 160 karakter.";
  if (!input.phone.trim()) {
    errors.phone = "Nomor Telepon / WhatsApp wajib diisi.";
  } else if (!isDigitsOnly(input.phone)) {
    errors.phone = "Nomor Telepon / WhatsApp hanya boleh berisi angka.";
  } else if (!isValidIndonesianPhone(input.phone)) {
    errors.phone =
      "Nomor Telepon / WhatsApp harus berupa nomor Indonesia yang valid (contoh: 081234567890).";
  } else if (input.phone.trim().length > 20) {
    errors.phone = "Nomor Telepon / WhatsApp maksimal 20 digit.";
  }
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim()) || input.email.trim().length > 254) {
    errors.email = "Email untuk akses Penghuni tidak valid.";
  }
  if (!input.gender) errors.gender = "Jenis kelamin wajib dipilih.";
  if (!isValidDateOnly(input.startDate)) {
    errors.startDate = "Tanggal mulai sewa wajib diisi.";
  }
  if (!Number.isInteger(input.termMonths) || input.termMonths < 3) {
    errors.termMonths = "Durasi sewa minimal 3 bulan.";
  }

  const ktpNumber = input.ktpNumber?.trim() ?? "";
  if (ktpNumber && (!isDigitsOnly(ktpNumber) || ktpNumber.length !== 16)) {
    errors.ktpNumber = "NIK harus terdiri dari tepat 16 digit.";
  }
  if (input.dateOfBirth && !isValidDateOnly(input.dateOfBirth)) {
    errors.dateOfBirth = "Tanggal lahir tidak valid.";
  }
  optionalPhone("parentPhone", input.parentPhone, "Telepon / WhatsApp orang tua");
  optionalPhone("emergencyPhone", input.emergencyPhone, "Kontak darurat");
  maxLength("placeOfBirth", input.placeOfBirth, 120, "Tempat lahir");
  maxLength("address", input.address, 1000, "Alamat");
  maxLength("university", input.university, 160, "Universitas");
  maxLength("faculty", input.faculty, 120, "Fakultas");
  maxLength("major", input.major, 120, "Jurusan");
  maxLength("cohort", input.cohort, 40, "Angkatan");
  maxLength("parentName", input.parentName, 160, "Nama orang tua");
  maxLength("instagram", input.instagram, 100, "Username Instagram");
  maxLength("notes", input.notes, 500, "Catatan internal");

  return errors;
}
