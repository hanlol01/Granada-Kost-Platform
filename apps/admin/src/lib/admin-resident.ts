import { ApiError, ERROR_CODES } from "@granada-kost/domain";

export type ResidentStatus = "active" | "inactive";
export type ResidentAccountStatus = "active" | "inactive" | "suspended" | "not_provisioned";

export type ResidentListRecord = {
  id: string;
  propertyId: string;
  fullName: string;
  university: string | null;
  roomNumber: string | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  leaseAuthorityCount: number;
  accountStatus: ResidentAccountStatus;
  residentStatus: ResidentStatus;
  createdAt: string;
  updatedAt: string;
};

export type ResidentDetail = ResidentListRecord & {
  userId: string | null;
  phone: string | null;
  email: string | null;
  gender: "male" | "female" | "other" | null;
  ktpNumber: string | null;
  dateOfBirth: string | null;
  placeOfBirth: string | null;
  address: string | null;
  faculty: string | null;
  major: string | null;
  cohort: string | null;
  instagram: string | null;
  parentName: string | null;
  parentPhone: string | null;
  maritalStatus: string | null;
  emergencyPhone: string | null;
  emergencyContacts: Array<{
    id: string;
    contactName: string;
    relationship: string | null;
    phone: string;
  }>;
  ktpDocument: { fileId: string; contentUrl: string } | null;
  profilePhotoFileId: string | null;
};

export type ResidentPage = {
  data: ResidentListRecord[];
  meta: { limit: number; offset: number; total: number };
};

export type ResidentAccountReceipt = {
  status: "provisioned" | "already_linked" | "already_issued";
  temporaryPassword: string | null;
};

function invalid(): never {
  throw new ApiError({
    code: ERROR_CODES.PARSE_ERROR,
    message: "Resident response is invalid.",
    status: 200,
  });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalid();
  }
}

function text(value: unknown, nullable = false): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || value.trim().length === 0) return invalid();
  return value.trim();
}

function uuid(value: unknown, nullable = false): string | null {
  const parsed = text(value, nullable);
  if (parsed === null) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)) {
    return invalid();
  }
  return parsed;
}

function integer(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) return invalid();
  return value as number;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) return invalid();
  return value as T;
}

const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?(Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function validCalendarDate(year: number, month: number, day: number): boolean {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function timestamp(value: unknown): string {
  const parsed = text(value);
  if (parsed === null) return invalid();
  const match = parsed.match(ISO_TIMESTAMP_PATTERN);
  if (!match) return invalid();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!validCalendarDate(year, month, day) || Number.isNaN(Date.parse(parsed))) return invalid();
  return parsed;
}

function date(value: unknown, nullable = false): string | null {
  const parsed = text(value, nullable);
  if (parsed === null) return null;
  const match = parsed.match(ISO_DATE_PATTERN);
  if (!match || !validCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))) {
    return invalid();
  }
  return parsed;
}

const LIST_KEYS = [
  "id",
  "property_id",
  "full_name",
  "university",
  "room_number",
  "lease_start",
  "lease_end",
  "lease_authority_count",
  "account_status",
  "resident_status",
  "created_at",
  "updated_at",
] as const;

function parseListRecord(value: unknown): ResidentListRecord {
  const item = record(value);
  exact(item, LIST_KEYS);
  return {
    id: uuid(item.id) as string,
    propertyId: uuid(item.property_id) as string,
    fullName: text(item.full_name) as string,
    university: text(item.university, true),
    roomNumber: text(item.room_number, true),
    leaseStart: date(item.lease_start, true),
    leaseEnd: date(item.lease_end, true),
    leaseAuthorityCount: integer(item.lease_authority_count),
    accountStatus: enumValue(item.account_status, [
      "active",
      "inactive",
      "suspended",
      "not_provisioned",
    ]),
    residentStatus: enumValue(item.resident_status, ["active", "inactive"]),
    createdAt: timestamp(item.created_at),
    updatedAt: timestamp(item.updated_at),
  };
}

export function parseResidentPage(value: unknown, expectedPropertyId: string): ResidentPage {
  const envelope = record(value);
  exact(envelope, ["data", "meta"]);
  if (!Array.isArray(envelope.data)) return invalid();
  const meta = record(envelope.meta);
  exact(meta, ["limit", "offset", "total"]);
  return {
    data: envelope.data.map((item) => {
      const parsed = parseListRecord(item);
      if (parsed.propertyId !== expectedPropertyId) return invalid();
      return parsed;
    }),
    meta: {
      limit: integer(meta.limit),
      offset: integer(meta.offset),
      total: integer(meta.total),
    },
  };
}

export function parseResidentDetail(value: unknown, expectedPropertyId: string): ResidentDetail {
  const envelope = record(value);
  exact(envelope, ["data"]);
  const item = record(envelope.data);
  exact(item, [
    "id",
    "property_id",
    "user_id",
    "full_name",
    "phone",
    "email",
    "gender",
    "account_status",
    "resident_status",
    "active_lease",
    "created_at",
    "updated_at",
    "ktp_number",
    "date_of_birth",
    "place_of_birth",
    "address",
    "university",
    "faculty",
    "major",
    "cohort",
    "instagram",
    "parent_name",
    "parent_phone",
    "marital_status",
    "emergency_phone",
    "emergency_contacts",
    "ktp_document",
    "profile_photo_file_id",
  ]);
  if (item.active_lease !== null || !Array.isArray(item.emergency_contacts)) return invalid();
  const emergencyContacts = item.emergency_contacts.map((candidate) => {
    const contact = record(candidate);
    exact(contact, ["id", "contact_name", "relationship", "phone"]);
    return {
      id: uuid(contact.id) as string,
      contactName: text(contact.contact_name) as string,
      relationship: text(contact.relationship, true),
      phone: text(contact.phone) as string,
    };
  });
  let ktpDocument: ResidentDetail["ktpDocument"] = null;
  if (item.ktp_document !== null) {
    const document = record(item.ktp_document);
    exact(document, ["file_id", "content_url"]);
    ktpDocument = {
      fileId: uuid(document.file_id) as string,
      contentUrl: text(document.content_url) as string,
    };
  }
  const parsedPropertyId = uuid(item.property_id) as string;
  if (parsedPropertyId !== expectedPropertyId) return invalid();
  return {
    id: uuid(item.id) as string,
    propertyId: parsedPropertyId,
    userId: uuid(item.user_id, true),
    fullName: text(item.full_name) as string,
    phone: text(item.phone, true),
    email: text(item.email, true),
    gender:
      item.gender === null ? null : enumValue(item.gender, ["male", "female", "other"] as const),
    accountStatus: enumValue(item.account_status, [
      "active",
      "inactive",
      "suspended",
      "not_provisioned",
    ]),
    residentStatus: enumValue(item.resident_status, ["active", "inactive"]),
    roomNumber: null,
    leaseStart: null,
    leaseEnd: null,
    leaseAuthorityCount: 0,
    university: text(item.university, true),
    ktpNumber: text(item.ktp_number, true),
    dateOfBirth: date(item.date_of_birth, true),
    placeOfBirth: text(item.place_of_birth, true),
    address: text(item.address, true),
    faculty: text(item.faculty, true),
    major: text(item.major, true),
    cohort: text(item.cohort, true),
    instagram: text(item.instagram, true),
    parentName: text(item.parent_name, true),
    parentPhone: text(item.parent_phone, true),
    maritalStatus: text(item.marital_status, true),
    emergencyPhone: text(item.emergency_phone, true),
    emergencyContacts,
    ktpDocument,
    profilePhotoFileId: uuid(item.profile_photo_file_id, true),
    createdAt: timestamp(item.created_at),
    updatedAt: timestamp(item.updated_at),
  };
}

export function parseResidentAccountReceipt(value: unknown): ResidentAccountReceipt {
  const envelope = record(value);
  exact(envelope, ["data"]);
  const data = record(envelope.data);
  exact(data, ["status", "temporary_password"]);
  const status = enumValue(data.status, ["provisioned", "already_linked", "already_issued"]);
  const temporaryPassword = text(data.temporary_password, true);
  if ((status === "provisioned") !== (temporaryPassword !== null)) return invalid();
  return { status, temporaryPassword };
}
