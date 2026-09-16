export type OnboardingPayload = {
  property_id: string;
  booking_lead_id?: string;
  room_id?: string;
  visitor_name: string;
  visitor_phone: string;
  visitor_email?: string;
  gender: "male" | "female";
  place_of_birth?: string;
  date_of_birth?: string;
  address?: string;
  university?: string;
  cohort?: string;
  faculty?: string;
  major?: string;
  instagram?: string;
  emergency_phone?: string;
  parent_name?: string;
  parent_phone?: string;
  ktp_number?: string;
  ktp_file_id?: string;
  start_date: string;
  term_months: number;
  commercial_mode?: "rent" | "owner_sponsored";
  sponsoring_owner_profile_id?: string;
  management_fee_payer?: "resident" | "owner" | "other";
  management_fee_payer_name?: string;
  owner_sponsorship_reason?: string;
  pricing_source?: "standard" | "negotiated";
  agreed_monthly_price?: number;
  pricing_agreement_reason?: string;
  pricing_variance_acknowledged?: boolean;
  billing_cycle: "monthly" | "yearly";
  payment_plan_type: "annual_full" | "two_month_installments" | "monthly_installments";
  accepted_terms_version: string;
  dp_verified_amount: number;
  security_deposit_funded_amount: number;
  booking_fee_paid_amount?: number;
  payment_method: "cash" | "bank_transfer";
  payment_paid_at?: string;
  payment_evidence_file_ids?: string[];
  payment_note?: string;
  payment_entries?: Array<{
    purpose: "rent" | "booking_fee" | "security_deposit";
    amount: number;
    method: "cash" | "bank_transfer";
    paid_at: string;
    evidence_file_ids?: string[];
    note?: string;
  }>;
  notes?: string;
};
export type OnboardingResponse = {
  commitmentId: string;
  status: "committed";
  leaseId: string;
  leaseStatus: "awaiting_activation";
  roomNumber: string;
  category: "rukost" | "apartkost";
  startDate: string;
  endDate: string;
  termMonths: number;
  commercialMode: "rent" | "owner_sponsored";
  pricingSource: "standard" | "negotiated" | "owner_sponsored";
  pricingTier: "short_stay" | "medium_stay" | "long_stay";
  referenceMonthlyPrice: number;
  agreedMonthlyPrice: number;
  pricingAgreementReason: string | null;
  billingCycle: "monthly" | "yearly";
  paymentPlanType: "annual_full" | "monthly_installments" | "two_month_installments";
  contractRentAmount: number;
  dpRequiredAmount: number;
  securityDepositRequiredAmount: number;
  ownerSponsorship: {
    ownerProfileId: string;
    ownerName: string;
    managementFeePayer: "resident" | "owner" | "other";
    managementFeePayerName: string | null;
    reason: string;
    monthlyManagementFee: number;
    projectedManagementFeeAmount: number;
  } | null;
  initialPayment: {
    method: "cash" | "bank_transfer";
    status: "verified" | "pending_confirmation";
    dpRecordedAmount: number;
    securityDepositRecordedAmount: number;
    dpVerifiedAmount: number;
    securityDepositVerifiedAmount: number;
    receipts: Array<{
      id: string;
      purpose:
        | "booking_fee"
        | "down_payment"
        | "installment"
        | "full_settlement"
        | "security_deposit";
      amount: number;
      rentPaymentSequence?: number | null;
    }>;
  };
  contractPaidDocument: {
    id: string;
    documentCode: string;
    issuedAt: string;
  } | null;
  temporaryPassword: string | null;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseAdminOnboarding(value: unknown): OnboardingResponse {
  const env =
    value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const d =
    env?.data !== null && typeof env?.data === "object"
      ? (env.data as Record<string, unknown>)
      : null;
  if (
    !d ||
    typeof d !== "object" ||
    !Object.keys(d).every((key) =>
      [
        "billingCycle",
        "category",
        "commitmentId",
        "contractPaidDocument",
        "contractRentAmount",
        "commercialMode",
        "dpRequiredAmount",
        "endDate",
        "initialPayment",
        "ownerSponsorship",
        "leaseId",
        "leaseStatus",
        "paymentPlanType",
        "pricingAgreementReason",
        "pricingSource",
        "pricingTier",
        "referenceMonthlyPrice",
        "agreedMonthlyPrice",
        "roomNumber",
        "securityDepositRequiredAmount",
        "startDate",
        "status",
        "temporaryPassword",
        "termMonths",
      ].includes(key),
    )
  )
    throw new Error("Invalid onboarding response");
  const commitmentId = d.commitmentId;
  const leaseId = d.leaseId;
  const status = d.status;
  const leaseStatus = d.leaseStatus;
  const category = d.category;
  const termMonths = d.termMonths;
  const billingCycle = d.billingCycle;
  const paymentPlanType = d.paymentPlanType;
  const pricingSource = d.pricingSource;
  const commercialMode = d.commercialMode ?? "rent";
  const pricingTier = d.pricingTier;
  const referenceMonthlyPrice = d.referenceMonthlyPrice;
  const agreedMonthlyPrice = d.agreedMonthlyPrice;
  const pricingAgreementReason = d.pricingAgreementReason ?? null;
  const roomNumber = d.roomNumber;
  const startDate = d.startDate;
  const endDate = d.endDate;
  const contractRentAmount = d.contractRentAmount;
  const dpRequiredAmount = d.dpRequiredAmount;
  const securityDepositRequiredAmount = d.securityDepositRequiredAmount;
  const ownerSponsorship = d.ownerSponsorship ?? null;
  const initialPayment = d.initialPayment;
  const contractPaidDocument = d.contractPaidDocument ?? null;
  const temporaryPassword = d.temporaryPassword;
  const initialPaymentRecord =
    initialPayment !== null && typeof initialPayment === "object" && !Array.isArray(initialPayment)
      ? (initialPayment as Record<string, unknown>)
      : null;
  const initialPaymentReceipts =
    initialPaymentRecord && Array.isArray(initialPaymentRecord.receipts)
      ? initialPaymentRecord.receipts
      : null;
  if (
    typeof commitmentId !== "string" ||
    typeof leaseId !== "string" ||
    !UUID.test(commitmentId) ||
    !UUID.test(leaseId) ||
    status !== "committed" ||
    leaseStatus !== "awaiting_activation" ||
    !["rukost", "apartkost"].includes(category as string) ||
    typeof roomNumber !== "string" ||
    typeof startDate !== "string" ||
    typeof endDate !== "string" ||
    !Number.isInteger(termMonths) ||
    (termMonths as number) < 1 ||
    (termMonths as number) > 120 ||
    !["monthly", "yearly"].includes(billingCycle as string) ||
    !["annual_full", "monthly_installments", "two_month_installments"].includes(
      paymentPlanType as string,
    ) ||
    !["rent", "owner_sponsored"].includes(commercialMode as string) ||
    !["standard", "negotiated", "owner_sponsored"].includes(pricingSource as string) ||
    !["short_stay", "medium_stay", "long_stay"].includes(pricingTier as string) ||
    !Number.isSafeInteger(referenceMonthlyPrice) ||
    (referenceMonthlyPrice as number) <= 0 ||
    !Number.isSafeInteger(agreedMonthlyPrice) ||
    (commercialMode === "rent" ? (agreedMonthlyPrice as number) <= 0 : agreedMonthlyPrice !== 0) ||
    (pricingAgreementReason !== null && typeof pricingAgreementReason !== "string") ||
    (pricingSource === "standard" &&
      (agreedMonthlyPrice !== referenceMonthlyPrice || pricingAgreementReason !== null)) ||
    (pricingSource === "negotiated" &&
      (typeof pricingAgreementReason !== "string" || pricingAgreementReason.trim().length < 3)) ||
    (commercialMode === "owner_sponsored" && pricingSource !== "owner_sponsored") ||
    (commercialMode === "rent" && pricingSource === "owner_sponsored") ||
    !Number.isSafeInteger(contractRentAmount) ||
    !Number.isSafeInteger(dpRequiredAmount) ||
    !Number.isSafeInteger(securityDepositRequiredAmount) ||
    !initialPaymentRecord ||
    Object.keys(initialPaymentRecord).sort().join(",") !==
      "dpRecordedAmount,dpVerifiedAmount,method,receipts,securityDepositRecordedAmount,securityDepositVerifiedAmount,status" ||
    !["cash", "bank_transfer"].includes(initialPaymentRecord.method as string) ||
    !["verified", "pending_confirmation"].includes(initialPaymentRecord.status as string) ||
    ![
      "dpRecordedAmount",
      "securityDepositRecordedAmount",
      "dpVerifiedAmount",
      "securityDepositVerifiedAmount",
    ].every((key) => {
      const amount = initialPaymentRecord[key];
      return Number.isSafeInteger(amount) && (amount as number) >= 0;
    }) ||
    !initialPaymentReceipts ||
    !initialPaymentReceipts.every((receipt: unknown) => {
      if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) return false;
      const item = receipt as Record<string, unknown>;
      return (
        ["amount,id,purpose", "amount,id,purpose,rentPaymentSequence"].includes(
          Object.keys(item).sort().join(","),
        ) &&
        typeof item.id === "string" &&
        UUID.test(item.id) &&
        [
          "booking_fee",
          "down_payment",
          "installment",
          "full_settlement",
          "security_deposit",
        ].includes(item.purpose as string) &&
        Number.isSafeInteger(item.amount) &&
        (item.amount as number) > 0 &&
        (item.rentPaymentSequence === undefined ||
          item.rentPaymentSequence === null ||
          (Number.isSafeInteger(item.rentPaymentSequence) &&
            (item.rentPaymentSequence as number) > 0))
      );
    }) ||
    (contractPaidDocument !== null &&
      (typeof contractPaidDocument !== "object" ||
        Array.isArray(contractPaidDocument) ||
        Object.keys(contractPaidDocument).sort().join(",") !== "documentCode,id,issuedAt" ||
        typeof (contractPaidDocument as Record<string, unknown>).id !== "string" ||
        !UUID.test((contractPaidDocument as Record<string, unknown>).id as string) ||
        typeof (contractPaidDocument as Record<string, unknown>).documentCode !== "string" ||
        typeof (contractPaidDocument as Record<string, unknown>).issuedAt !== "string")) ||
    (temporaryPassword !== null && typeof temporaryPassword !== "string") ||
    !validOwnerSponsorship(ownerSponsorship, commercialMode)
  )
    throw new Error("Invalid onboarding response");
  return {
    commitmentId,
    status: "committed",
    leaseId,
    leaseStatus: "awaiting_activation",
    roomNumber,
    category: category as OnboardingResponse["category"],
    startDate,
    endDate,
    termMonths: termMonths as number,
    billingCycle: billingCycle as OnboardingResponse["billingCycle"],
    paymentPlanType: paymentPlanType as OnboardingResponse["paymentPlanType"],
    pricingSource: pricingSource as OnboardingResponse["pricingSource"],
    pricingTier: pricingTier as OnboardingResponse["pricingTier"],
    referenceMonthlyPrice: referenceMonthlyPrice as number,
    agreedMonthlyPrice: agreedMonthlyPrice as number,
    pricingAgreementReason: pricingAgreementReason as string | null,
    contractRentAmount: contractRentAmount as number,
    commercialMode: commercialMode as OnboardingResponse["commercialMode"],
    dpRequiredAmount: dpRequiredAmount as number,
    securityDepositRequiredAmount: securityDepositRequiredAmount as number,
    ownerSponsorship: ownerSponsorship as OnboardingResponse["ownerSponsorship"],
    initialPayment: initialPayment as OnboardingResponse["initialPayment"],
    contractPaidDocument: contractPaidDocument as OnboardingResponse["contractPaidDocument"],
    temporaryPassword: temporaryPassword as string | null,
  };
}

function validOwnerSponsorship(value: unknown, mode: unknown) {
  if (mode === "rent") return value === null;
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.ownerProfileId === "string" &&
    UUID.test(item.ownerProfileId) &&
    typeof item.ownerName === "string" &&
    ["resident", "owner", "other"].includes(String(item.managementFeePayer)) &&
    (item.managementFeePayerName === null || typeof item.managementFeePayerName === "string") &&
    typeof item.reason === "string" &&
    item.reason.trim().length >= 3 &&
    Number.isSafeInteger(item.monthlyManagementFee) &&
    Number(item.monthlyManagementFee) > 0 &&
    Number.isSafeInteger(item.projectedManagementFeeAmount) &&
    Number(item.projectedManagementFeeAmount) > 0
  );
}
export async function requestAdminOnboarding(
  post: (
    path: string,
    body: OnboardingPayload,
    options: { idempotencyKey: string },
  ) => Promise<unknown>,
  payload: OnboardingPayload,
  idempotencyKey: string,
) {
  if (!payload.property_id || !idempotencyKey) throw new Error("ONBOARDING_REQUEST_INVALID");
  return parseAdminOnboarding(await post("/residents/onboard", payload, { idempotencyKey }));
}
