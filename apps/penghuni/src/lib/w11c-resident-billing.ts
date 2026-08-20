import type { MyW06Billing } from "./penghuni-w06-billing";

type BillingSummary = Pick<
  MyW06Billing["summary"],
  "rent_outstanding" | "overdue_count" | "next_due_date"
>;

type DpPayment = Pick<
  MyW06Billing["payments"][number],
  "payment_purpose" | "payment_status" | "amount" | "reversal_id"
>;

export type ResidentBillingNotice = {
  kind: "settled" | "overdue" | "due_soon" | "upcoming" | "unscheduled";
  days_until_due: number | null;
};

export function deriveResidentBillingNotice(
  summary: BillingSummary,
  today = jakartaToday(),
): ResidentBillingNotice {
  if (summary.rent_outstanding <= 0) return { kind: "settled", days_until_due: null };
  if (summary.overdue_count > 0)
    return { kind: "overdue", days_until_due: daysUntil(today, summary.next_due_date) };
  if (!summary.next_due_date) return { kind: "unscheduled", days_until_due: null };

  const remaining = daysUntil(today, summary.next_due_date);
  if (remaining !== null && remaining < 0) return { kind: "overdue", days_until_due: remaining };
  if (remaining !== null && remaining <= 7) return { kind: "due_soon", days_until_due: remaining };
  return { kind: "upcoming", days_until_due: remaining };
}

export function verifiedDpTotal(payments: DpPayment[]) {
  return payments.reduce(
    (total, payment) =>
      payment.payment_purpose === "dp" &&
      payment.payment_status === "verified" &&
      payment.reversal_id === null
        ? total + payment.amount
        : total,
    0,
  );
}

function jakartaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
}

function daysUntil(from: string, until: string | null) {
  if (!until) return null;
  return Math.round((dateOnlyUtc(until) - dateOnlyUtc(from)) / 86_400_000);
}

function dateOnlyUtc(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}
