import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  parseResidentAccountReceipt,
  parseResidentAccountSummary,
  parseResidentDetail,
  parseResidentPage,
  parseResidentPasswordResetReceipt,
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
    rent_payment_status: "none",
    contract_settlement_stage: "none",
    contract_settlement_due_date: null,
    contract_settlement_remaining_amount: 0,
    contract_settlement_checkpoint_required_amount: 0,
    lease_expired_admin_action_required: false,
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
    archive_reason: null,
    archive_source: null,
    archived_at: null,
    archived_by_user_id: null,
    archived_by_name: null,
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
  assert.equal(parsed.data[0].rentPaymentStatus, "none");
  assert.equal(parsed.data[0].leaseExpiredAdminActionRequired, false);

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
    {
      data: [{ ...listItem(), rent_payment_status: "security_deposit" }],
      meta: { limit: 20, offset: 0, total: 1 },
    },
    {
      data: [{ ...listItem(), contract_settlement_stage: "unrecognized" }],
      meta: { limit: 20, offset: 0, total: 1 },
    },
  ]) {
    assert.throws(() => parseResidentPage(invalid, PROPERTY_ID));
  }
});

test("resident lifecycle parser preserves archive, refund, and operational-exception states", () => {
  const archived = parseResidentPage(
    {
      data: [
        {
          ...listItem(),
          resident_status: "archived",
          rent_payment_status: "reversed_refunded",
          contract_settlement_stage: "preactivation_cancelled",
        },
      ],
      meta: { limit: 20, offset: 0, total: 1 },
    },
    PROPERTY_ID,
  );
  assert.equal(archived.data[0].residentStatus, "archived");
  assert.equal(archived.data[0].rentPaymentStatus, "reversed_refunded");
  assert.equal(archived.data[0].contractSettlementStage, "preactivation_cancelled");

  const historicalDetail = parseResidentDetail(
    {
      data: {
        ...detail(),
        resident_status: "archived",
        archive_reason: "Dibatalkan Pra-Aktivasi",
        archive_source: "pre_activation_cancellation",
        archived_at: "2026-08-29T08:00:00.000+07:00",
        archived_by_user_id: ID,
        archived_by_name: "Admin Kostation",
      },
    },
    PROPERTY_ID,
  );
  assert.equal(historicalDetail.archiveReason, "Dibatalkan Pra-Aktivasi");
  assert.equal(historicalDetail.archivedByName, "Admin Kostation");
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

test("resident credential parsers expose login identity without accepting stored secrets", () => {
  assert.deepEqual(
    parseResidentAccountSummary({
      data: {
        status: "active",
        login_email: "resident@example.test",
        login_phone: "6281111111111",
        password_change_required: true,
      },
    }),
    {
      status: "active",
      loginEmail: "resident@example.test",
      loginPhone: "6281111111111",
      passwordChangeRequired: true,
    },
  );

  assert.deepEqual(
    parseResidentPasswordResetReceipt({
      data: {
        status: "active",
        login_email: "resident@example.test",
        login_phone: "6281111111111",
        password_change_required: true,
        temporary_password: "Kostation2026",
      },
    }),
    {
      status: "active",
      loginEmail: "resident@example.test",
      loginPhone: "6281111111111",
      passwordChangeRequired: true,
      temporaryPassword: "Kostation2026",
    },
  );

  assert.throws(() =>
    parseResidentAccountSummary({
      data: {
        status: "active",
        login_email: "resident@example.test",
        login_phone: null,
        password_change_required: false,
        password: "must-not-pass",
      },
    }),
  );
  assert.throws(() =>
    parseResidentPasswordResetReceipt({
      data: {
        status: "active",
        login_email: "resident@example.test",
        login_phone: null,
        password_change_required: true,
        temporary_password: null,
      },
    }),
  );
});

test("Admin workspace freezes operational columns, scoped pagination, and the resident lease hub boundary", () => {
  const route = readFileSync(resolve(root, "routes/tenants.tsx"), "utf8");
  const listHook = readFileSync(resolve(root, "hooks/useResidents.ts"), "utf8");
  const mutationHook = readFileSync(resolve(root, "hooks/useResidentMutations.ts"), "utf8");
  const detailWorkspace = readFileSync(
    resolve(root, "components/residents/ResidentDetailWorkspace.tsx"),
    "utf8",
  );
  for (const label of [
    "Nama Penghuni",
    "No Unit",
    "Universitas",
    "Durasi Sewa",
    "Status Pembayaran",
    "Tahap Pelunasan",
    "Status Penghuni",
    "Aksi",
  ]) {
    assert.match(route, new RegExp(label.replace("/", "\\/")));
  }
  assert.match(listHook, /property_id: currentPropertyId/);
  assert.match(listHook, /limit: filters\.limit \?\? 20/);
  assert.match(listHook, /offset: filters\.offset \?\? 0/);
  assert.match(listHook, /placeholderData:\s*keepPreviousData/);
  assert.match(listHook, /rent_payment_status: filters\.rentPaymentStatus/);
  assert.match(listHook, /contract_settlement_stage: filters\.settlementStage/);
  assert.match(listHook, /settlement_due_within_days: filters\.settlementDueWithinDays/);
  assert.match(listHook, /lease_end_within_days: filters\.leaseEndWithinDays/);
  assert.doesNotMatch(route, /Pantau tenggat/);
  assert.doesNotMatch(route, /Pilih sasaran dan jangka waktu pemantauan/);
  assert.match(route, /Tenggat checkpoint pembayaran/);
  assert.match(route, /Akhir masa sewa/);
  assert.match(route, /DEADLINE_DAY_OPTIONS/);
  assert.match(route, /Tenggat maksimal \(hari\)/);
  assert.match(route, /aria-label=\{`\$\{days\} hari`\}/);
  assert.match(route, /title=\{`\$\{days\} hari`\}/);
  assert.match(route, /Booking fee/);
  assert.match(route, /DP \/ uang muka/);
  assert.match(route, /Outstanding/);
  assert.match(route, /Sisa: \{formatIDR\(resident\.contractSettlementRemainingAmount\)\}/);
  assert.match(route, /Lunas/);
  assert.match(route, /createFileRoute\("\/tenants"\)/);
  assert.match(route, /routeId === "\/tenants\/\$residentId"/);
  assert.match(route, /<Outlet \/>/);
  assert.match(route, /<LeaseCreatePage/);
  assert.match(route, /to="\/tenants" search=\{\{ flow: "new-lease" \}\}/);
  assert.match(mutationHook, /idempotencyKey/);
  const accountRegion = mutationHook.slice(
    mutationHook.indexOf("export function useProvisionResidentAccount"),
  );
  assert.match(accountRegion, /propertyRef\.current !== propertyId/);
  assert.match(accountRegion, /pendingRef\.current/);
  assert.match(accountRegion, /\["residents", "detail", \{ propertyId, residentId \}\]/);
  assert.match(mutationHook, /export function useResidentAccountSummary/);
  assert.match(mutationHook, /export function useResetResidentPassword/);
  assert.match(detailWorkspace, /Lihat kredensial penghuni/);
  assert.match(detailWorkspace, /Reset password/);
  assert.match(detailWorkspace, /Kirim ke WhatsApp/);
  assert.match(detailWorkspace, /setTemporaryPassword\(null\)/);
  assert.doesNotMatch(route, /password_hash|access_token|userId\}/);
  assert.doesNotMatch(detailWorkspace, /password_hash|access_token/);
});

test("Penghuni keeps resident-only shell and canonical self-context authority", () => {
  const rootRoute = readFileSync(resolve(root, "../../penghuni/src/routes/__root.tsx"), "utf8");
  const context = readFileSync(resolve(root, "../../penghuni/src/lib/resident-context.ts"), "utf8");
  const authGuard = readFileSync(
    resolve(root, "../../penghuni/src/lib/auth/AuthGuard.tsx"),
    "utf8",
  );
  const passwordChange = readFileSync(
    resolve(root, "../../penghuni/src/lib/auth/FirstLoginPasswordChange.tsx"),
    "utf8",
  );
  assert.match(rootRoute, /roles=\{\["resident"\]\}/);
  assert.match(rootRoute, /new Set<string>\(\["\/login", "\/kamar"\]\)/);
  assert.match(context, /RESIDENT_CONTEXT_PATH = "\/my\/resident-context"/);
  assert.match(context, /qk\.penghuni\.residentContext\(accountId\)/);
  assert.doesNotMatch(context, /invoice.*fallback|LIMIT 1/i);
  assert.match(authGuard, /user\?\.passwordChangeRequired === true/);
  assert.match(authGuard, /user\?\.password_change_required === true/);
  assert.match(authGuard, /<FirstLoginPasswordChange \/>/);
  assert.match(passwordChange, /useChangePassword/);
  assert.match(passwordChange, /logout\(\)/);
  assert.match(passwordChange, /window\.location\.assign\("\/login"\)/);
  assert.doesNotMatch(passwordChange, /Kostation2026/);
});
