import { z } from "zod";
import { mapV2Data, type V2DataEnvelope } from "./admin-ux-mapper.ts";
import type { AdminUxV2Requester } from "./admin-ux-api.ts";
import type {
  LeaseDataCorrectionPreview,
  LeaseDataCorrectionRecord,
} from "./admin-ux-lease-types.ts";

const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const date = z.string().date();
const uuid = z.string().uuid();
const sponsorshipSchema = z.object({
  ownerProfileId: uuid,
  ownershipKind: z.enum(["building", "room"]),
  ownershipAssignmentId: uuid,
  managementFeeMode: z.enum(["charged", "waived"]),
  managementFeePayer: z.enum(["resident", "owner", "other"]).nullable(),
  managementFeePayerName: z.string().nullable(),
  sponsorshipReason: z.string(),
  monthlyManagementFee: amount,
  projectedManagementFeeAmount: amount,
  roomId: uuid,
  startDate: date,
  endDate: date,
  termMonths: z.number().int().min(1).max(120),
});
const snapshotSchema = z.object({
  commercialMode: z.enum(["rent", "owner_sponsored"]),
  commercialChange: z
    .object({
      invoicesToVoid: z.array(
        z.object({ invoiceCode: z.string().min(1), invoiceStatus: z.string().min(1) }),
      ),
      notice: z.string().min(1),
    })
    .nullable(),
  ownerSponsorship: sponsorshipSchema.nullable(),
  roomId: uuid.nullable(),
  roomNumber: z.string().min(1).nullable(),
  managerRoomLabel: z.string().nullable(),
  plotNumber: z.string().nullable(),
  kostTypeName: z.string().nullable(),
  roomCorrectionEvidenceFileIds: z.array(uuid).max(5),
  startDate: date,
  endDate: date,
  termMonths: z.number().int().min(1).max(120),
  checkedInDate: date.nullable(),
  pricingTier: z.enum(["short_stay", "medium_stay", "long_stay"]),
  referenceMonthlyPrice: amount,
  agreedMonthlyPrice: amount,
  contractRentAmount: amount,
  pricingSource: z.enum(["standard", "negotiated", "owner_sponsored"]),
  pricingAgreementReason: z.string().nullable(),
});
const correctionShape = {
  leaseId: uuid,
  propertyId: uuid,
  previous: snapshotSchema,
  corrected: snapshotSchema,
  impact: z.object({
    contractAmountDelta: z
      .number()
      .int()
      .min(-Number.MAX_SAFE_INTEGER)
      .max(Number.MAX_SAFE_INTEGER),
    additionalChargeAmount: amount,
    contractCreditAmount: amount,
    verifiedRentPaymentAmount: amount,
    outstandingAmountAfter: amount,
    overpaymentAmountAfter: amount,
  }),
  correctionKind: z.enum([
    "check_in_date",
    "contract_start",
    "contract_term",
    "contract_period",
    "combined",
  ]),
};
const previewSchema = z
  .object({
    ...correctionShape,
    pricingChoiceRequired: z.boolean(),
    ownerImpact: z
      .object({
        previous: z
          .object({
            ownerProfileId: uuid.nullable(),
            ownerName: z.string().nullable(),
            monthlyManagementFee: amount,
            managementFeeAmount: amount,
            projectedOwnerEntitlement: amount,
          })
          .strict(),
        corrected: z
          .object({
            ownerProfileId: uuid.nullable(),
            ownerName: z.string().nullable(),
            monthlyManagementFee: amount,
            managementFeeAmount: amount,
            projectedOwnerEntitlement: amount,
          })
          .strict(),
        projectionOnly: z.literal(true),
        transferAmountUnchanged: z.literal(true),
        notice: z.string().min(1),
      })
      .strict(),
    documentImpact: z.array(
      z
        .object({
          documentType: z.enum(["invoice", "payment_receipt", "contract_paid_confirmation"]),
          documentCode: z.string().min(1),
          currentStatus: z.string().min(1),
          effect: z.enum(["retained", "voided", "invalidated", "already_invalidated"]),
          notice: z.string().min(1),
        })
        .strict(),
    ),
    sponsorshipChange: z
      .object({
        effectiveFrom: date,
        previous: sponsorshipSchema,
        corrected: sponsorshipSchema,
        notice: z.string().min(1),
      })
      .nullable(),
    roomChange: z
      .object({
        previousRoomNumber: z.string().min(1),
        correctedRoomNumber: z.string().min(1),
        targetStatus: z.string().min(1),
        evidenceFileIds: z.array(uuid).max(5),
        notice: z.string().min(1),
      })
      .nullable(),
  })
  .refine((review) => review.corrected.roomId !== null && review.corrected.roomNumber !== null);
const amendmentSchema = z.object({
  ...correctionShape,
  id: uuid,
  sequenceNumber: z.number().int().positive(),
  reason: z.string().min(3),
  createdByUserId: uuid,
  createdAt: z.string().datetime({ offset: true }),
});
const decision = z.object({
  allowed: z.boolean(),
  code: z.string().min(1).nullable(),
  message: z.string().min(1).nullable(),
});
const contextSchema = z
  .object({
    lease: z.object({
      id: z.string().uuid(),
      propertyId: z.string().uuid(),
      leaseCode: z.string().min(1),
      residentId: z.string().uuid(),
      residentName: z.string().min(1),
      residentGender: z.enum(["male", "female", "other"]),
      leaseStatus: z.enum(["awaiting_activation", "active", "ended", "cancelled", "transferred"]),
      commercialMode: z.enum(["rent", "owner_sponsored"]),
      termMonths: z.number().int().min(1).max(120),
      plannedStartDate: date.nullable(),
      recordedStartDate: date,
      recordedEndDate: date,
      effectiveStartDate: date.nullable(),
      effectiveEndDate: date.nullable(),
      servicePeriodState: z.enum(["legacy", "pending_check_in", "started"]),
      checkedInDate: date.nullable(),
      physicalCheckInRecorded: z.boolean(),
      agreedMonthlyPrice: amount,
      referenceMonthlyPrice: amount,
      contractRentAmount: amount,
      pricingSource: z.enum(["standard", "negotiated", "owner_sponsored"]),
      pricingAgreementReason: z.string().nullable(),
    }),
    room: z.object({
      id: z.string().uuid(),
      number: z.string().min(1),
      managerRoomLabel: z.string().nullable(),
      plotNumber: z.string().nullable(),
      category: z.enum(["rukost", "apartkost"]),
    }),
    ownerSponsorship: z
      .object({
        ownerProfileId: z.string().uuid(),
        ownerName: z.string().min(1),
        ownershipKind: z.enum(["building", "room"]),
        ownershipAssignmentId: z.string().uuid(),
        sponsorshipReason: z.string(),
        managementFeeMode: z.enum(["charged", "waived"]),
        managementFeePayer: z.enum(["resident", "owner", "other"]).nullable(),
        managementFeePayerName: z.string().nullable(),
        snapshotMonthlyManagementFee: amount,
        projectedManagementFeeAmount: amount,
        verifiedManagementFeeAmount: amount,
        termStatus: z.string().min(1),
      })
      .nullable(),
    financial: z.object({
      relatedTransactionCount: amount,
      paymentCount: amount,
      paymentProofCount: amount,
      pendingProofClaimedAmount: amount,
      reversalCount: amount,
      depositTransactionCount: amount,
      refundCount: amount,
      verifiedPaymentAmount: amount,
      pendingPaymentAmount: amount,
      recognizedIncomeAmount: amount,
      currentRentInvoiceAmount: amount,
      ownerRealizationLinked: z.boolean(),
    }),
    policies: z.object({
      correction: decision,
      roomCorrection: decision.extend({
        requiresEvidence: z.boolean(),
        recordingErrorOnly: z.literal(true),
      }),
      commercialModeChange: decision,
      sponsorshipPolicyChange: decision,
      cancellation: decision.extend({
        requiresMistakenActivationConfirmation: z.boolean(),
        financialResolutionRequired: z.boolean(),
      }),
    }),
  })
  .superRefine((context, refinement) => {
    for (const [key, value] of Object.entries(context.policies)) {
      if (!value.allowed && (!value.code || !value.message)) {
        refinement.addIssue({
          code: "custom",
          path: ["policies", key],
          message: "Incomplete denial",
        });
      }
    }
    if (
      context.lease.servicePeriodState === "pending_check_in" &&
      (context.lease.effectiveStartDate !== null ||
        context.lease.effectiveEndDate !== null ||
        context.lease.physicalCheckInRecorded)
    ) {
      refinement.addIssue({
        code: "custom",
        path: ["lease"],
        message: "Pending service period cannot be effective",
      });
    }
  });

export type LeaseRevisionContext = z.infer<typeof contextSchema>;
export const leaseRevisionContextSchema = contextSchema;
export type LeaseRevisionDecision = LeaseRevisionContext["policies"]["correction"];
export class LeaseRevisionContractError extends Error {
  readonly code:
    | "LEASE_REVISION_CONTEXT_INVALID"
    | "LEASE_REVISION_SCOPE_CHANGED"
    | "LEASE_REVISION_PREVIEW_INVALID"
    | "LEASE_REVISION_COMMIT_RESPONSE_INVALID"
    | "LEASE_ARCHIVE_RESPONSE_INVALID"
    | "LEASE_ARCHIVE_COMMIT_RESPONSE_INVALID"
    | "LEASE_ARCHIVE_RESTORE_RESPONSE_INVALID"
    | "LEASE_ARCHIVE_RESTORE_COMMIT_RESPONSE_INVALID"
    | "LEASE_ARCHIVE_SUCCESSOR_INPUT_REQUIRED"
    | "LEASE_ARCHIVE_SUCCESSOR_IDENTITY_REQUIRED"
    | "LEASE_ARCHIVE_SUCCESSOR_SUBMISSION_UNCERTAIN"
    | "LEASE_FILE_PURGE_RESPONSE_INVALID"
    | "LEASE_FILE_PURGE_COMMIT_RESPONSE_INVALID";
  constructor(code: LeaseRevisionContractError["code"], message: string) {
    super(message);
    this.name = "LeaseRevisionContractError";
    this.code = code;
  }
}
export type LeaseDataCorrectionInput = {
  startDate?: string;
  termMonths?: number;
  checkedInDate?: string;
  pricingSource?: "standard" | "negotiated";
  agreedMonthlyPrice?: number;
  pricingAgreementReason?: string;
  pricingVarianceAcknowledged?: boolean;
  roomId?: string;
  roomRecordingErrorConfirmed?: boolean;
  roomCorrectionEvidenceFileIds?: string[];
  commercialMode?: "rent" | "owner_sponsored";
  paymentPlanType?: "annual_full" | "two_month_installments" | "monthly_installments";
  billingCycle?: "monthly" | "yearly";
  sponsoringOwnerProfileId?: string;
  managementFeeMode?: "charged" | "waived";
  managementFeePayer?: "resident" | "owner" | "other";
  managementFeePayerName?: string;
  ownerSponsorshipReason?: string;
  reason?: string;
};

export function parseLeaseRevisionContext(
  envelope: V2DataEnvelope<unknown>,
  leaseId: string,
  propertyId: string,
): LeaseRevisionContext {
  const parsed = contextSchema.safeParse(mapV2Data(envelope));
  if (!parsed.success) {
    throw new LeaseRevisionContractError(
      "LEASE_REVISION_CONTEXT_INVALID",
      "Data tinjauan penyewaan belum lengkap. Perbarui data sebelum melanjutkan koreksi; bila masih gagal, hubungi Pihak Pengelola.",
    );
  }
  if (parsed.data.lease.id !== leaseId || parsed.data.lease.propertyId !== propertyId) {
    throw new LeaseRevisionContractError(
      "LEASE_REVISION_SCOPE_CHANGED",
      "Penyewaan atau properti aktif telah berubah. Kembali ke detail penghuni yang benar, lalu buka ulang koreksi.",
    );
  }
  return parsed.data;
}

function assertScope(
  result: { leaseId: string; propertyId: string },
  leaseId: string,
  propertyId?: string,
) {
  if (result.leaseId !== leaseId || (propertyId && result.propertyId !== propertyId)) {
    throw new LeaseRevisionContractError(
      "LEASE_REVISION_SCOPE_CHANGED",
      "Penyewaan atau properti aktif telah berubah. Kembali ke detail penghuni yang benar, lalu buka ulang koreksi.",
    );
  }
}

function parsePreview(
  envelope: V2DataEnvelope<unknown>,
  leaseId: string,
  propertyId?: string,
): LeaseDataCorrectionPreview {
  const result = previewSchema.safeParse(mapV2Data(envelope));
  if (!result.success) {
    throw new LeaseRevisionContractError(
      "LEASE_REVISION_PREVIEW_INVALID",
      "Hasil tinjauan koreksi belum lengkap. Jangan simpan perubahan; perbarui data lalu tinjau ulang.",
    );
  }
  assertScope(result.data, leaseId, propertyId);
  return result.data;
}

function parseCommit(
  envelope: V2DataEnvelope<unknown>,
  leaseId: string,
  propertyId?: string,
): { correction: LeaseDataCorrectionRecord } {
  const result = z.object({ correction: amendmentSchema }).safeParse(mapV2Data(envelope));
  if (!result.success) {
    throw new LeaseRevisionContractError(
      "LEASE_REVISION_COMMIT_RESPONSE_INVALID",
      "Hasil penyimpanan belum dapat dipastikan. Periksa riwayat koreksi atau coba ulang tanpa mengubah isian; jangan membuat pengajuan baru terlebih dahulu.",
    );
  }
  assertScope(result.data.correction, leaseId, propertyId);
  return result.data;
}

function toBody(input: LeaseDataCorrectionInput): Record<string, unknown> {
  return {
    start_date: input.startDate,
    term_months: input.termMonths,
    checked_in_date: input.checkedInDate,
    pricing_source: input.pricingSource,
    agreed_monthly_price: input.agreedMonthlyPrice,
    pricing_agreement_reason: input.pricingAgreementReason?.trim() || undefined,
    pricing_variance_acknowledged: input.pricingVarianceAcknowledged,
    room_id: input.roomId,
    room_recording_error_confirmed: input.roomRecordingErrorConfirmed,
    room_correction_evidence_file_ids: input.roomCorrectionEvidenceFileIds,
    commercial_mode: input.commercialMode,
    payment_plan_type: input.paymentPlanType,
    billing_cycle: input.billingCycle,
    sponsoring_owner_profile_id: input.sponsoringOwnerProfileId,
    management_fee_mode: input.managementFeeMode,
    management_fee_payer: input.managementFeePayer,
    management_fee_payer_name: input.managementFeePayerName?.trim() || undefined,
    owner_sponsorship_reason: input.ownerSponsorshipReason?.trim() || undefined,
    reason: input.reason?.trim() || undefined,
  };
}

/** Inject the established authenticated transport; never add another auth or calculation authority. */
export function createLeaseRevisionClient(requester: Pick<AdminUxV2Requester, "get" | "post">) {
  return {
    getRevisionContext: async (leaseId: string, propertyId: string, signal?: AbortSignal) =>
      parseLeaseRevisionContext(
        await requester.get<V2DataEnvelope<unknown>>(
          `/leases/${encodeURIComponent(leaseId)}/revision-context`,
          { signal },
        ),
        leaseId,
        propertyId,
      ),
    previewDataCorrection: async (
      leaseId: string,
      input: LeaseDataCorrectionInput,
      propertyId?: string,
    ) =>
      parsePreview(
        await requester.post<V2DataEnvelope<unknown>>(
          `/leases/${encodeURIComponent(leaseId)}/data-correction/preview`,
          toBody(input),
        ),
        leaseId,
        propertyId,
      ),
    commitDataCorrection: async (
      leaseId: string,
      input: LeaseDataCorrectionInput & { reason: string },
      idempotencyKey: string,
      propertyId?: string,
    ) =>
      parseCommit(
        await requester.post<V2DataEnvelope<unknown>>(
          `/leases/${encodeURIComponent(leaseId)}/data-correction`,
          toBody(input),
          { idempotencyKey },
        ),
        leaseId,
        propertyId,
      ),
  };
}
