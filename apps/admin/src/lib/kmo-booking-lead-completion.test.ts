import assert from "node:assert/strict";
import test from "node:test";
import {
  completedBookingLeadResidentId,
  parseBookingLeadCompletionQuote,
  parseBookingLeadRentalContext,
} from "./admin-booking-lead-completion";
import { ApiError } from "@granada-kost/domain";

const propertyId = "11111111-1111-4111-8111-111111111111";
const leadId = "22222222-2222-4222-8222-222222222222";
const holdId = "33333333-3333-4333-8333-333333333333";
const roomId = "44444444-4444-4444-8444-444444444444";
const kostTypeId = "55555555-5555-4555-8555-555555555555";
const commitmentId = "66666666-6666-4666-8666-666666666666";

function payload() {
  return {
    data: {
      lead: {
        id: leadId,
        visitor_name: "Calon penghuni",
        visitor_phone: "6281234567890",
        visitor_email: null,
        visitor_university: "Universitas Demo",
        category: "rukost",
        gender: "female",
      },
      hold: { id: holdId, room_id: roomId, expires_at: "2026-08-06T12:00:00.000Z" },
      room: {
        id: roomId,
        kost_type_id: kostTypeId,
        number: "RK-01-01",
        category: "rukost",
        gender_policy: "female",
        monthly_price: 1800000,
        yearly_price: 21600000,
      },
      payment_commitment: {
        id: commitmentId,
        property_id: propertyId,
        booking_lead_id: leadId,
        hold_id: holdId,
        room_id: roomId,
        payment_type: "booking_fee",
        rent_credit_amount: 1000000,
        security_deposit_amount: 0,
        payment_method: "cash",
        verification_status: "verified",
        payment_note: null,
        payment_evidence_file_ids: [],
        start_date: "2026-08-01",
        term_months: 3,
        end_date: "2026-11-01",
        billing_cycle: "monthly",
        payment_plan_type: "monthly_installments",
        materialized_onboarding_commitment_id: null,
      },
    },
  };
}

test("rental-context parser accepts only an exact property-scoped compatible hold context", () => {
  const parsed = parseBookingLeadRentalContext(payload(), propertyId);
  assert.equal(parsed.room.number, "RK-01-01");
  assert.equal(parsed.paymentCommitment.rentCreditAmount, 1000000);
});

test("rental-context parser fails closed for tuple, enum, and calendar-date drift", () => {
  const wrongGender = payload();
  wrongGender.data.room.gender_policy = "male";
  assert.throws(() => parseBookingLeadRentalContext(wrongGender, propertyId));

  const legacyPayment = payload();
  legacyPayment.data.payment_commitment.verification_status = "pending";
  assert.throws(() => parseBookingLeadRentalContext(legacyPayment, propertyId));

  const invalidDate = payload();
  invalidDate.data.payment_commitment.start_date = "2026-02-30";
  assert.throws(() => parseBookingLeadRentalContext(invalidDate, propertyId));
});

test("a materialized booking lead context yields only a validated resident target", () => {
  const error = new ApiError({
    code: "BOOKING_LEAD_ALREADY_ONBOARDED",
    message: "Booking lead has already been converted to an onboarding commitment",
    status: 409,
    correlationId: "test-correlation-id",
    details: {
      resident_id: "77777777-7777-4777-8777-777777777777",
      lease_id: "88888888-8888-4888-8888-888888888888",
    },
  });
  assert.equal(completedBookingLeadResidentId(error), "77777777-7777-4777-8777-777777777777");
  assert.equal(
    completedBookingLeadResidentId(
      new ApiError({
        ...error,
        details: { resident_id: "not-a-uuid", lease_id: "88888888-8888-4888-8888-888888888888" },
      }),
    ),
    null,
  );
});

test("completion quote parser requires its requested property and compatible active hold tuple", () => {
  const { payment_commitment: _paymentCommitment, ...quoteData } = payload().data;
  const quote = {
    data: {
      ...quoteData,
      property_id: propertyId,
      start_date: "2026-08-01",
      term_months: 3,
      billing_cycle: "monthly",
      end_date: "2026-11-01",
      contract_rent_amount: 5400000,
      suggested_dp_amount: 1350000,
    },
  };
  const parsed = parseBookingLeadCompletionQuote(quote, propertyId, "2026-08-01", 3);
  assert.equal(parsed.propertyId, propertyId);
  assert.equal(parsed.room.monthlyPrice, 1800000);
  assert.equal(parsed.contractRentAmount, 5400000);

  const dateDrift = structuredClone(quote);
  dateDrift.data.start_date = "2026-08-02";
  assert.throws(() => parseBookingLeadCompletionQuote(dateDrift, propertyId, "2026-08-01", 3));

  const termDrift = structuredClone(quote);
  termDrift.data.term_months = 6;
  assert.throws(() => parseBookingLeadCompletionQuote(termDrift, propertyId, "2026-08-01", 3));

  quote.data.property_id = "77777777-7777-4777-8777-777777777777";
  assert.throws(() => parseBookingLeadCompletionQuote(quote, propertyId, "2026-08-01", 3));
});
