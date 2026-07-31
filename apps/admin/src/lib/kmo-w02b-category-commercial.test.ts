import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { kostTypeBody, parseKostTypeRecord, type KostTypeInput } from "./admin-ux-master-api";
import {
  assertKostTypePageScope,
  assertKostTypeScope,
  commercialMutationFingerprint,
  invalidateKostTypeCommercial,
  isCommercialScopeMismatch,
  resolveCommercialMutationIntent,
  runCommercialSubmissionOnce,
} from "../hooks/useAdminUxMaster";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const source = (path: string) => readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");

function wire() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    property_id: "22222222-2222-4222-8222-222222222222",
    category: "rukost",
    name: "Rumah Kost",
    slug: "rumah-kost",
    description_short: null,
    description_long: null,
    room_size_label: "3 x 4 m",
    room_size_m2: 12,
    monthly_price: 1_800_000,
    yearly_price: 21_600_000,
    deposit_amount: 1_800_000,
    max_occupants: 1,
    public_visible: true,
    notes: null,
    status: "active",
    deleted_at: null,
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
    commercial: {
      monthly_price: 1_800_000,
      annual_contract_value: 21_600_000,
      minimum_dp_percent: 25,
      minimum_dp_amount: 5_400_000,
      payment_schedules: ["annual", "two_month_installments"],
      security_deposit_months: 1,
      security_deposit_required: 1_800_000,
      effective_date: "2026-08-01",
    },
    future_commercial: null,
  };
}

test("strict category parser preserves a single commercial authority", () => {
  const parsed = parseKostTypeRecord(wire());
  assert.equal(parsed.monthlyPrice, 1_800_000);
  assert.equal(parsed.yearlyPrice, 21_600_000);
  assert.equal(parsed.depositAmount, 1_800_000);
  assert.equal(parsed.commercial?.minimumDpAmount, 5_400_000);
  assert.equal(parsed.commercial?.securityDepositMonths, 1);
  assert.equal(parsed.futureCommercial, null);
  assert.throws(() => parseKostTypeRecord({ ...wire(), extra: true }));
  assert.throws(() =>
    parseKostTypeRecord({
      ...wire(),
      commercial: { ...wire().commercial, security_deposit_required: 1_000_000 },
    }),
  );
  assert.throws(() =>
    parseKostTypeRecord({
      ...wire(),
      future_commercial: {
        ...wire().commercial,
        effective_date: "2026-07-01",
      },
    }),
  );
  assert.throws(() =>
    parseKostTypeRecord({
      ...wire(),
      commercial: { ...wire().commercial, effective_date: "2026-99-99" },
    }),
  );
  assert.throws(() =>
    parseKostTypeRecord({
      ...wire(),
      commercial: { ...wire().commercial, minimum_dp_percent: 30 },
    }),
  );
  assert.throws(() =>
    parseKostTypeRecord({
      ...wire(),
      facilities: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          property_id: wire().property_id,
          category_id: null,
          name: "Kasur",
          icon: null,
          description: null,
          status: "active",
          sort_order: 0,
          raw_metadata: true,
        },
      ],
    }),
  );
  assert.throws(() =>
    parseKostTypeRecord({
      ...wire(),
      rules: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          property_id: "55555555-5555-4555-8555-555555555555",
          kost_type_id: wire().id,
          rule_category: "general",
          icon: null,
          rule_text: "Jaga ketertiban",
          is_allowed: true,
          sort_order: 0,
        },
      ],
    }),
  );
});

test("requester writes policy rules and never sends a raw deposit override", () => {
  const input: KostTypeInput = {
    propertyId: "22222222-2222-4222-8222-222222222222",
    category: "apartkost",
    name: "Apart Kost",
    slug: "apart-kost",
    monthlyPrice: 1_800_000,
    yearlyPrice: 21_600_000,
    effectiveDate: "2026-09-01",
    securityDepositMonths: 1,
    paymentSchedules: ["annual", "two_month_installments"],
  };
  assert.deepEqual(kostTypeBody(input), {
    property_id: input.propertyId,
    category: input.category,
    name: input.name,
    slug: input.slug,
    description_short: undefined,
    description_long: undefined,
    room_size_label: undefined,
    room_size_m2: undefined,
    monthly_price: 1_800_000,
    yearly_price: 21_600_000,
    effective_date: "2026-09-01",
    payment_schedules: ["annual", "two_month_installments"],
    security_deposit_months: 1,
    public_visible: undefined,
    notes: undefined,
    status: undefined,
  });
  assert.equal("minimum_dp_percent" in kostTypeBody(input), false);
  assert.equal("deposit_amount" in kostTypeBody(input), false);
});

test("logical retries reuse idempotency, reject concurrent drift, and rotate by property", async () => {
  const firstFingerprint = commercialMutationFingerprint("property-a", { monthlyPrice: 1 });
  const firstIntent = resolveCommercialMutationIntent(null, firstFingerprint, () => "key-a");
  const retry = resolveCommercialMutationIntent(firstIntent, firstFingerprint, () => "key-b");
  const changed = resolveCommercialMutationIntent(
    firstIntent,
    commercialMutationFingerprint("property-b", { monthlyPrice: 1 }),
    () => "key-b",
  );
  assert.equal(retry.idempotencyKey, "key-a");
  assert.equal(changed.idempotencyKey, "key-b");

  let resolveRequest!: (value: string) => void;
  let requestCount = 0;
  const request = new Promise<string>((resolve) => {
    resolveRequest = resolve;
  });
  const active: {
    current: { fingerprint: string; promise: Promise<string> } | null;
  } = { current: null };
  const firstSubmission = runCommercialSubmissionOnce(active, firstFingerprint, () => {
    requestCount += 1;
    return request;
  });
  const duplicate = runCommercialSubmissionOnce(active, firstFingerprint, () => {
    requestCount += 1;
    return request;
  });
  await assert.rejects(() => runCommercialSubmissionOnce(active, "changed-payload", () => request));
  resolveRequest("saved");
  assert.equal(await firstSubmission, "saved");
  assert.equal(await duplicate, "saved");
  assert.equal(requestCount, 1);
});

test("scope checks reject wrong property/category before cache or UI", () => {
  const record = parseKostTypeRecord(wire());
  assert.doesNotThrow(() => assertKostTypeScope(record, wire().property_id, "rukost"));
  assert.throws(
    () => assertKostTypeScope(record, "55555555-5555-4555-8555-555555555555", "rukost"),
    /KOST_TYPE_SCOPE_MISMATCH/,
  );
  assert.throws(
    () => assertKostTypePageScope({ items: [record] }, wire().property_id, "apartkost"),
    /KOST_TYPE_SCOPE_MISMATCH/,
  );
  assert.equal(isCommercialScopeMismatch(new Error("PROPERTY_SCOPE_CHANGED")), true);
  assert.equal(isCommercialScopeMismatch(new Error("KOST_TYPE_SCOPE_MISMATCH")), true);
  assert.equal(isCommercialScopeMismatch(new Error("API_FAILURE")), false);
});

test("commercial invalidation covers every property-scoped consumer", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const queryClient = {
    invalidateQueries: async (options: Record<string, unknown>) => {
      calls.push(options);
    },
  };
  await invalidateKostTypeCommercial(queryClient as never, wire().property_id);
  const keys = calls
    .map((call) => call.queryKey)
    .filter((value): value is unknown[] => Array.isArray(value));
  for (const key of [
    ["kostTypes", wire().property_id],
    ["kostType", wire().property_id],
    ["rooms", wire().property_id],
    ["room", wire().property_id],
    ["roomAvailability", wire().property_id],
    ["dashboard", "summary", wire().property_id],
  ]) {
    assert.ok(keys.some((candidate) => JSON.stringify(candidate) === JSON.stringify(key)));
  }
  const predicate = calls.find((call) => typeof call.predicate === "function")?.predicate as
    | ((query: { queryKey: unknown[] }) => boolean)
    | undefined;
  assert.ok(predicate);
  assert.equal(
    predicate({ queryKey: ["roomDetail", "account-a", wire().property_id, "RK-01"] }),
    true,
  );
  assert.equal(
    predicate({
      queryKey: ["roomDetail", "account-a", "55555555-5555-4555-8555-555555555555", "RK-01"],
    }),
    false,
  );
});

test("category editor is future-effective and room editor stays non-commercial", () => {
  const component = source("apps/admin/src/components/rooms/KostTypeInventoryPage.tsx");
  const roomApi = source("apps/admin/src/lib/admin-ux-master-api.ts");
  assert.match(component, /Tanggal efektif/);
  assert.match(component, /Minimum DP/);
  assert.match(component, /Deposit \(bulan tarif\)/);
  assert.match(component, /Angsuran per dua bulan/);
  assert.match(component, /Tarif aktif saat ini/);
  assert.match(component, /Tarif terjadwal berikutnya/);
  assert.match(component, /Preview:/);
  assert.match(component, /monthlyPrice: authority\?\.monthlyPrice \?\? 1_800_000/);
  assert.match(component, /yearlyPrice: authority\?\.annualContractValue \?\? 21_600_000/);
  assert.match(component, /useKostTypeCommercialMutation/);
  assert.match(component, /propertyId/);
  assert.match(component, /25% dari nilai kontrak/);
  assert.doesNotMatch(component, /set\("minimumDpPercent"/);
  assert.match(component, /setTypeEditor\(null\)/);
  assert.doesNotMatch(
    roomApi,
    /RoomInventoryInput[\s\S]{0,500}(monthlyPrice|depositAmount|facilityIds)/,
  );
});
