import { apiClient, getAccessToken } from "@/lib/api";
import { fetchPreviewAndDownload } from "@/lib/document-download";
import { env } from "@/lib/env";

export type OwnerReportReviewStatus =
  | "not_prepared"
  | "draft"
  | "ready_for_review"
  | "approved"
  | "paid"
  | "void";
export type OwnerReportPublicationStatus = "not_published" | "published";
export type OwnerReportPayoutStatus = "not_paid" | "partially_paid" | "paid";

export type OwnerSettlementReportRow = {
  owner_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  room_count: number;
  occupied_room_count: number;
  earning_count: number;
  settlement_id: string | null;
  review_status: OwnerReportReviewStatus;
  publication_status: OwnerReportPublicationStatus;
  payout_status: OwnerReportPayoutStatus;
  gross_amount: string;
  operator_fee_amount: string;
  owner_amount: string;
  payout_recorded: string;
  payout_outstanding: string;
  document_number: string | null;
  published_at: string | null;
};

export type OwnerSettlementReportList = {
  period: string;
  generated_at: string;
  summary: {
    owners: number;
    owner_amount: number;
    published_amount: number;
    payout_recorded: number;
    payout_outstanding: number;
  };
  data: OwnerSettlementReportRow[];
  meta: { limit: number; offset: number; total: number };
};

export type OwnerSettlementDetail = {
  owner: { id: string; full_name: string; phone: string | null; email: string | null };
  period: string;
  settlement: null | {
    id: string;
    settlement_status: OwnerReportReviewStatus;
    gross_amount: string;
    owner_amount: string;
    operator_fee_amount: string;
    notes: string | null;
    document_number: string | null;
    published_at: string | null;
    payout_recorded: string;
  };
  lines: Array<{
    earning_id: string;
    room_code: string;
    category: "rukost" | "apartkost";
    building_name: string | null;
    resident_name: string | null;
    lease_code: string | null;
    term_months: number | null;
    start_date: string | null;
    end_date: string | null;
    contract_value: string | null;
    verified_collection: string;
    service_from: string;
    service_until: string;
    gross_amount: string;
    operator_fee_amount: string;
    owner_amount: string;
  }>;
  payouts: Array<{
    id: string;
    payout_kind: "payout" | "reversal";
    payout_amount: string;
    payout_method: "bank_transfer" | "cash" | "other";
    payout_reference: string;
    destination_mask: string;
    transferred_at: string;
  }>;
  adjustments: Array<{
    id: string;
    adjustment_kind: "reversal" | "refund" | "transfer_proration" | "clawback";
    gross_amount_delta: string;
    owner_amount_delta: string;
    operator_fee_amount_delta: string;
    reason: string;
    created_at: string;
  }>;
};

export type OwnerSettlementFilters = {
  property_id: string;
  period: string;
  q?: string;
  category?: string;
  review_status?: string;
  publication_status?: string;
  payout_status?: string;
  actionable_only?: string;
  limit?: number;
  offset?: number;
};

const path = (ownerId: string, action: string) =>
  `/admin/property-owner-reports/${encodeURIComponent(ownerId)}/${action}`;

export const ownerSettlementReportApi = {
  list: (filters: OwnerSettlementFilters) =>
    apiClient.get<OwnerSettlementReportList>("/admin/property-owner-reports", {
      query: filters,
      unwrapData: false,
    }),
  detail: (propertyId: string, ownerId: string, period: string) =>
    apiClient.get<OwnerSettlementDetail>(
      `/admin/property-owner-reports/${encodeURIComponent(ownerId)}/periods/${encodeURIComponent(period)}`,
      { query: { property_id: propertyId } },
    ),
  command: (
    ownerId: string,
    action: "prepare" | "submit-review" | "approve" | "publish",
    body: { property_id: string; period: string; notes?: string },
  ) => apiClient.post(path(ownerId, action), body, { idempotencyKey: crypto.randomUUID() }),
  payout: (
    ownerId: string,
    body: {
      property_id: string;
      period: string;
      amount: number;
      method: "bank_transfer" | "cash" | "other";
      reference: string;
      destination_mask: string;
      transferred_at: string;
    },
  ) => apiClient.post(path(ownerId, "payouts"), body, { idempotencyKey: crypto.randomUUID() }),
  adjustment: (
    ownerId: string,
    body: {
      property_id: string;
      period: string;
      adjustment_kind: "reversal" | "refund" | "transfer_proration" | "clawback";
      gross_amount_delta: number;
      owner_amount_delta: number;
      operator_fee_amount_delta: number;
      reason: string;
      earning_id: string;
    },
  ) => apiClient.post(path(ownerId, "adjustments"), body, { idempotencyKey: crypto.randomUUID() }),
};

export async function downloadOwnerSettlementReport(
  format: "pdf" | "xlsx",
  propertyId: string,
  period: string,
) {
  const [year, month] = period.split("-").map(Number);
  const dateFrom = `${period}-01`;
  const dateTo = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const query = new URLSearchParams({
    property_id: propertyId,
    date_from: dateFrom,
    date_to: dateTo,
    format,
  });
  await fetchPreviewAndDownload(
    async () => {
      const token = getAccessToken();
      const response = await fetch(
        `${env.VITE_API_BASE_URL}/reports/property-owners/export?${query.toString()}`,
        {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
      if (!response.ok) throw new Error(`Ekspor laporan Owner gagal (HTTP ${response.status}).`);
      return response;
    },
    `laporan-owner-${period}.${format}`,
    { preview: format === "pdf" },
  );
}
