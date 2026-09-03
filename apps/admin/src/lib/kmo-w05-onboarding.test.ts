import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  parseAdminOnboarding,
  requestAdminOnboarding,
  type OnboardingPayload,
} from "./admin-onboarding";
import { adminUxV2Requester } from "./admin-ux-api";
import {
  parseLeaseActivation,
  parseLeaseCheckIn,
  requestLeaseActivation,
  requestLeaseCheckIn,
} from "./admin-lease-activation";
import {
  createOnboardingIdempotencyLedger,
  isOnboardingRequestCurrent,
  isOnboardingScopeCurrent,
  onboardingInvalidationKeys,
  separateOnboardingCredential,
  useResidentOnboarding,
} from "../hooks/useResidentOnboarding";
import { PropertyContext } from "./property";

const id = "11111111-1111-4111-8111-111111111111";
const response = {
  data: {
    commitmentId: id,
    status: "committed",
    leaseId: "22222222-2222-4222-8222-222222222222",
    leaseStatus: "awaiting_activation",
    roomNumber: "RK-01-01",
    category: "rukost",
    startDate: "2026-08-01",
    endDate: "2027-07-31",
    termMonths: 12,
    billingCycle: "monthly",
    paymentPlanType: "two_month_installments",
    contractRentAmount: 21600000,
    dpRequiredAmount: 5400000,
    securityDepositRequiredAmount: 0,
    initialPayment: {
      method: "cash",
      status: "verified",
      dpRecordedAmount: 5400000,
      securityDepositRecordedAmount: 1800000,
      dpVerifiedAmount: 5400000,
      securityDepositVerifiedAmount: 1800000,
      receipts: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          purpose: "dp",
          amount: 5400000,
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          purpose: "security_deposit",
          amount: 1800000,
        },
      ],
    },
    temporaryPassword: "one-time",
  },
};
const payload: OnboardingPayload = {
  property_id: id,
  visitor_name: "Resident",
  visitor_phone: "081111111111",
  gender: "female",
  start_date: "2026-08-01",
  term_months: 12,
  billing_cycle: "monthly",
  payment_plan_type: "two_month_installments",
  accepted_terms_version: "W05-v1",
  dp_verified_amount: 5400000,
  security_deposit_funded_amount: 1800000,
  payment_method: "cash",
};

type OnboardingMutation = ReturnType<typeof useResidentOnboarding>;

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function waitFor(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (check()) return;
    await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
  }
  assert.fail("Timed out waiting for hook mutation lifecycle");
}

function renderOnboardingHook(receipt: (password: string | null) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  let mutation: OnboardingMutation | null = null;
  function CaptureHook() {
    mutation = useResidentOnboarding(receipt);
    return null;
  }
  renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        PropertyContext.Provider,
        {
          value: {
            currentPropertyId: id,
            availableProperties: [{ id }],
            setCurrentPropertyId: () => undefined,
          },
        },
        createElement(CaptureHook),
      ),
    ),
  );
  assert.ok(mutation);
  return { mutation: mutation as OnboardingMutation, queryClient };
}

function cachedMutationData(queryClient: QueryClient): unknown[] {
  return queryClient
    .getMutationCache()
    .getAll()
    .map((entry) => entry.state.data);
}

test("strict onboarding response parser and one-time credential boundary", () => {
  const parsed = parseAdminOnboarding(response);
  assert.equal(parsed.roomNumber, "RK-01-01");
  assert.equal(parsed.initialPayment.receipts.length, 2);
  assert.equal(
    parseAdminOnboarding({
      ...response,
      data: {
        ...response.data,
        termMonths: 3,
        endDate: "2026-10-31",
        contractRentAmount: 5400000,
        dpRequiredAmount: 1350000,
        initialPayment: {
          ...response.data.initialPayment,
          dpRecordedAmount: 1350000,
          dpVerifiedAmount: 1350000,
        },
      },
    }).termMonths,
    3,
  );
  assert.throws(() =>
    parseAdminOnboarding({
      ...response,
      data: {
        ...response.data,
        termMonths: 121,
      },
    }),
  );
  assert.throws(() =>
    parseAdminOnboarding({ ...response, data: { ...response.data, roomId: id } }),
  );
  assert.throws(() =>
    parseAdminOnboarding({
      ...response,
      data: {
        ...response.data,
        initialPayment: { ...response.data.initialPayment, status: "pending" },
      },
    }),
  );
  assert.throws(() =>
    parseAdminOnboarding({
      ...response,
      data: {
        ...response.data,
        initialPayment: { ...response.data.initialPayment, securityDepositRecordedAmount: -1 },
      },
    }),
  );
  assert.throws(() =>
    parseAdminOnboarding({
      ...response,
      data: {
        ...response.data,
        initialPayment: {
          ...response.data.initialPayment,
          receipts: [{ id: "not-a-uuid", purpose: "dp", amount: 1 }],
        },
      },
    }),
  );
});
test("request uses stable idempotency and no lifecycle shortcut", async () => {
  const calls: Array<{
    path: string;
    body: OnboardingPayload;
    options: { idempotencyKey: string };
  }> = [];
  const result = await requestAdminOnboarding(
    async (path, body, options) => {
      calls.push({ path, body, options });
      return response;
    },
    payload,
    "w05-idempotency-key-0001",
  );
  assert.equal(calls[0].path, "/residents/onboard");
  assert.equal(calls[0].options.idempotencyKey, "w05-idempotency-key-0001");
  assert.equal(result.leaseStatus, "awaiting_activation");
});

test("activation stays a separate explicit command with an exact response envelope", async () => {
  const leaseId = "22222222-2222-4222-8222-222222222222";
  const calls: Array<{ path: string; body: object; key: string }> = [];
  const result = await requestLeaseActivation(
    async (path, body, options) => {
      calls.push({ path, body, key: options.idempotencyKey });
      return {
        data: {
          leaseId,
          leaseStatus: "active",
          occupancyStatus: "awaiting_check_in",
          roomNumber: "RK-01-01",
        },
      };
    },
    leaseId,
    id,
    "w05-activation-key-0001",
  );
  assert.equal(result.leaseStatus, "active");
  assert.equal(result.occupancyStatus, "awaiting_check_in");
  assert.equal(calls[0].path, `/leases/${leaseId}/activate`);
  assert.deepEqual(calls[0].body, { property_id: id });
  assert.equal(calls[0].key, "w05-activation-key-0001");
  assert.throws(() => parseLeaseActivation({ data: { leaseId, leaseStatus: "active" } }));
});

test("physical check-in is a separate exact command that creates occupancy", async () => {
  const leaseId = "22222222-2222-4222-8222-222222222222";
  const occupancyId = "33333333-3333-4333-8333-333333333333";
  const calls: Array<{ path: string; body: object; key: string }> = [];
  const result = await requestLeaseCheckIn(
    async (path, body, options) => {
      calls.push({ path, body, key: options.idempotencyKey });
      return {
        data: {
          leaseId,
          occupancyId,
          occupancyStatus: "active",
          roomStatus: "occupied",
          checkedInAt: "2026-08-29T03:00:00.000Z",
        },
      };
    },
    leaseId,
    id,
    "w05-check-in-key-0001",
  );
  assert.equal(result.occupancyId, occupancyId);
  assert.equal(calls[0].path, `/leases/${leaseId}/check-in`);
  assert.deepEqual(calls[0].body, { property_id: id });
  assert.equal(calls[0].key, "w05-check-in-key-0001");
  assert.throws(() =>
    parseLeaseCheckIn({
      data: {
        leaseId,
        occupancyId,
        occupancyStatus: "active",
        roomStatus: "awaiting_check_in",
        checkedInAt: "2026-08-29T03:00:00.000Z",
      },
    }),
  );
});

test("credential is separated before mutation cache while receipt remains available once", () => {
  const parsed = parseAdminOnboarding(response);
  const separated = separateOnboardingCredential(parsed);
  assert.equal(separated.temporaryPassword, "one-time");
  assert.equal("temporaryPassword" in separated.safeResponse, false);
  assert.equal(JSON.stringify(separated.safeResponse).includes("one-time"), false);
});

test("live onboarding hook keeps credentials outside mutation cache and reuses logical retry key", async () => {
  const receipts: Array<string | null> = [];
  const keys: string[] = [];
  let requestCount = 0;
  const originalPost = adminUxV2Requester.post;
  adminUxV2Requester.post = (async (_path, _body, options) => {
    keys.push(options?.idempotencyKey ?? "");
    requestCount += 1;
    return {
      ...response,
      data: {
        ...response.data,
        temporaryPassword: requestCount === 1 ? "one-time" : null,
      },
    };
  }) as typeof adminUxV2Requester.post;
  const { mutation, queryClient } = renderOnboardingHook((password) => receipts.push(password));

  try {
    const first = await mutation.mutateAsync(payload);
    const retry = await mutation.mutateAsync({ ...payload });

    assert.equal("temporaryPassword" in first, false);
    assert.equal("temporaryPassword" in retry, false);
    assert.deepEqual(
      receipts.filter((value): value is string => value !== null),
      ["one-time"],
    );
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
    for (const data of cachedMutationData(queryClient)) {
      assert.equal(JSON.stringify(data).includes("one-time"), false);
      if (data && typeof data === "object") assert.equal("temporaryPassword" in data, false);
    }
  } finally {
    adminUxV2Requester.post = originalPost;
    queryClient.clear();
  }
});

test("live onboarding hook rejects a superseded response before receipt or cache effects", async () => {
  const receipts: Array<string | null> = [];
  const invalidations: unknown[] = [];
  const requests: Array<ReturnType<typeof deferred<unknown>>> = [];
  const originalPost = adminUxV2Requester.post;
  adminUxV2Requester.post = (() => {
    const request = deferred<unknown>();
    requests.push(request);
    return request.promise;
  }) as typeof adminUxV2Requester.post;
  const { mutation, queryClient } = renderOnboardingHook((password) => receipts.push(password));
  queryClient.invalidateQueries = ((filters) => {
    invalidations.push(filters?.queryKey);
    return Promise.resolve();
  }) as typeof queryClient.invalidateQueries;

  try {
    const staleResult = mutation.mutateAsync(payload);
    await waitFor(() => requests.length === 1);
    const currentResult = mutation.mutateAsync({ ...payload });
    await waitFor(() => requests.length === 2);

    requests[0]!.resolve(response);
    await assert.rejects(staleResult, /PROPERTY_SCOPE_CHANGED/);
    assert.equal(
      receipts.every((value) => value === null),
      true,
    );
    assert.deepEqual(invalidations, []);
    assert.equal(cachedMutationData(queryClient)[0], undefined);

    requests[1]!.resolve({
      ...response,
      data: { ...response.data, temporaryPassword: null },
    });
    const accepted = await currentResult;
    assert.equal("temporaryPassword" in accepted, false);
    assert.equal(
      receipts.every((value) => value === null),
      true,
    );
    assert.equal(invalidations.length, 6);
  } finally {
    adminUxV2Requester.post = originalPost;
    queryClient.clear();
  }
});

test("idempotency key is stable per logical payload and rotates on payload or scope change", () => {
  let sequence = 0;
  const ledger = createOnboardingIdempotencyLedger(() => `key-${++sequence}`);
  const first = ledger.keyFor(payload);
  assert.equal(ledger.keyFor({ ...payload }), first);
  const changedPayload = ledger.keyFor({ ...payload, dp_verified_amount: 5_400_001 });
  assert.notEqual(changedPayload, first);
  const changedScope = ledger.keyFor({
    ...payload,
    property_id: "99999999-9999-4999-8999-999999999999",
  });
  assert.notEqual(changedScope, changedPayload);
  ledger.reset();
  assert.notEqual(ledger.keyFor(payload), first);
});

test("stale scope is rejected and invalidation remains property-scoped", () => {
  assert.equal(isOnboardingScopeCurrent(id, id), true);
  assert.equal(isOnboardingScopeCurrent(id, null), false);
  assert.equal(isOnboardingScopeCurrent(id, "99999999-9999-4999-8999-999999999999"), false);
  assert.equal(isOnboardingRequestCurrent(3, 3, id, id), true);
  assert.equal(isOnboardingRequestCurrent(2, 3, id, id), false);
  assert.equal(isOnboardingRequestCurrent(3, 3, id, "99999999-9999-4999-8999-999999999999"), false);
  const keys = onboardingInvalidationKeys(id);
  assert.equal(keys.length, 6);
  for (const key of keys) assert.equal(JSON.stringify(key).includes(id), true);
  assert.equal(
    keys.some((key) => key[0] === "booking-leads"),
    true,
  );
  assert.equal(
    keys.some((key) => key[0] === "residents"),
    true,
  );
  assert.equal(
    keys.some((key) => key[0] === "leases"),
    true,
  );
  assert.equal(
    keys.some((key) => key[0] === "rooms"),
    true,
  );
  assert.equal(
    keys.some((key) => key[0] === "roomAvailability"),
    true,
  );
  assert.equal(
    keys.some((key) => key[0] === "dashboard"),
    true,
  );
});

test("dialog owns and clears the one-time receipt without implicit activation", () => {
  const dialog = readFileSync(
    resolve(
      fileURLToPath(new URL(".", import.meta.url)),
      "../components/onboarding/ResidentOnboardingDialog.tsx",
    ),
    "utf8",
  );
  assert.match(dialog, /useState<string \| null>\(null\)/);
  assert.match(dialog, /useResidentOnboarding\(setTemporaryPassword\)/);
  assert.match(dialog, /if \(!nextOpen\) clearTransientResult\(\)/);
  assert.match(dialog, /onClick=\{\(\) => setTemporaryPassword\(null\)\}/);
  assert.match(dialog, /mutationMatchesScope && mutation\.data\?\.leaseStatus/);
  const resetEffect = dialog.match(/useEffect\(\(\) => \{([\s\S]*?)\n {2}\}, \[/)?.[1];
  assert.ok(resetEffect);
  assert.doesNotMatch(resetEffect, /activation\.mutate/);
  assert.equal(dialog.match(/activation\.mutate/g)?.length, 1);
});

test("booking-lead lease flow explains its recorded period and a revised calculation", () => {
  const page = readFileSync(
    resolve(
      fileURLToPath(new URL(".", import.meta.url)),
      "../components/leases/LeaseCreatePage.tsx",
    ),
    "utf8",
  );

  assert.match(page, /Periode dari Minat Booking/);
  assert.match(page, /Tanggal mulai dan durasi di bawah dapat disesuaikan/);
  assert.match(
    page,
    /Jumlah sewa dan sisa\s+pembayaran akan dihitung ulang,\s+lalu diverifikasi server/,
  );
  assert.match(page, /bookingPeriod\.startDate !== startDate/);
  assert.match(page, /bookingPeriod\.termMonths !== termMonths/);
});
