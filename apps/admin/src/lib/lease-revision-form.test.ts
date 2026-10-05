import assert from "node:assert/strict";
import test from "node:test";
import {
  createLeaseRevisionDraft,
  buildLeaseRevisionProposal,
  validateLeaseRevisionDraft,
} from "./lease-revision-form.ts";
import type { LeaseRevisionContext } from "./lease-revision-contract.ts";

const leaseId = "11111111-1111-4111-8111-111111111111";
const roomId = "33333333-3333-4333-8333-333333333333";
const targetId = "77777777-7777-4777-8777-777777777777";
const ownerId = "44444444-4444-4444-8444-444444444444";
const allowed = { allowed: true, code: null, message: null };
function context(): LeaseRevisionContext {
  return {
    lease: {
      id: leaseId,
      propertyId: "22222222-2222-4222-8222-222222222222",
      leaseCode: "LSE-TEST",
      residentId: ownerId,
      residentName: "Penghuni uji",
      residentGender: "male",
      leaseStatus: "awaiting_activation",
      commercialMode: "rent",
      termMonths: 12,
      plannedStartDate: "2026-10-05",
      recordedStartDate: "2026-10-05",
      recordedEndDate: "2027-10-05",
      effectiveStartDate: null,
      effectiveEndDate: null,
      servicePeriodState: "pending_check_in",
      checkedInDate: null,
      physicalCheckInRecorded: false,
      agreedMonthlyPrice: 1800000,
      referenceMonthlyPrice: 1800000,
      contractRentAmount: 21600000,
      pricingSource: "standard",
      pricingAgreementReason: null,
    },
    room: {
      id: roomId,
      number: "RK-06-03",
      managerRoomLabel: null,
      plotNumber: "6A",
      category: "rukost",
    },
    ownerSponsorship: null,
    financial: {
      relatedTransactionCount: 0,
      paymentCount: 0,
      paymentProofCount: 0,
      pendingProofClaimedAmount: 0,
      reversalCount: 0,
      depositTransactionCount: 0,
      refundCount: 0,
      verifiedPaymentAmount: 0,
      pendingPaymentAmount: 0,
      recognizedIncomeAmount: 0,
      currentRentInvoiceAmount: 21600000,
      ownerRealizationLinked: false,
    },
    policies: {
      correction: allowed,
      commercialModeChange: allowed,
      sponsorshipPolicyChange: allowed,
      roomCorrection: { ...allowed, requiresEvidence: false, recordingErrorOnly: true },
      cancellation: {
        ...allowed,
        requiresMistakenActivationConfirmation: false,
        financialResolutionRequired: false,
      },
    },
  };
}

test("an unchanged room is omitted and pending service never fabricates check-in", () => {
  const source = context();
  const draft = {
    ...createLeaseRevisionDraft(source),
    termMonths: "6",
    reason: "Durasi awal salah dicatat",
  };
  const result = buildLeaseRevisionProposal(source, draft);
  assert.equal(result.roomId, undefined);
  assert.equal(result.checkedInDate, undefined);
  assert.equal(result.termMonths, 6);
  assert.equal(result.pricingSource, "standard");
  assert.equal(result.commercialMode, undefined);
  assert.equal(result.managementFeePayer, undefined);
  assert.deepEqual(validateLeaseRevisionDraft(source, draft), {});
});

test("post-check-in room correction needs affirmative recording-error confirmation and evidence", () => {
  const source = context();
  source.lease.physicalCheckInRecorded = true;
  source.lease.checkedInDate = "2026-10-05";
  source.policies.roomCorrection.requiresEvidence = true;
  const draft = {
    ...createLeaseRevisionDraft(source),
    roomId: targetId,
    reason: "Kamar awal salah dicatat",
  };
  const errors = validateLeaseRevisionDraft(source, draft);
  assert.ok(errors.roomRecordingErrorConfirmed);
  assert.ok(errors.evidenceFileIds);
  draft.roomRecordingErrorConfirmed = true;
  draft.evidenceFileIds = [ownerId];
  assert.deepEqual(validateLeaseRevisionDraft(source, draft), {});
  assert.deepEqual(buildLeaseRevisionProposal(source, draft).roomCorrectionEvidenceFileIds, [
    ownerId,
  ]);
});

test("a real room correction and check-in-date correction need separate reviews", () => {
  const source = context();
  source.lease.physicalCheckInRecorded = true;
  source.lease.checkedInDate = "2026-10-05";
  const draft = {
    ...createLeaseRevisionDraft(source),
    roomId: targetId,
    checkedInDate: "2026-10-06",
    roomRecordingErrorConfirmed: true,
    reason: "Koreksi pencatatan awal",
  };
  assert.ok(validateLeaseRevisionDraft(source, draft).checkedInDate);
});

test("mode conversion and recorded check-in changes need separate reviews before submission", () => {
  const source = context();
  source.lease.physicalCheckInRecorded = true;
  source.lease.checkedInDate = "2026-10-05";
  const draft = {
    ...createLeaseRevisionDraft(source),
    checkedInDate: "2026-10-06",
    startDate: "2026-10-06",
    commercialMode: "owner_sponsored" as const,
    sponsoringOwnerProfileId: ownerId,
    managementFeeMode: "waived" as const,
    ownerSponsorshipReason: "Jenis hunian awal salah dicatat",
    reason: "Koreksi tanggal dan jenis hunian",
  };
  assert.match(validateLeaseRevisionDraft(source, draft).checkedInDate ?? "", /terpisah/);
});

test("conversion proposals include complete sponsor policy but never silently charge rent", () => {
  const source = context();
  const draft = {
    ...createLeaseRevisionDraft(source),
    commercialMode: "owner_sponsored" as const,
    sponsoringOwnerProfileId: ownerId,
    managementFeeMode: "waived" as const,
    ownerSponsorshipReason: "Instruksi Owner untuk keluarga",
    reason: "Jenis hunian awal salah dicatat",
  };
  assert.deepEqual(validateLeaseRevisionDraft(source, draft), {});
  const result = buildLeaseRevisionProposal(source, draft);
  assert.equal(result.commercialMode, "owner_sponsored");
  assert.equal(result.sponsoringOwnerProfileId, ownerId);
  assert.equal(result.managementFeeMode, "waived");
  assert.equal(result.managementFeePayer, undefined);
  assert.equal(result.agreedMonthlyPrice, undefined);
  assert.equal(result.paymentPlanType, undefined);
});

test("financial policy denial survives zero amounts and prevents mode or fee change", () => {
  const source = context();
  source.policies.commercialModeChange = {
    allowed: false,
    code: "LEASE_REVISION_FINANCIAL_REVIEW_REQUIRED",
    message: "Riwayat pembayaran tetap ada. Tinjau penyelesaian pembayaran terlebih dahulu.",
  };
  const draft = {
    ...createLeaseRevisionDraft(source),
    commercialMode: "owner_sponsored" as const,
    reason: "Koreksi jenis hunian",
  };
  assert.equal(
    validateLeaseRevisionDraft(source, draft).commercialMode,
    source.policies.commercialModeChange.message,
  );
});

test("no changes, invalid dates, a missing reason and unsafe prices produce field errors", () => {
  const source = context();
  const initial = createLeaseRevisionDraft(source);
  assert.ok(validateLeaseRevisionDraft(source, initial).changes);
  assert.ok(validateLeaseRevisionDraft(source, initial).reason);
  const draft = {
    ...initial,
    startDate: "2026-02-31",
    termMonths: "1.5",
    pricingSource: "negotiated" as const,
    agreedMonthlyPrice: Number.NaN,
  };
  const errors = validateLeaseRevisionDraft(source, draft);
  assert.ok(errors.startDate);
  assert.ok(errors.termMonths);
  assert.ok(errors.agreedMonthlyPrice);
  assert.ok(errors.pricingAgreementReason);
  assert.ok(errors.pricingVarianceAcknowledged);
});
