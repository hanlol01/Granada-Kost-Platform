require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LeaseController } = require('../../src/modules/lease/lease.controller.ts');
const { LeaseDataCorrectionService } = require('../../src/modules/lease/lease-data-correction.service.ts');
const { createLeaseRevisionClient } = require('../../../../apps/admin/src/lib/lease-revision-contract.ts');
const { parseCancellationResult } = require('../../../../apps/admin/src/lib/lease-archive-contract.ts');

const leaseId = '30000000-0000-4000-8000-000000000001';
const propertyId = '20000000-0000-4000-8000-000000000001';
const correctionId = '40000000-0000-4000-8000-000000000001';
const snapshot = {
  commercialMode: 'rent', roomId: null, roomNumber: null, startDate: '2026-10-01',
  endDate: '2027-10-01', termMonths: 12, checkedInDate: null, pricingTier: 'long_stay',
  referenceMonthlyPrice: 1800000, agreedMonthlyPrice: 1800000, contractRentAmount: 21600000,
  pricingSource: 'standard', pricingAgreementReason: null,
};
const serializer = new LeaseDataCorrectionService({}, {}, {}, {});
const correction = serializer.toCorrectionResponse({
  id: correctionId, property_id: propertyId, lease_id: leaseId, sequence_number: 1,
  correction_kind: 'contract_term', previous_snapshot: snapshot,
  corrected_snapshot: { ...snapshot, termMonths: 6, endDate: '2027-04-01', contractRentAmount: 10800000 },
  contract_amount_delta: -10800000, additional_charge_amount: 0, contract_credit_amount: 10800000,
  verified_rent_payment_amount: 0, outstanding_amount_after: 10800000, overpayment_amount_after: 0,
  reason: 'Correct original duration', created_by_user_id: correctionId,
  created_at: new Date('2026-10-04T08:00:00.000Z'),
});

for (const replayed of [false, true]) test(`actual cancellation HTTP controller is parsed on ${replayed ? 'same-intent retry' : 'first save'}`, async () => {
  const archive = {
    id: correctionId, property_id: propertyId, lease_id: leaseId, lease_code: 'ONB-QA-01',
    resident_id: correctionId, room_id: correctionId, room_number: 'RK-01-01', room_status: 'vacant',
    archive_status: 'archived', financial_resolution_state: 'pending_review',
    resident_profile_archived: true, reason: 'Incorrect original rental', voided_invoice_ids: [],
  };
  const response = { statusCode: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(key, value) { this.headers[key] = value; },
  };
  const controller = new LeaseController({}, {}, {}, {}, {}, { cancel: async () => ({ data: { archive }, idempotent: replayed }) });
  const wire = JSON.parse(JSON.stringify(await controller.cancelAndArchive({}, leaseId, {}, 'same-intent', response)));
  const result = parseCancellationResult(wire, leaseId, propertyId);
  assert.equal(result.id, correctionId);
  assert.equal(response.statusCode, replayed ? 200 : 201);
  assert.equal(response.headers['Idempotency-Replayed'], replayed ? 'true' : undefined);
});

for (const replayed of [false, true]) test(`actual correction HTTP controller is parsed on ${replayed ? 'same-intent retry' : 'first save'}`, async () => {
  const response = { statusCode: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(key, value) { this.headers[key] = value; },
  };
  const controller = new LeaseController({}, {}, {}, { commit: async () => ({ data: { correction }, idempotent: replayed }) }, {}, {});
  const client = createLeaseRevisionClient({ post: async () =>
    JSON.parse(JSON.stringify(await controller.commitDataCorrection({}, leaseId, {}, 'same-intent', response))) });
  const result = await client.commitDataCorrection(leaseId, { reason: correction.reason }, 'same-intent', propertyId);
  assert.equal(result.correction.id, correctionId);
  assert.equal(result.correction.corrected.termMonths, 6);
  assert.equal(response.statusCode, replayed ? 200 : 201);
  assert.equal(response.headers['Idempotency-Replayed'], replayed ? 'true' : undefined);
});
