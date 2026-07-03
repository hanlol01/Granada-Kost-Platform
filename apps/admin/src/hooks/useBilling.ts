// Billing domain hooks. Backend controllers use the @Controller('invoices'),
// @Controller('payments'), and @Controller('payment-proofs') prefixes (see
// backend/api/src/modules/billing/controllers/*). The API_PLANNING document
// also lists /billing/* paths; the implemented paths are the source of truth
// for M11D since this milestone does not touch backend.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useProperty } from "@/lib/property";

export type InvoiceStatus =
  | "draft"
  | "issued"
  | "unpaid"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "void";

export type InvoiceRecord = {
  id: string;
  propertyId: string;
  residentId: string;
  roomId: string;
  occupancyId: string;
  billingPeriodId: string;
  invoiceCode: string;
  invoiceStatus: InvoiceStatus;
  subtotalAmount: number;
  lateFeeAmount: number;
  totalAmount: number;
  dueDate: string;
  issuedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  snapshotPeriodKey: string;
  snapshotPeriodStartDate: string;
  snapshotPeriodEndDate: string;
  snapshotRoomNumber: string;
  snapshotResidentName: string;
  snapshotMonthlyPrice: number;
  createdAt: string;
  updatedAt: string;
};

export type PaymentMethod = "cash" | "bank_transfer" | "qris" | "ewallet" | "other";
export type PaymentStatus = "pending" | "verified" | "void";

export type PaymentRecord = {
  id: string;
  propertyId: string;
  residentId: string | null;
  paymentCode: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amount: number;
  paidAt: string | null;
  verifiedAt: string | null;
  voidedAt: string | null;
  referenceNumber: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentProofStatus = "pending_review" | "verified" | "rejected" | "expired";

export type PaymentProofRecord = {
  id: string;
  propertyId: string;
  residentId: string;
  invoiceId: string;
  paymentAccountId: string | null;
  proofStatus: PaymentProofStatus;
  claimedAmount: number;
  paymentMethod: PaymentMethod;
  notes: string | null;
  uploadedByUserId: string;
  uploadedAt: string;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  paymentId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Safe file metadata returned by GET /payment-proofs/:id/files and GET /complaints/:id/files. */
export type FileMetadataRecord = {
  id: string;
  property_id: string;
  uploader_user_id: string | null;
  original_filename: string;
  sanitized_filename: string;
  mime_type: string;
  file_extension: string;
  file_size_bytes: number;
  file_purpose: string;
  storage_driver: string;
  checksum_sha256: string;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UseInvoicesFilters = {
  status?: InvoiceStatus;
  limit?: number;
  offset?: number;
};

export function useInvoices(filters: UseInvoicesFilters = {}): UseQueryResult<InvoiceRecord[]> {
  const { currentPropertyId } = useProperty();
  return useQuery<InvoiceRecord[]>({
    queryKey: ["billing", "invoices", { propertyId: currentPropertyId }, filters] as const,
    queryFn: () =>
      apiClient.get<InvoiceRecord[]>("/invoices", {
        query: {
          property_id: currentPropertyId ?? undefined,
          status: filters.status,
          limit: filters.limit ?? 50,
          offset: filters.offset,
        },
      }),
    enabled: Boolean(currentPropertyId),
  });
}

export function usePayments(
  filters: { status?: PaymentStatus; limit?: number; offset?: number } = {},
): UseQueryResult<PaymentRecord[]> {
  const { currentPropertyId } = useProperty();
  return useQuery<PaymentRecord[]>({
    queryKey: ["billing", "payments", { propertyId: currentPropertyId }, filters] as const,
    queryFn: () =>
      apiClient.get<PaymentRecord[]>("/payments", {
        query: {
          property_id: currentPropertyId ?? undefined,
          status: filters.status,
          limit: filters.limit ?? 50,
          offset: filters.offset,
        },
      }),
    enabled: Boolean(currentPropertyId),
  });
}

export function usePaymentProofs(
  filters: { status?: PaymentProofStatus; limit?: number; offset?: number } = {},
): UseQueryResult<PaymentProofRecord[]> {
  const { currentPropertyId } = useProperty();
  return useQuery<PaymentProofRecord[]>({
    queryKey: ["billing", "payment-proofs", { propertyId: currentPropertyId }, filters] as const,
    queryFn: () =>
      apiClient.get<PaymentProofRecord[]>("/payment-proofs", {
        query: {
          property_id: currentPropertyId ?? undefined,
          status: filters.status,
          limit: filters.limit ?? 50,
          offset: filters.offset,
        },
      }),
    enabled: Boolean(currentPropertyId),
  });
}

/** Fetches a single payment proof by ID. */
export function usePaymentProofDetail(proofId: string | null) {
  return useQuery<PaymentProofRecord>({
    queryKey: ["billing", "payment-proof", proofId] as const,
    queryFn: () => apiClient.get<PaymentProofRecord>(`/payment-proofs/${proofId}`),
    enabled: Boolean(proofId),
  });
}

/** Fetches safe file metadata attached to a payment proof. */
export function usePaymentProofFiles(proofId: string | null) {
  return useQuery<FileMetadataRecord[]>({
    queryKey: ["billing", "payment-proof-files", proofId] as const,
    queryFn: () => apiClient.get<FileMetadataRecord[]>(`/payment-proofs/${proofId}/files`),
    enabled: Boolean(proofId),
    staleTime: 2 * 60_000,
  });
}
