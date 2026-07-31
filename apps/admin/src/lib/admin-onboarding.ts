export type OnboardingPayload = {
  property_id: string;
  booking_lead_id?: string;
  room_id?: string;
  visitor_name: string;
  visitor_phone?: string;
  visitor_email?: string;
  gender: "male" | "female";
  start_date: string;
  term_months: number;
  billing_cycle: "monthly" | "yearly";
  payment_plan_type: "annual_full" | "two_month_installments";
  accepted_terms_version: string;
  dp_verified_amount: number;
  security_deposit_funded_amount: number;
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
  paymentPlanType: "annual_full" | "two_month_installments";
  contractRentAmount: number;
  dpRequiredAmount: number;
  securityDepositRequiredAmount: number;
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
    Object.keys(d).sort().join(",") !==
      "billingCycle,category,commitmentId,contractRentAmount,dpRequiredAmount,endDate,leaseId,leaseStatus,paymentPlanType,roomNumber,securityDepositRequiredAmount,startDate,status,temporaryPassword,termMonths"
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
  const temporaryPassword = d.temporaryPassword;
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
    (termMonths as number) < 12 ||
    !["monthly", "yearly"].includes(billingCycle as string) ||
    !["annual_full", "two_month_installments"].includes(paymentPlanType as string) ||
    !Number.isSafeInteger(contractRentAmount) ||
    !Number.isSafeInteger(dpRequiredAmount) ||
    !Number.isSafeInteger(securityDepositRequiredAmount) ||
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
