import assert from "node:assert/strict";
import test from "node:test";
import { createLeaseRevisionClient, parseLeaseRevisionContext } from "./lease-revision-contract.ts";
import type { AdminUxV2Requester } from "./admin-ux-api.ts";

const leaseId = "11111111-1111-4111-8111-111111111111";
const propertyId = "22222222-2222-4222-8222-222222222222";
const roomId = "33333333-3333-4333-8333-333333333333";
const ownerId = "44444444-4444-4444-8444-444444444444";
const evidenceId = "55555555-5555-4555-8555-555555555555";
const allowed: { allowed: boolean; code: string | null; message: string | null } = {
  allowed: true,
  code: null,
  message: null,
};

function envelope() {
  return {
    data: {
      lease: {
        id: leaseId,
        property_id: propertyId,
        lease_code: "LSE-TEST-01",
        resident_id: "66666666-6666-4666-8666-666666666666",
        resident_name: "Penghuni uji",
        resident_gender: "male",
        lease_status: "awaiting_activation",
        commercial_mode: "rent",
        term_months: 12,
        planned_start_date: "2026-10-05",
        recorded_start_date: "2026-10-05",
        recorded_end_date: "2027-10-05",
        effective_start_date: null,
        effective_end_date: null,
        service_period_state: "pending_check_in",
        checked_in_date: null,
        physical_check_in_recorded: false,
        agreed_monthly_price: 1800000,
        reference_monthly_price: 1800000,
        contract_rent_amount: 21600000,
        pricing_source: "standard",
        pricing_agreement_reason: null,
      },
      room: {
        id: roomId,
        number: "RK-06-03",
        manager_room_label: null,
        plot_number: "6A",
        category: "rukost",
      },
      owner_sponsorship: null,
      financial: {
        related_transaction_count: 0,
        payment_count: 0,
        payment_proof_count: 0,
        pending_proof_claimed_amount: 0,
        reversal_count: 0,
        deposit_transaction_count: 0,
        refund_count: 0,
        verified_payment_amount: 0,
        pending_payment_amount: 0,
        recognized_income_amount: 0,
        current_rent_invoice_amount: 21600000,
        owner_realization_linked: false,
      },
      policies: {
        correction: allowed,
        room_correction: { ...allowed, requires_evidence: false, recording_error_only: true },
        commercial_mode_change: allowed,
        sponsorship_policy_change: allowed,
        cancellation: {
          ...allowed,
          requires_mistaken_activation_confirmation: false,
          financial_resolution_required: false,
        },
      },
    },
  };
}

function previewEnvelope() {
  const snapshot = {
    commercial_mode: "rent",
    commercial_change: null,
    owner_sponsorship: null,
    room_id: roomId,
    room_number: "RK-06-03",
    manager_room_label: null,
    plot_number: "6A",
    kost_type_name: "Rumah Kost",
    room_correction_evidence_file_ids: [],
    start_date: "2026-10-05",
    end_date: "2027-10-05",
    term_months: 12,
    checked_in_date: null,
    pricing_tier: "long_stay",
    reference_monthly_price: 1800000,
    agreed_monthly_price: 1800000,
    contract_rent_amount: 21600000,
    pricing_source: "standard",
    pricing_agreement_reason: null,
  };
  return {
    data: {
      lease_id: leaseId,
      property_id: propertyId,
      previous: { ...snapshot },
      corrected: {
        ...snapshot,
        term_months: 6,
        end_date: "2027-04-05",
        contract_rent_amount: 10800000,
      },
      impact: {
        contract_amount_delta: -10800000,
        additional_charge_amount: 0,
        contract_credit_amount: 10800000,
        verified_rent_payment_amount: 0,
        outstanding_amount_after: 10800000,
        overpayment_amount_after: 0,
      },
      correction_kind: "contract_term",
      pricing_choice_required: false,
      owner_impact: {
        previous: {
          owner_profile_id: ownerId,
          owner_name: "Owner uji",
          monthly_management_fee: 300000,
          management_fee_amount: 3600000,
          projected_owner_entitlement: 18000000,
        },
        corrected: {
          owner_profile_id: ownerId,
          owner_name: "Owner uji",
          monthly_management_fee: 300000,
          management_fee_amount: 1800000,
          projected_owner_entitlement: 9000000,
        },
        projection_only: true,
        transfer_amount_unchanged: true,
        notice: "Estimasi, bukan transfer.",
      },
      document_impact: [
        {
          document_type: "invoice",
          document_code: "INV-01",
          current_status: "issued",
          effect: "retained",
          notice: "Riwayat tetap tersimpan.",
        },
      ],
      sponsorship_change: null,
      room_change: null,
    },
  };
}

function committedEnvelope() {
  const preview = previewEnvelope().data;
  return {
    data: {
      correction: {
        lease_id: preview.lease_id,
        property_id: preview.property_id,
        previous: preview.previous,
        corrected: preview.corrected,
        impact: preview.impact,
        correction_kind: preview.correction_kind,
        id: evidenceId,
        sequence_number: 1,
        reason: "Koreksi pencatatan awal",
        created_by_user_id: ownerId,
        created_at: "2026-10-04T08:00:00.000Z",
      },
    },
  };
}

function responseClient(response: unknown) {
  return createLeaseRevisionClient({
    get: (async () => {
      throw new Error("Unexpected read");
    }) as AdminUxV2Requester["get"],
    post: (async () => response) as AdminUxV2Requester["post"],
  });
}

test("revision context keeps pending effective dates null and maps room identifiers", () => {
  const result = parseLeaseRevisionContext(envelope(), leaseId, propertyId);
  assert.equal(result.lease.effectiveStartDate, null);
  assert.equal(result.lease.physicalCheckInRecorded, false);
  assert.equal(result.room.plotNumber, "6A");
  assert.equal(result.policies.roomCorrection.recordingErrorOnly, true);
});

test("revision context rejects incomplete decisions, unsafe finance and unknown modes", () => {
  const noPolicies = envelope();
  Reflect.deleteProperty(noPolicies.data.policies, "commercial_mode_change");
  assert.throws(() => parseLeaseRevisionContext(noPolicies, leaseId, propertyId));
  const badFinance = envelope();
  badFinance.data.financial.pending_payment_amount = Number.NaN;
  assert.throws(() => parseLeaseRevisionContext(badFinance, leaseId, propertyId));
  const unknownMode = envelope();
  unknownMode.data.lease.commercial_mode = "unknown";
  assert.throws(() => parseLeaseRevisionContext(unknownMode, leaseId, propertyId));
});

test("revision context rejects a different property or lease and malformed denial", () => {
  assert.throws(() => parseLeaseRevisionContext(envelope(), roomId, propertyId));
  assert.throws(() => parseLeaseRevisionContext(envelope(), leaseId, ownerId));
  const response = envelope();
  response.data.policies.correction = { allowed: false, code: null, message: null };
  assert.throws(() => parseLeaseRevisionContext(response, leaseId, propertyId));
});

test("revision context retains server rejections instead of inferring permission from zero payments", () => {
  const response = envelope();
  const denial = {
    allowed: false,
    code: "LEASE_REVISION_FINANCIAL_REVIEW_REQUIRED",
    message: "Tinjau penyelesaian pembayaran sebelum mengubah jenis hunian.",
  };
  response.data.policies.commercial_mode_change = denial;
  assert.deepEqual(
    parseLeaseRevisionContext(response, leaseId, propertyId).policies.commercialModeChange,
    denial,
  );
});

test("revision context client uses the read-only endpoint and binds the returned scope", async () => {
  const signal = new AbortController().signal;
  const requester = {
    get: (async (path, options) => {
      assert.equal(path, `/leases/${leaseId}/revision-context`);
      assert.equal(options?.signal, signal);
      return envelope();
    }) as AdminUxV2Requester["get"],
    post: (async () => {
      throw new Error("Unexpected mutation");
    }) as AdminUxV2Requester["post"],
  };
  const client = createLeaseRevisionClient(requester);
  const result = await client.getRevisionContext(leaseId, propertyId, signal);
  assert.equal(result.lease.id, leaseId);
  await assert.rejects(client.getRevisionContext(leaseId, ownerId));
});

test("preview and commit preserve all reviewed inputs and the commit idempotency key", async () => {
  const requests: { path: string; body: unknown; key?: string }[] = [];
  const requester = {
    get: (async () => {
      throw new Error("Unexpected read");
    }) as AdminUxV2Requester["get"],
    post: (async (path, body, options) => {
      requests.push({ path, body, key: options?.idempotencyKey });
      return path.endsWith("/preview") ? previewEnvelope() : committedEnvelope();
    }) as AdminUxV2Requester["post"],
  };
  const client = createLeaseRevisionClient(requester);
  const input = {
    commercialMode: "owner_sponsored" as const,
    roomId,
    roomRecordingErrorConfirmed: true,
    roomCorrectionEvidenceFileIds: [evidenceId],
    sponsoringOwnerProfileId: ownerId,
    managementFeeMode: "charged" as const,
    managementFeePayer: "other" as const,
    managementFeePayerName: "  Penanggung uji  ",
    ownerSponsorshipReason: "  Instruksi Owner  ",
    termMonths: 12,
    paymentPlanType: "annual_full" as const,
    billingCycle: "yearly" as const,
    reason: "  Koreksi pencatatan awal  ",
  };
  await client.previewDataCorrection(leaseId, input);
  await client.commitDataCorrection(leaseId, input, "reviewed-intent");
  assert.deepEqual(requests[0].body, requests[1].body);
  const body = requests[0].body as Record<string, unknown>;
  assert.equal(body.commercial_mode, "owner_sponsored");
  assert.equal(body.room_id, roomId);
  assert.equal(body.room_recording_error_confirmed, true);
  assert.deepEqual(body.room_correction_evidence_file_ids, [evidenceId]);
  assert.equal(body.sponsoring_owner_profile_id, ownerId);
  assert.equal(body.management_fee_mode, "charged");
  assert.equal(body.management_fee_payer, "other");
  assert.equal(body.management_fee_payer_name, "Penanggung uji");
  assert.equal(body.owner_sponsorship_reason, "Instruksi Owner");
  assert.equal(body.payment_plan_type, "annual_full");
  assert.equal(body.billing_cycle, "yearly");
  assert.equal(body.reason, "Koreksi pencatatan awal");
  assert.equal(requests[1].key, "reviewed-intent");
});

test("a review rejects incomplete calculations instead of enabling confirmation", async () => {
  const input = { termMonths: 6, reason: "Koreksi durasi awal" };
  await assert.rejects(responseClient({ data: {} }).previewDataCorrection(leaseId, input));
  const response = previewEnvelope();
  response.data.impact.outstanding_amount_after = Number.MAX_SAFE_INTEGER + 1;
  await assert.rejects(responseClient(response).previewDataCorrection(leaseId, input));
  const missingRoom = previewEnvelope();
  Reflect.deleteProperty(missingRoom.data.corrected, "room_id");
  await assert.rejects(responseClient(missingRoom).previewDataCorrection(leaseId, input));
});

test("preview rejects a different lease and binds optional active property scope", async () => {
  const input = { termMonths: 6, reason: "Koreksi durasi awal" };
  const client = responseClient(previewEnvelope());
  await assert.rejects(client.previewDataCorrection(roomId, input));
  await assert.rejects(client.previewDataCorrection(leaseId, input, ownerId));
  const review = await client.previewDataCorrection(leaseId, input, propertyId);
  assert.equal(review.impact.contractAmountDelta, -10800000);
  assert.equal(review.corrected.termMonths, 6);
  assert.equal(review.corrected.checkedInDate, null);
});

test("preview requires authoritative Owner and document effects without inventing a transfer", async () => {
  const input = { termMonths: 6, reason: "Koreksi durasi awal" };
  const review = await responseClient(previewEnvelope()).previewDataCorrection(leaseId, input);
  assert.equal(review.ownerImpact.corrected.projectedOwnerEntitlement, 9000000);
  assert.equal(review.ownerImpact.transferAmountUnchanged, true);
  assert.equal(review.documentImpact[0].documentCode, "INV-01");
  for (const key of ["owner_impact", "document_impact"]) {
    const response = previewEnvelope();
    Reflect.deleteProperty(response.data, key);
    await assert.rejects(responseClient(response).previewDataCorrection(leaseId, input));
  }
  const unsafe = previewEnvelope();
  unsafe.data.owner_impact.corrected.management_fee_amount = Number.MAX_SAFE_INTEGER + 1;
  await assert.rejects(responseClient(unsafe).previewDataCorrection(leaseId, input));
});

test("commit verifies the returned amendment without requiring preview-only fields", async () => {
  const input = { termMonths: 6, reason: "Koreksi durasi awal" };
  const client = responseClient(committedEnvelope());
  const result = await client.commitDataCorrection(leaseId, input, "intent-01", propertyId);
  assert.equal(result.correction.sequenceNumber, 1);
  assert.equal(result.correction.leaseId, leaseId);
  assert.equal("pricingChoiceRequired" in result.correction, false);
  await assert.rejects(client.commitDataCorrection(roomId, input, "intent-01", propertyId));
  await assert.rejects(client.commitDataCorrection(leaseId, input, "intent-01", ownerId));
  await assert.rejects(
    responseClient({ data: {} }).commitDataCorrection(leaseId, input, "intent-01"),
  );
});
