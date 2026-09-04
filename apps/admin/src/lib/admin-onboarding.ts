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
  billingCycle: "monthly" | "yearly";
  paymentPlanType: "annual_full" | "monthly_installments" | "two_month_installments";
  contractRentAmount: number;
  dpRequiredAmount: number;
  securityDepositRequiredAmount: number;
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
        "dpRequiredAmount",
        "endDate",
        "initialPayment",
        "leaseId",
        "leaseStatus",
        "paymentPlanType",
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
  const roomNumber = d.roomNumber;
  const startDate = d.startDate;
  const endDate = d.endDate;
  const contractRentAmount = d.contractRentAmount;
  const dpRequiredAmount = d.dpRequiredAmount;
  const securityDepositRequiredAmount = d.securityDepositRequiredAmount;
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
    (termMonths as number) < 3 ||
    (termMonths as number) > 120 ||
    !["monthly", "yearly"].includes(billingCycle as string) ||
    !["annual_full", "monthly_installments", "two_month_installments"].includes(
      paymentPlanType as string,
    ) ||
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
    (temporaryPassword !== null && typeof temporaryPassword !== "string")
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
    contractRentAmount: contractRentAmount as number,
    dpRequiredAmount: dpRequiredAmount as number,
    securityDepositRequiredAmount: securityDepositRequiredAmount as number,
    initialPayment: initialPayment as OnboardingResponse["initialPayment"],
    contractPaidDocument: contractPaidDocument as OnboardingResponse["contractPaidDocument"],
    temporaryPassword: temporaryPassword as string | null,
  };
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
