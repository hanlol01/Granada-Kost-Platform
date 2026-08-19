import { apiClient } from "@/lib/api";
import { newIdempotencyKey } from "@/lib/idempotency";

// Archived records remain queryable for audit but are hidden from normal worklists.
export type ExpenseStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "paid"
  | "rejected"
  | "cancelled"
  | "reversed"
  | "archived";

export type ExpensePaymentMethod = "cash" | "bank_transfer" | "qris" | "ewallet" | "other";

export type ExpenseRecord = {
  id: string;
  propertyId: string;
  buildingId: string | null;
  workOrderId: string | null;
  proofFileId: string | null;
  category: string;
  expenseDate: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  vendorName: string | null;
  notes: string | null;
  status: ExpenseStatus;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseList = { records: ExpenseRecord[]; total: number };

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  draft: "Draft",
  pending_approval: "Menunggu persetujuan",
  approved: "Disetujui",
  paid: "Sudah dibayar",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
  reversed: "Dikoreksi",
  archived: "Diarsipkan",
};

export const EXPENSE_METHOD_LABEL: Record<ExpensePaymentMethod, string> = {
  cash: "Tunai",
  bank_transfer: "Transfer bank",
  qris: "QRIS",
  ewallet: "E-wallet",
  other: "Lainnya",
};

export function listExpenses(propertyId: string, status?: ExpenseStatus): Promise<ExpenseList> {
  return apiClient.get<ExpenseList>("/expenses", {
    query: { property_id: propertyId, status, limit: 100, offset: 0 },
  });
}

export function createExpense(
  propertyId: string,
  body: Record<string, unknown>,
): Promise<ExpenseRecord> {
  return apiClient.post<ExpenseRecord>(
    "/expenses",
    { property_id: propertyId, ...body },
    {
      idempotencyKey: newIdempotencyKey(),
    },
  );
}

export function transitionExpense(
  expenseId: string,
  action: "submit" | "approve" | "reject" | "pay" | "cancel" | "reverse" | "archive",
  body?: Record<string, unknown>,
): Promise<ExpenseRecord> {
  return apiClient.post<ExpenseRecord>(`/expenses/${expenseId}/${action}`, body, {
    idempotencyKey: newIdempotencyKey(),
  });
}
