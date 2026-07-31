import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  parseResidentAccountReceipt,
  parseResidentDetail,
  parseResidentPage,
} from "./admin-resident";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ID = "11111111-1111-4111-8111-111111111111";
const PROPERTY_ID = "22222222-2222-4222-8222-222222222222";

function listItem() {
  return {
    id: ID,
    property_id: PROPERTY_ID,
    full_name: "Resident Demo",
    university: "Universitas Demo",
    room_number: null,
    lease_start: null,
    lease_end: null,
    lease_authority_count: 0,
    account_status: "not_provisioned",
    resident_status: "active",
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
  };
}

function detail() {
  return {
    id: ID,
    property_id: PROPERTY_ID,
    user_id: null,
    full_name: "Resident Demo",
    phone: "6281111111111",
    email: "resident@example.test",
    gender: "female",
    account_status: "not_provisioned",
    resident_status: "active",
    active_lease: null,
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
    ktp_number: null,
    date_of_birth: null,
    place_of_birth: null,
    address: null,
    university: "Universitas Demo",
    faculty: null,
    major: null,
    cohort: null,
    instagram: null,
    parent_name: null,
    parent_phone: null,
    marital_status: null,
    emergency_phone: null,
    emergency_contacts: [],
    ktp_document: null,
    profile_photo_file_id: null,
  };
}

test("resident list parser preserves exact property-scoped pagination without list PII", () => {
  const parsed = parseResidentPage(
    {
      data: [listItem()],
      meta: { limit: 20, offset: 0, total: 163 },
    },
    PROPERTY_ID,
  );
  assert.equal(parsed.meta.total, 163);
  assert.equal(parsed.data[0].propertyId, PROPERTY_ID);
  assert.equal(parsed.data[0].roomNumber, null);
  assert.equal("phone" in parsed.data[0], false);
  assert.equal("email" in parsed.data[0], false);
  assert.equal("ktpNumber" in parsed.data[0], false);

  for (const invalid of [
    { data: [listItem()], meta: { limit: 20, offset: 0 } },
    {
      data: [{ ...listItem(), property_id: "cross-property", extra: true }],
      meta: { limit: 20, offset: 0, total: 1 },
    },
    {
      data: [{ ...listItem(), lease_authority_count: -1 }],
      meta: { limit: 20, offset: 0, total: 1 },
    },
  ]) {
    assert.throws(() => parseResidentPage(invalid, PROPERTY_ID));
  }
});

test("resident detail parser accepts full identity authority and rejects password, token or unknown fields", () => {
  const parsed = parseResidentDetail({ data: detail() }, PROPERTY_ID);
  assert.equal(parsed.fullName, "Resident Demo");
  assert.equal(parsed.university, "Universitas Demo");
  assert.equal(parsed.userId, null);

  assert.throws(() =>
    parseResidentDetail({ data: detail() }, "33333333-3333-4333-8333-333333333333"),
  );
  for (const value of [
    "July 31, 2026",
    "2026-07-31",
    "2026-02-30T00:00:00.000Z",
    "2026-07-31T00:00:00.000Z trailing",
  ]) {
    assert.throws(() =>
      parseResidentPage(
        { data: [{ ...listItem(), created_at: value }], meta: { limit: 20, offset: 0, total: 1 } },
        PROPERTY_ID,
      ),
    );
  }

  for (const forbidden of ["password", "password_hash", "access_token", "raw_audit", "metadata"]) {
    assert.throws(() =>
      parseResidentDetail({ data: { ...detail(), [forbidden]: "must-not-pass" } }, PROPERTY_ID),
    );
  }
});

test("one-time account receipt requires exact whitelist and never replays credential", () => {
  assert.deepEqual(
    parseResidentAccountReceipt({
      data: { status: "provisioned", temporary_password: "one-time-secret" },
    }),
    { status: "provisioned", temporaryPassword: "one-time-secret" },
  );
  assert.deepEqual(
    parseResidentAccountReceipt({
      data: { status: "already_issued", temporary_password: null },
    }),
    { status: "already_issued", temporaryPassword: null },
  );
  assert.throws(() =>
    parseResidentAccountReceipt({
      data: { status: "already_issued", temporary_password: "replayed-secret" },
    }),
  );
  assert.throws(() =>
    parseResidentAccountReceipt({
      data: { status: "provisioned", temporary_password: "secret", user_id: ID },
    }),
  );
  assert.throws(() =>
    parseResidentAccountReceipt({ data: { status: "provisioned", temporary_password: null } }),
  );
});

test("Admin workspace freezes operational columns, scoped pagination, stable command key and honest W05 boundary", () => {
  const route = readFileSync(resolve(root, "routes/tenants.tsx"), "utf8");
  const listHook = readFileSync(resolve(root, "hooks/useResidents.ts"), "utf8");
  const mutationHook = readFileSync(resolve(root, "hooks/useResidentMutations.ts"), "utf8");
  for (const label of [
    "Nama Penghuni",
    "No Unit",
    "Universitas/Pendidikan",
    "Durasi Sewa",
    "Status Akun",
    "Status Penghuni",
    "Aksi",
  ]) {
    assert.match(route, new RegExp(label.replace("/", "\\/")));
  }
  assert.match(listHook, /property_id: currentPropertyId/);
  assert.match(listHook, /limit: filters\.limit \?\? 20/);
  assert.match(listHook, /offset: filters\.offset \?\? 0/);
  assert.match(route, /setAccountKey\(newIdempotencyKey\(\)\)/);
  assert.match(mutationHook, /idempotencyKey/);
  const accountRegion = mutationHook.slice(
    mutationHook.indexOf("export function useProvisionResidentAccount"),
  );
  assert.doesNotMatch(accountRegion, /useMutation/);
  assert.match(accountRegion, /propertyRef\.current !== propertyId/);
  assert.match(accountRegion, /pendingRef\.current/);
  assert.match(accountRegion, /\["residents", "detail", \{ propertyId, residentId \}\]/);
  assert.match(route, /tampil satu kali/);
  assert.match(route, /Resident dapat disiapkan tanpa dianggap telah menempati kamar/);
  assert.doesNotMatch(route, /password_hash|access_token|userId\}/);
});

test("Penghuni keeps resident-only shell and canonical self-context authority", () => {
  const rootRoute = readFileSync(resolve(root, "../../penghuni/src/routes/__root.tsx"), "utf8");
  const context = readFileSync(resolve(root, "../../penghuni/src/lib/resident-context.ts"), "utf8");
  assert.match(rootRoute, /roles=\{\["resident"\]\}/);
  assert.match(rootRoute, /new Set<string>\(\["\/login", "\/kamar"\]\)/);
  assert.match(context, /RESIDENT_CONTEXT_PATH = "\/my\/resident-context"/);
  assert.match(context, /qk\.penghuni\.residentContext\(accountId\)/);
  assert.doesNotMatch(context, /invoice.*fallback|LIMIT 1/i);
});
