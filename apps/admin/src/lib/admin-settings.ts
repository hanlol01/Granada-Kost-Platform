export type AdminPropertyProfile = {
  propertyId: string;
  name: string;
  address: string;
  phone: string | null;
  email: string | null;
};

export type PersonalNotificationPreference = {
  emailEnabled: boolean;
};

export type AdminPropertyProfileDraft = {
  name: string;
  address: string;
  phone: string;
  email: string;
};

export type AdminPropertyProfilePayload = {
  name: string;
  address: string;
  phone: string | null;
  email: string | null;
};

export type AdminPropertyProfileErrors = Partial<Record<keyof AdminPropertyProfileDraft, string>>;

export type SettingsRequester = {
  get: (
    path: string,
    options?: {
      signal?: AbortSignal;
    },
  ) => Promise<unknown>;
  patch: (
    path: string,
    body?: unknown,
    options?: {
      signal?: AbortSignal;
    },
  ) => Promise<unknown>;
};

export type ActiveSettingsSubmission<T> = {
  fingerprint: string;
  promise: Promise<T>;
};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const SETTINGS_ROLES = new Set(["owner", "manager"]);
const PROPERTY_RESPONSE_KEYS = [
  "address",
  "createdAt",
  "email",
  "id",
  "name",
  "phone",
  "status",
  "timezone",
  "updatedAt",
] as const;
const PREFERENCE_RESPONSE_KEYS = [
  "created_at",
  "digest_mode",
  "email_enabled",
  "id",
  "push_enabled",
  "quiet_hours_end",
  "quiet_hours_start",
  "updated_at",
  "whatsapp_enabled",
] as const;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label} response`);
  }
  return value as Record<string, unknown>;
}

function exactRecord(
  value: unknown,
  label: string,
  expectedKeys: readonly string[],
): Record<string, unknown> {
  const raw = record(value, label);
  const keys = Object.keys(raw).sort();
  const expected = [...expectedKeys].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error(`Invalid ${label} response`);
  }
  return raw;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${label}`);
  }
  return value.trim();
}

function optionalString(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`Invalid ${label}`);
  return value.trim() || null;
}

function uuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_V4.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Invalid ${label}`);
  return value;
}

function optionalTime(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !TIME.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

export function parseAdminPropertyProfile(
  value: unknown,
  expectedPropertyId: string,
): AdminPropertyProfile {
  uuid(expectedPropertyId, "expected property id");
  const raw = exactRecord(value, "property profile", PROPERTY_RESPONSE_KEYS);
  const propertyId = uuid(raw.id, "property id");
  if (propertyId !== expectedPropertyId) throw new Error("Property scope mismatch");
  const email = optionalString(raw.email, "property email");
  if (email && !EMAIL.test(email)) throw new Error("Invalid property email");
  requiredString(raw.timezone, "property timezone");
  if (raw.status !== "active" && raw.status !== "inactive") {
    throw new Error("Invalid property status");
  }
  timestamp(raw.createdAt, "property created timestamp");
  timestamp(raw.updatedAt, "property updated timestamp");

  return {
    propertyId,
    name: requiredString(raw.name, "property name"),
    address: requiredString(raw.address, "property address"),
    phone: optionalString(raw.phone, "property phone"),
    email,
  };
}

export function parsePersonalNotificationPreference(
  value: unknown,
): PersonalNotificationPreference {
  const raw = exactRecord(value, "notification preference", PREFERENCE_RESPONSE_KEYS);
  if (raw.id !== "") uuid(raw.id, "notification preference id");
  const emailEnabled = requiredBoolean(raw.email_enabled, "email notification preference");
  requiredBoolean(raw.whatsapp_enabled, "WhatsApp notification preference");
  requiredBoolean(raw.push_enabled, "push notification preference");
  requiredBoolean(raw.digest_mode, "digest notification preference");
  optionalTime(raw.quiet_hours_start, "quiet hours start");
  optionalTime(raw.quiet_hours_end, "quiet hours end");
  timestamp(raw.created_at, "notification preference created timestamp");
  timestamp(raw.updated_at, "notification preference updated timestamp");
  return { emailEnabled };
}

export function adminPropertyProfileToDraft(
  profile: AdminPropertyProfile,
): AdminPropertyProfileDraft {
  return {
    name: profile.name,
    address: profile.address,
    phone: profile.phone ?? "",
    email: profile.email ?? "",
  };
}

export function reconcileAdminPropertyProfileDraft(
  previousSnapshot: AdminPropertyProfile | null,
  currentDraft: AdminPropertyProfileDraft,
  nextSnapshot: AdminPropertyProfile | null,
): AdminPropertyProfileDraft {
  if (!nextSnapshot) {
    return previousSnapshot ? { name: "", address: "", phone: "", email: "" } : currentDraft;
  }
  if (
    !previousSnapshot ||
    previousSnapshot.propertyId !== nextSnapshot.propertyId ||
    profilesEqual(previousSnapshot, currentDraft)
  ) {
    return adminPropertyProfileToDraft(nextSnapshot);
  }
  return currentDraft;
}

export type PersonalPreferenceSnapshot = {
  accountId: string;
  preference: PersonalNotificationPreference;
};

export function reconcilePersonalPreferenceDraft(
  previousSnapshot: PersonalPreferenceSnapshot | null,
  currentValue: boolean,
  nextSnapshot: PersonalPreferenceSnapshot | null,
): boolean {
  if (!nextSnapshot) return currentValue;
  if (
    !previousSnapshot ||
    previousSnapshot.accountId !== nextSnapshot.accountId ||
    previousSnapshot.preference.emailEnabled === currentValue
  ) {
    return nextSnapshot.preference.emailEnabled;
  }
  return currentValue;
}

export function toAdminPropertyProfilePayload(
  draft: AdminPropertyProfileDraft,
): AdminPropertyProfilePayload {
  return {
    name: draft.name.trim(),
    address: draft.address.trim(),
    phone: draft.phone.trim() || null,
    email: draft.email.trim() || null,
  };
}

export function validateAdminPropertyProfileDraft(
  draft: AdminPropertyProfileDraft,
): AdminPropertyProfileErrors {
  const payload = toAdminPropertyProfilePayload(draft);
  const errors: AdminPropertyProfileErrors = {};
  if (!payload.name) errors.name = "Nama properti wajib diisi.";
  else if (payload.name.length > 150) errors.name = "Nama properti maksimal 150 karakter.";
  if (!payload.address) errors.address = "Alamat properti wajib diisi.";
  if (payload.phone && payload.phone.length > 50) {
    errors.phone = "Nomor kontak maksimal 50 karakter.";
  }
  if (payload.email && !EMAIL.test(payload.email)) {
    errors.email = "Masukkan alamat email yang valid.";
  }
  return errors;
}

export function profilesEqual(
  profile: AdminPropertyProfile,
  draft: AdminPropertyProfileDraft,
): boolean {
  const payload = toAdminPropertyProfilePayload(draft);
  return (
    profile.name === payload.name &&
    profile.address === payload.address &&
    profile.phone === payload.phone &&
    profile.email === payload.email
  );
}

export function canManageAdminSettings(
  roles: readonly string[],
  permissions: readonly string[],
  propertyId: string | null,
): boolean {
  return (
    Boolean(propertyId) &&
    roles.some((role) => SETTINGS_ROLES.has(role)) &&
    permissions.includes("property.manage")
  );
}

export function settingsResponseMatchesScope(
  responsePropertyId: string,
  activePropertyId: string | null,
): boolean {
  return Boolean(activePropertyId) && responsePropertyId === activePropertyId;
}

export function runSettingsSubmissionOnce<T>(
  active: { current: ActiveSettingsSubmission<T> | null },
  fingerprint: string,
  requester: () => Promise<T>,
): Promise<T> {
  if (active.current) {
    if (active.current.fingerprint === fingerprint) return active.current.promise;
    return Promise.reject(new Error("SETTINGS_SUBMISSION_IN_PROGRESS"));
  }

  const submission: ActiveSettingsSubmission<T> = {
    fingerprint,
    promise: Promise.resolve(undefined as T),
  };
  submission.promise = requester().finally(() => {
    if (active.current === submission) active.current = null;
  });
  active.current = submission;
  return submission.promise;
}

export async function requestAdminPropertyProfile(
  requester: SettingsRequester,
  propertyId: string,
  signal?: AbortSignal,
): Promise<AdminPropertyProfile> {
  const response = await requester.get(`/properties/${encodeURIComponent(propertyId)}`, {
    signal,
  });
  return parseAdminPropertyProfile(response, propertyId);
}

export async function updateAdminPropertyProfile(
  requester: SettingsRequester,
  propertyId: string,
  draft: AdminPropertyProfileDraft,
  signal?: AbortSignal,
): Promise<AdminPropertyProfile> {
  const response = await requester.patch(
    `/properties/${encodeURIComponent(propertyId)}`,
    toAdminPropertyProfilePayload(draft),
    { signal },
  );
  return parseAdminPropertyProfile(response, propertyId);
}

export async function requestPersonalNotificationPreference(
  requester: SettingsRequester,
  signal?: AbortSignal,
): Promise<PersonalNotificationPreference> {
  return parsePersonalNotificationPreference(
    await requester.get("/my/notification-preferences", { signal }),
  );
}

export async function updatePersonalNotificationPreference(
  requester: SettingsRequester,
  emailEnabled: boolean,
  signal?: AbortSignal,
): Promise<PersonalNotificationPreference> {
  return parsePersonalNotificationPreference(
    await requester.patch(
      "/my/notification-preferences",
      { email_enabled: emailEnabled },
      { signal },
    ),
  );
}
