import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  adminPropertyProfileToDraft,
  canManageAdminSettings,
  parseAdminPropertyProfile,
  parsePersonalNotificationPreference,
  profilesEqual,
  reconcileAdminPropertyProfileDraft,
  reconcilePersonalPreferenceDraft,
  requestAdminPropertyProfile,
  requestPersonalNotificationPreference,
  runSettingsSubmissionOnce,
  settingsResponseMatchesScope,
  toAdminPropertyProfilePayload,
  updateAdminPropertyProfile,
  updatePersonalNotificationPreference,
  validateAdminPropertyProfileDraft,
  type ActiveSettingsSubmission,
} from "./admin-settings";
import { adminRouteRegistry, getRouteAccessDecision } from "./admin-route-registry";
import {
  adminUxQueryKeys,
  queryKeyContainsPropertyScope,
  shouldDiscardAccountCache,
} from "./admin-ux-query-keys";

const PROPERTY_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROPERTY_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

const source = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");

function sourceRegion(value: string, start: string, end: string): string {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing source region start: ${start}`);
  assert.notEqual(endIndex, -1, `missing source region end: ${end}`);
  return value.slice(startIndex, endIndex);
}

function assertCurrentSubmissionGuards(hook: string): void {
  const profile = sourceRegion(hook, "const saveProfile", "const savePreference");
  assert.match(
    profile,
    /if\s*\([\s\S]*?!mountedRef\.current[\s\S]*?!settingsResponseMatchesScope\([\s\S]*?\)\s*\)\s*\{\s*throw new Error\("SETTINGS_SCOPE_CHANGED"\)/,
  );
  assert.match(
    profile,
    /queryClient\.setQueryData\([\s\S]*?toastMutationSuccess\("Profil properti berhasil disimpan"\)/,
  );

  const preference = sourceRegion(hook, "const savePreference", "return {");
  assert.match(
    preference,
    /if\s*\(!mountedRef\.current \|\| userRef\.current !== submittedUserId\)\s*\{\s*throw new Error\("SETTINGS_USER_CHANGED"\)/,
  );
  assert.match(
    preference,
    /queryClient\.setQueryData\([\s\S]*?toastMutationSuccess\("Preferensi notifikasi berhasil disimpan"\)/,
  );
}

function propertyWire(overrides: Record<string, unknown> = {}) {
  return {
    id: PROPERTY_ID,
    name: "Kost Demo",
    address: "Jalan Demo 1",
    phone: null,
    email: "operator@example.test",
    timezone: "Asia/Jakarta",
    status: "active",
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    ...overrides,
  };
}

function preferenceWire(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email_enabled: true,
    whatsapp_enabled: false,
    push_enabled: false,
    digest_mode: false,
    quiet_hours_start: null,
    quiet_hours_end: null,
    created_at: "2026-07-29T00:00:00.000Z",
    updated_at: "2026-07-29T00:00:00.000Z",
    ...overrides,
  };
}

test("strict parsers validate scope and expose only the settings UI whitelist", () => {
  const property = parseAdminPropertyProfile(propertyWire(), PROPERTY_ID);
  assert.deepEqual(property, {
    propertyId: PROPERTY_ID,
    name: "Kost Demo",
    address: "Jalan Demo 1",
    phone: null,
    email: "operator@example.test",
  });
  assert.deepEqual(Object.keys(property).sort(), [
    "address",
    "email",
    "name",
    "phone",
    "propertyId",
  ]);

  const preference = parsePersonalNotificationPreference(preferenceWire());
  assert.deepEqual(preference, { emailEnabled: true });
  assert.deepEqual(Object.keys(preference), ["emailEnabled"]);
  assert.deepEqual(parsePersonalNotificationPreference(preferenceWire({ id: "" })), {
    emailEnabled: true,
  });

  assert.throws(() =>
    parseAdminPropertyProfile(propertyWire({ id: OTHER_PROPERTY_ID }), PROPERTY_ID),
  );
  assert.throws(() => parseAdminPropertyProfile(propertyWire({ name: "" }), PROPERTY_ID));
  assert.throws(() => parseAdminPropertyProfile(propertyWire({ address: null }), PROPERTY_ID));
  assert.throws(() => parseAdminPropertyProfile(propertyWire({ phone: 62 }), PROPERTY_ID));
  assert.throws(() => parseAdminPropertyProfile(propertyWire({ email: false }), PROPERTY_ID));
  assert.throws(() => parseAdminPropertyProfile(propertyWire({ email: "invalid" }), PROPERTY_ID));
  assert.throws(() => parseAdminPropertyProfile({ data: propertyWire() }, PROPERTY_ID));
  assert.throws(() =>
    parseAdminPropertyProfile(propertyWire({ settings: { internal: true } }), PROPERTY_ID),
  );
  assert.throws(() => parsePersonalNotificationPreference(preferenceWire({ id: "not-a-uuid" })));
  assert.throws(() =>
    parsePersonalNotificationPreference(preferenceWire({ email_enabled: "true" })),
  );
  for (const malformed of [
    { whatsapp_enabled: "false" },
    { push_enabled: 1 },
    { digest_mode: "immediate" },
    { quiet_hours_start: 22 },
    { quiet_hours_end: "25:00" },
    { created_at: null },
    { updated_at: { internal: true } },
    { token: "must-not-be-accepted" },
  ]) {
    assert.throws(() => parsePersonalNotificationPreference(preferenceWire(malformed)));
  }
});

test("requesters use exact authenticated paths and minimal PATCH bodies", async () => {
  const calls: Array<{ method: string; path: string; body?: unknown; signal?: AbortSignal }> = [];
  const signal = new AbortController().signal;
  const requester = {
    get: async (path: string, options?: { signal?: AbortSignal }) => {
      calls.push({ method: "GET", path, signal: options?.signal });
      return path.startsWith("/properties/") ? propertyWire() : preferenceWire();
    },
    patch: async (path: string, body: unknown, options?: { signal?: AbortSignal }) => {
      calls.push({ method: "PATCH", path, body, signal: options?.signal });
      return path.startsWith("/properties/")
        ? propertyWire(body as Record<string, unknown>)
        : preferenceWire(body as Record<string, unknown>);
    },
  };

  await requestAdminPropertyProfile(requester, PROPERTY_ID, signal);
  await updateAdminPropertyProfile(
    requester,
    PROPERTY_ID,
    {
      name: " Kost Baru ",
      address: " Jalan Baru ",
      phone: " ",
      email: " admin@example.test ",
    },
    signal,
  );
  await requestPersonalNotificationPreference(requester, signal);
  await updatePersonalNotificationPreference(requester, false, signal);

  assert.deepEqual(calls, [
    { method: "GET", path: `/properties/${PROPERTY_ID}`, signal },
    {
      method: "PATCH",
      path: `/properties/${PROPERTY_ID}`,
      body: {
        name: "Kost Baru",
        address: "Jalan Baru",
        phone: null,
        email: "admin@example.test",
      },
      signal,
    },
    { method: "GET", path: "/my/notification-preferences", signal },
    {
      method: "PATCH",
      path: "/my/notification-preferences",
      body: { email_enabled: false },
      signal,
    },
  ]);
});

test("profile validation, canonicalization, dirty state, and access fail closed", () => {
  const draft = {
    name: " Kost Baru ",
    address: " Jalan Baru ",
    phone: " ",
    email: " admin@example.test ",
  };
  assert.deepEqual(toAdminPropertyProfilePayload(draft), {
    name: "Kost Baru",
    address: "Jalan Baru",
    phone: null,
    email: "admin@example.test",
  });
  assert.deepEqual(validateAdminPropertyProfileDraft(draft), {});
  assert.equal(
    profilesEqual(
      {
        propertyId: PROPERTY_ID,
        name: "Kost Baru",
        address: "Jalan Baru",
        phone: null,
        email: "admin@example.test",
      },
      draft,
    ),
    true,
  );
  assert.deepEqual(validateAdminPropertyProfileDraft({ ...draft, name: " " }), {
    name: "Nama properti wajib diisi.",
  });
  assert.ok(validateAdminPropertyProfileDraft({ ...draft, email: "invalid" }).email);

  for (const role of ["owner", "manager"]) {
    assert.equal(canManageAdminSettings([role], ["property.manage"], PROPERTY_ID), true);
  }
  for (const roles of [["admin"], ["property_owner"], ["resident"], []]) {
    assert.equal(canManageAdminSettings(roles, ["property.manage"], PROPERTY_ID), false);
  }
  assert.equal(canManageAdminSettings(["owner"], [], PROPERTY_ID), false);
  assert.equal(canManageAdminSettings(["manager"], ["property.manage"], null), false);
});

test("query keys isolate property profile while personal preference is user scoped", () => {
  assert.deepEqual(adminUxQueryKeys.settings.profile(PROPERTY_ID), [
    "settings",
    "property",
    PROPERTY_ID,
  ]);
  assert.deepEqual(adminUxQueryKeys.settings.preference(USER_ID), [
    "settings",
    "preference",
    USER_ID,
  ]);
  assert.notDeepEqual(
    adminUxQueryKeys.settings.profile(PROPERTY_ID),
    adminUxQueryKeys.settings.profile(OTHER_PROPERTY_ID),
  );
  assert.equal(
    JSON.stringify(adminUxQueryKeys.settings.preference(USER_ID)).includes(PROPERTY_ID),
    false,
  );

  const queryClient = new QueryClient();
  const otherUserId = "55555555-5555-4555-8555-555555555555";
  queryClient.setQueryData(adminUxQueryKeys.settings.profile(PROPERTY_ID), "property-a");
  queryClient.setQueryData(adminUxQueryKeys.settings.profile(OTHER_PROPERTY_ID), "property-b");
  queryClient.setQueryData(adminUxQueryKeys.settings.preference(USER_ID), "user-a");
  queryClient.setQueryData(["global", "reference"], "global");
  queryClient.removeQueries({
    predicate: (query) => queryKeyContainsPropertyScope(query.queryKey, PROPERTY_ID),
  });
  assert.equal(queryClient.getQueryData(adminUxQueryKeys.settings.profile(PROPERTY_ID)), undefined);
  assert.equal(
    queryClient.getQueryData(adminUxQueryKeys.settings.profile(OTHER_PROPERTY_ID)),
    "property-b",
  );
  assert.equal(queryClient.getQueryData(adminUxQueryKeys.settings.preference(USER_ID)), "user-a");
  assert.equal(queryClient.getQueryData(["global", "reference"]), "global");

  assert.equal(shouldDiscardAccountCache(USER_ID, USER_ID), false);
  assert.equal(shouldDiscardAccountCache(null, USER_ID), false);
  assert.equal(shouldDiscardAccountCache(USER_ID, otherUserId), true);
  assert.equal(shouldDiscardAccountCache(USER_ID, null), true);
});

test("authoritative snapshots preserve dirty forms and replace clean or changed scopes", () => {
  const profileA = parseAdminPropertyProfile(propertyWire(), PROPERTY_ID);
  const changedProfileA = parseAdminPropertyProfile(
    propertyWire({ name: "Kost Refetch" }),
    PROPERTY_ID,
  );
  const profileB = parseAdminPropertyProfile(
    propertyWire({ id: OTHER_PROPERTY_ID, name: "Kost B" }),
    OTHER_PROPERTY_ID,
  );
  const cleanDraft = adminPropertyProfileToDraft(profileA);
  const dirtyDraft = { ...cleanDraft, name: "Draft Operator" };

  assert.deepEqual(
    reconcileAdminPropertyProfileDraft(profileA, cleanDraft, changedProfileA),
    adminPropertyProfileToDraft(changedProfileA),
  );
  assert.equal(
    reconcileAdminPropertyProfileDraft(profileA, dirtyDraft, changedProfileA),
    dirtyDraft,
  );
  assert.deepEqual(
    reconcileAdminPropertyProfileDraft(profileA, dirtyDraft, profileB),
    adminPropertyProfileToDraft(profileB),
  );

  const preferenceA = {
    accountId: USER_ID,
    preference: { emailEnabled: true },
  };
  const preferenceB = {
    accountId: "55555555-5555-4555-8555-555555555555",
    preference: { emailEnabled: false },
  };
  assert.equal(reconcilePersonalPreferenceDraft(preferenceA, false, preferenceA), false);
  assert.equal(
    reconcilePersonalPreferenceDraft(preferenceA, true, {
      ...preferenceA,
      preference: { emailEnabled: false },
    }),
    false,
  );
  assert.equal(reconcilePersonalPreferenceDraft(preferenceA, true, preferenceB), false);
});

test("synchronous submissions deduplicate one intent and stale completion cannot clear a new scope", async () => {
  let calls = 0;
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  const firstDeferred = new Promise<string>((resolve) => {
    releaseFirst = () => resolve("first");
  });
  const secondDeferred = new Promise<string>((resolve) => {
    releaseSecond = () => resolve("second");
  });
  const active: { current: ActiveSettingsSubmission<string> | null } = { current: null };

  const first = runSettingsSubmissionOnce(active, "property-a", () => {
    calls += 1;
    return firstDeferred;
  });
  const duplicate = runSettingsSubmissionOnce(active, "property-a", () => {
    calls += 1;
    return firstDeferred;
  });
  assert.equal(first, duplicate);
  assert.equal(calls, 1);
  await assert.rejects(
    () => runSettingsSubmissionOnce(active, "property-b", () => firstDeferred),
    /SETTINGS_SUBMISSION_IN_PROGRESS/,
  );

  active.current = null;
  const second = runSettingsSubmissionOnce(active, "property-b", () => {
    calls += 1;
    return secondDeferred;
  });
  releaseFirst();
  await first;
  assert.equal(
    (active.current as ActiveSettingsSubmission<string> | null)?.fingerprint,
    "property-b",
  );
  releaseSecond();
  await second;
  assert.equal(active.current, null);
  assert.equal(calls, 2);

  assert.equal(settingsResponseMatchesScope(PROPERTY_ID, PROPERTY_ID), true);
  assert.equal(settingsResponseMatchesScope(PROPERTY_ID, OTHER_PROPERTY_ID), false);
  assert.equal(settingsResponseMatchesScope(PROPERTY_ID, null), false);
});

test("route, hook, registry, and cache wiring preserve exact authorities", () => {
  const route = source("routes/settings.tsx");
  const hook = source("hooks/useAdminSettings.ts");
  const provider = source("lib/property/PropertyProvider.tsx");

  assert.match(route, /useAdminSettings\(\)/);
  assert.match(route, /<PersistentSettingsPanels/);
  assert.doesNotMatch(route, /Fitur dummy|Upload Logo|defaultValue="Kos Mawar Indah"/);

  const settingsRoute = adminRouteRegistry.find((routeMetadata) => routeMetadata.id === "settings");
  assert.ok(settingsRoute);
  assert.deepEqual(settingsRoute.access.roles, ["owner", "manager"]);
  assert.deepEqual(settingsRoute.access.readCapabilities, ["property.manage"]);
  assert.equal(
    getRouteAccessDecision(settingsRoute, {
      roles: ["owner"],
      permissions: ["property.manage"],
    }),
    "allowed",
  );
  assert.equal(
    getRouteAccessDecision(settingsRoute, {
      roles: ["manager"],
      permissions: ["property.manage"],
    }),
    "allowed",
  );
  for (const role of ["admin", "property_owner", "resident", "technician"] as const) {
    assert.equal(
      getRouteAccessDecision(settingsRoute, {
        roles: [role],
        permissions: ["property.manage"],
      }),
      "forbidden",
    );
  }
  assert.equal(
    getRouteAccessDecision(settingsRoute, { roles: ["owner"], permissions: [] }),
    "forbidden",
  );

  assert.match(hook, /adminUxQueryKeys\.settings\.profile\(propertyId\)/);
  assert.match(hook, /adminUxQueryKeys\.settings\.preference\(userId\)/);
  assert.match(hook, /meta:\s*\{\s*scope:\s*"user"\s*\}/);
  assert.doesNotMatch(hook, /onMutate\s*:/);
  assert.match(hook, /settingsResponseMatchesScope/);
  assert.match(hook, /runSettingsSubmissionOnce/);
  assertCurrentSubmissionGuards(hook);

  assert.match(provider, /discardPropertyScopedCache/);
  assert.match(provider, /queryKeyContainsPropertyScope/);
  assert.match(provider, /useLayoutEffect/);
  assert.match(provider, /discardAllCache/);
  assert.match(provider, /accountRef[\s\S]*?discardAllCache/);
  assert.match(provider, /previousPropertyId[\s\S]*?discardPropertyScopedCache/);

  assert.doesNotMatch(provider, /query\.meta\?\.scope !== "user"/);
});

test("panels preserve order, explicit states, accessible fields, and responsive controls", () => {
  const panels = source("components/settings/PersistentSettingsPanels.tsx");
  const renderedPanels = panels.slice(panels.indexOf("export function PersistentSettingsPanels"));
  const profileIndex = renderedPanels.indexOf("Profil Properti");
  const preferenceIndex = renderedPanels.indexOf("Preferensi Akun");
  const appearanceIndex = renderedPanels.indexOf("<AppearancePanel");
  assert.ok(
    profileIndex >= 0 && profileIndex < preferenceIndex && preferenceIndex < appearanceIndex,
  );

  for (const required of [
    "LoadingState",
    "ErrorState",
    "ForbiddenState",
    'role="alert"',
    "aria-describedby",
    "htmlFor=",
    "aria-label=",
    "min-h-11",
    "min-w-0",
    "max-w-full",
    "grid-cols-1",
    "break-words",
    "Simpan Profil",
    "Simpan Preferensi",
    "Reset",
    "reconcileAdminPropertyProfileDraft",
    "reconcilePersonalPreferenceDraft",
  ]) {
    assert.ok(panels.includes(required), `missing settings UX contract: ${required}`);
  }
  assert.doesNotMatch(panels, /Logo|Upload|Fitur dummy|timezone|billing|rollout|status properti/i);
  assert.doesNotMatch(panels, /useRef\(settings\.profile\)/);
});

test("mutation proofs reject current-page cache, fake persistence, extra payload, and stale success", () => {
  assert.throws(() =>
    parseAdminPropertyProfile(propertyWire({ id: OTHER_PROPERTY_ID, room_count: 99 }), PROPERTY_ID),
  );
  assert.deepEqual(
    Object.keys(
      toAdminPropertyProfilePayload({
        name: "Demo",
        address: "Alamat",
        phone: "",
        email: "",
        timezone: "UTC",
      } as never),
    ).sort(),
    ["address", "email", "name", "phone"],
  );

  const hook = source("hooks/useAdminSettings.ts");
  assert.doesNotMatch(hook, /toast\.success\([^)]*\)[\s\S]*?await\s+update/);
  assert.match(hook, /safeErrorMessage/);
  assert.doesNotMatch(hook, /toastMutationError/);
  assert.match(hook, /!\s*settingsResponseMatchesScope/);
  assert.match(hook, /activeProfileSubmission\.current = null/);
  assert.match(hook, /activePreferenceSubmission\.current = null/);
  assert.throws(() =>
    assertCurrentSubmissionGuards(
      hook.replace("!settingsResponseMatchesScope", "settingsResponseMatchesScope"),
    ),
  );
  assert.throws(() =>
    assertCurrentSubmissionGuards(
      hook.replace("userRef.current !== submittedUserId", "userRef.current === submittedUserId"),
    ),
  );

  const provider = source("lib/property/PropertyProvider.tsx");
  assert.throws(() =>
    assert.match(
      provider.replace("useLayoutEffect(() =>", "useEffect(() =>"),
      /useLayoutEffect\(\(\) =>[\s\S]*?shouldDiscardAccountCache/,
    ),
  );
});
