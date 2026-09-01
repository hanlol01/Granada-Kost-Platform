import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  parseAdminBookingLeadPage,
  bookingLeadDisplayStatus,
  bookingLeadEffectiveMoveInDate,
  canCancelBookingLeadPaymentCommitment,
  requestArchiveAdminBookingLead,
  requestAdminBookingLeadPage,
  type BookingLeadRecord,
  type BookingLeadProgress,
} from "./admin-booking-lead";

const PROPERTY_ID = "11111111-1111-4111-8111-111111111111";
const LEAD_ID = "22222222-2222-4222-8222-222222222222";

const lead: BookingLeadRecord = {
  id: LEAD_ID,
  propertyId: PROPERTY_ID,
  roomId: null,
  roomNumber: null,
  category: "rukost",
  gender: "female",
  buildingCode: null,
  floorCode: null,
  publicGroupKey: "rukost-female",
  visitorName: "Calon Penyewa",
  visitorPhone: "6281111111111",
  visitorAddress: null,
  visitorUniversity: "Universitas Demo",
  visitorMessage: null,
  preferredMoveInDate: "2026-08-10",
  paymentCommitmentStartDate: null,
  activeLeaseStartDate: null,
  status: "new",
  source: "public_kamar",
  createdAt: "2026-07-31T01:00:00.000Z",
  updatedAt: "2026-07-31T01:00:00.000Z",
};

const source = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
const backendSource = (relativePath: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../../backend/${relativePath}`, import.meta.url)),
    "utf8",
  );

test("V2 booking lead page parser preserves exact authoritative metadata", () => {
  const page = parseAdminBookingLeadPage({
    data: [lead],
    meta: { limit: 20, offset: 0, total: 41 },
  });
  assert.deepEqual(page, { data: [lead], meta: { limit: 20, offset: 0, total: 41 } });
  assert.throws(() => parseAdminBookingLeadPage([lead]));
  assert.throws(() =>
    parseAdminBookingLeadPage({
      data: [lead],
      meta: { limit: 20, offset: 0, total: 41, extra: true },
    }),
  );
});

test("V2 list requester binds property, filters, and server pagination", async () => {
  let captured: unknown;
  const page = await requestAdminBookingLeadPage(
    async (path, options) => {
      captured = { path, options };
      return { data: [lead], meta: { limit: 20, offset: 20, total: 41 } };
    },
    PROPERTY_ID,
    { category: "rukost", search: "calon", limit: 20, offset: 20 },
  );
  assert.equal(page.meta.total, 41);
  assert.deepEqual(captured, {
    path: "/booking-leads",
    options: {
      query: {
        property_id: PROPERTY_ID,
        status: undefined,
        category: "rukost",
        gender: undefined,
        source: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        search: "calon",
        limit: 20,
        offset: 20,
      },
    },
  });
});

test("workspace uses canonical queue vocabulary and removes obsolete survey conversion actions", () => {
  const page = source("routes/booking-leads.tsx");
  for (const heading of [
    "No",
    "Calon Penyewa",
    "Kategori Kost",
    "Jenis Kelamin",
    "Universitas/Pendidikan",
    "Sumber",
    "Kamar/Target",
    "Rencana Masuk",
    "Status",
    "Aksi",
  ]) {
    assert.match(page, new RegExp(`>${heading}<`));
  }
  assert.doesNotMatch(page, />Pengunjung<|Tanggal Pindah|Jadwal Survey|Dikonversi/);
  assert.match(page, /Belum dipilih/);
  assert.match(page, /min-h-11/);
  assert.match(page, /function moveInDate/);
  assert.match(page, /bookingLeadEffectiveMoveInDate\(lead\)/);
  assert.match(page, /lead\.activeLeaseStartDate/);
});

test("completed tenancy is presented as awaiting activation and keeps its lease start date", () => {
  const awaitingActivationLead: BookingLeadRecord = {
    ...lead,
    status: "onboarding",
    preferredMoveInDate: "2026-08-21",
    activeLeaseStartDate: "2026-08-21",
  };
  assert.equal(bookingLeadDisplayStatus(awaitingActivationLead), "awaiting_activation");
  assert.equal(
    bookingLeadDisplayStatus({ ...awaitingActivationLead, activeLeaseStartDate: null }),
    "onboarding",
  );

  const page = source("routes/booking-leads.tsx");
  assert.match(page, /bookingLeadDisplayStatus/);
  assert.match(page, /!awaitingActivation/);

  const onboarding = backendSource("api/src/modules/resident/onboarding.service.ts");
  assert.match(onboarding, /lease_id=\$4/);
  assert.match(onboarding, /preferred_move_in_date=\$5::date/);
});

test("paid onboarding uses its committed start date as the planned move-in date", () => {
  const paidOnboardingLead: BookingLeadRecord = {
    ...lead,
    status: "onboarding",
    preferredMoveInDate: null,
    paymentCommitmentStartDate: "2026-09-01",
    activeLeaseStartDate: null,
  };
  assert.equal(bookingLeadEffectiveMoveInDate(paidOnboardingLead), "2026-09-01");
  assert.equal(
    bookingLeadEffectiveMoveInDate({ ...paidOnboardingLead, activeLeaseStartDate: "2026-09-02" }),
    "2026-09-02",
  );
});

test("active tenancy detail exposes property-safe fast links only from the progress projection", () => {
  const dialog = source("components/booking-leads/BookingLeadDetailsDialog.tsx");
  const page = source("routes/booking-leads.tsx");
  assert.match(dialog, /Detail Penyewa Aktif/);
  assert.match(dialog, /Lihat Detail Penghuni/);
  assert.match(dialog, /Lihat Detail Kamar/);
  assert.match(dialog, /progress\.tenancy\.residentId/);
  assert.match(page, /to: "\/tenants\/\$residentId"/);
  assert.match(page, /to: "\/rooms\/\$roomNumber"/);
});

test("pre-activation refund is available only inside booking and resident details", () => {
  const page = source("routes/booking-leads.tsx");
  const leadDetail = source("components/booking-leads/BookingLeadDetailsDialog.tsx");
  const residentDetail = source("components/residents/ResidentDetailWorkspace.tsx");
  const cancellation = source("components/booking-leads/BookingLeadCancellationDialog.tsx");

  assert.doesNotMatch(page, /Batalkan \/ Refund/);
  assert.match(leadDetail, /canCancelBookingLeadPaymentCommitment/);
  assert.match(leadDetail, /Refund pembayaran awal/);
  assert.match(residentDetail, /Batalkan dan Refund/);
  assert.match(residentDetail, /currentTenancy\.bookingLeadId/);
  assert.match(cancellation, /lease, kontrak, dan invoice/);
});

test("Booking Fee or DP can be refunded before rental data is completed", () => {
  const progress: BookingLeadProgress = {
    propertyId: PROPERTY_ID,
    source: "admin_quick_entry",
    leadStatus: "onboarding",
    recordedAt: "2026-08-27T01:00:00.000Z",
    targetRoomNumber: "RK-A-01",
    hold: {
      status: "committed",
      roomNumber: "RK-A-01",
      startsAt: "2026-08-27T01:00:00.000Z",
      expiresAt: "2026-08-28T01:00:00.000Z",
      releasedAt: null,
      releaseReason: null,
    },
    paymentCommitment: {
      id: "33333333-3333-4333-8333-333333333333",
      paymentType: "down_payment",
      rentCreditAmount: 1_000_000,
      securityDepositAmount: 500_000,
      paymentMethod: "cash",
      verificationStatus: "verified",
      startDate: "2026-09-01",
      endDate: "2026-12-01",
      termMonths: 3,
      materializedAt: null,
    },
    cancellation: null,
    onboarding: null,
    tenancy: null,
    paymentSummary: {
      verifiedAmount: 0,
      pendingAmount: 0,
      paymentCount: 0,
      securityDepositBalance: 0,
    },
  };

  assert.equal(canCancelBookingLeadPaymentCommitment(progress, true), true);
  assert.equal(
    canCancelBookingLeadPaymentCommitment(
      {
        ...progress,
        tenancy: {
          residentId: "44444444-4444-4444-8444-444444444444",
          leaseStatus: "awaiting_activation",
          startDate: "2026-09-01",
          endDate: "2026-12-01",
          termMonths: 3,
          contractRentAmount: 5_400_000,
          occupancyStatus: null,
          occupancyStartedAt: null,
          activationState: null,
        },
      },
      true,
    ),
    true,
  );
  assert.equal(canCancelBookingLeadPaymentCommitment(progress, false), false);
  assert.equal(
    canCancelBookingLeadPaymentCommitment(
      {
        ...progress,
        paymentCommitment: { ...progress.paymentCommitment!, paymentType: "full_settlement" },
      },
      true,
    ),
    false,
  );
});

test("initial DP input warns and blocks a zero amount", () => {
  const dialog = source("components/booking-leads/CompleteBookingLeadDialog.tsx");
  assert.match(dialog, /DP harus lebih besar dari Rp0\./);
  assert.match(dialog, /paymentType === "down_payment" && displayedCredit <= 0/);
});

test("status mutation keeps property scope and one stable key per logical action", () => {
  const page = source("routes/booking-leads.tsx");
  const mutations = source("hooks/useBookingLeadMutations.ts");
  const contract = source("lib/admin-booking-lead.ts");
  assert.match(page, /idempotencyKey:\s*newIdempotencyKey\(\)/);
  assert.match(mutations, /input\.propertyId !== currentPropertyId/);
  assert.match(contract, /property_id:\s*input\.propertyId/);
  assert.match(mutations, /idempotencyKey:\s*input\.idempotencyKey/);
  assert.doesNotMatch(mutations, /newIdempotencyKey\(\)/);
});

test("terminal lead archive requester stays property-scoped and requires an archived response", async () => {
  let captured: unknown;
  const result = await requestArchiveAdminBookingLead(
    async (path, options) => {
      captured = { path, options };
      return { data: { archived: true } };
    },
    { propertyId: PROPERTY_ID, leadId: LEAD_ID, idempotencyKey: "archive-command-001" },
  );

  assert.deepEqual(result, { archived: true });
  assert.deepEqual(captured, {
    path: `/booking-leads/${LEAD_ID}`,
    options: {
      query: { property_id: PROPERTY_ID },
      idempotencyKey: "archive-command-001",
    },
  });
  await assert.rejects(
    requestArchiveAdminBookingLead(async () => ({ data: { archived: false } }), {
      propertyId: PROPERTY_ID,
      leadId: LEAD_ID,
      idempotencyKey: "archive-command-002",
    }),
  );
});

test("terminal cleanup is explicit and cannot be offered as a normal lead action", () => {
  const dialog = source("components/booking-leads/BookingLeadDetailsDialog.tsx");
  const service = backendSource("api/src/modules/booking-lead/booking-lead.service.ts");
  assert.match(
    dialog,
    /lead\.status === "rejected" \|\| lead\.status === "expired" \|\| lead\.status === "cancelled"/,
  );
  assert.match(dialog, /Hapus dari daftar/);
  assert.match(
    service,
    /ARCHIVABLE_STATUSES: BookingLeadStatus\[\] = \['rejected', 'expired', 'cancelled'\]/,
  );
  assert.match(service, /archived: true/);
});
