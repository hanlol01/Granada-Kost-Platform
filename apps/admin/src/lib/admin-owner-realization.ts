import { apiClient, getAccessToken } from "@/lib/api";
import { fetchPreviewAndDownload } from "@/lib/document-download";
import { env } from "@/lib/env";

export type OwnerRealizationStatus =
  | "draft"
  | "awaiting_review"
  | "approved"
  | "submitted_to_finance"
  | "awaiting_transfer"
  | "partially_realized"
  | "realized"
  | "published_to_owner"
  | "void";

export type OwnerRealizationFilters = {
  property_id: string;
  period?: string;
  q?: string;
  status?: OwnerRealizationStatus | "not_prepared";
  workspace?: "active" | "history" | "not_eligible";
  owner_profile_status?: "active" | "archived" | "all";
  offset?: number;
  limit?: number;
};

export type OwnerRealizationRow = {
  owner_id: string;
  owner_name: string;
  owner_phone: string | null;
  owner_profile_status: "active" | "archived";
  owner_asset_summary: string;
  plot_number: string | null;
  assets: Array<{
    id: string;
    building_code: string | null;
    building_name: string | null;
    plot_number: string | null;
    snapshot_incomplete?: boolean;
    rooms: Array<{
      id: string;
      room_code: string;
      plot_number: string | null;
      resident_name: string | null;
      contract_total: string;
      management_fee: string;
      realization_total: string;
    }>;
  }>;
  room_count: number;
  eligible_contract_count: number;
  eligible_contract_total: string;
  management_fee_total: string;
  realization_total: string;
  transferred_total: string;
  eligible_lease_ids: string[];
  eligible_leases: Array<{
    id: string;
    room_code: string;
    resident_name: string;
    contract_total: string;
    management_fee: string;
    realization_total: string;
  }>;
  realization: null | {
    id: string;
    reference: string;
    status: OwnerRealizationStatus;
    period: string;
    entry_kind: "system" | "historical_manual" | "historical_import";
    realization_total: string;
    transferred_total: string;
    published_at: string | null;
  };
  latest_realization: null | {
    period: string;
    status: OwnerRealizationStatus;
    reference: string;
    transferred_total: string;
    realized_at: string | null;
  };
  action: "prepare" | "view_detail" | "none";
};

export type OwnerRealizationOwnerCounts = {
  total: number;
  published: number;
  waiting_publication: number;
  voided: number;
};

export type OwnerRealizationList = {
  period: string | null;
  rows: OwnerRealizationRow[];
  meta: { offset: number; limit: number; total: number };
  summary: {
    eligible_contract_total: number;
    management_fee_total: number;
    realization_total: number;
    transferred_total: number;
    owner_counts: OwnerRealizationOwnerCounts;
  };
};

export type OwnerRealizationDetail = {
  realization: {
    id: string;
    reference: string;
    status: OwnerRealizationStatus;
    period: string;
    entry_kind: "system" | "historical_manual" | "historical_import";
    owner_id: string;
    owner_name: string;
    owner_snapshot: Record<string, unknown>;
    scope_snapshot: Record<string, unknown>;
    tariff_snapshot: Record<string, unknown>;
    room_count: number;
    eligible_contract_total: string;
    management_fee_total: string;
    correction_total: string;
    realization_total: string;
    transferred_total: string;
    notes: string | null;
    historical_source: string | null;
    prepared_at: string;
    submitted_for_review_at: string | null;
    approved_at: string | null;
    submitted_to_finance_at: string | null;
    awaiting_transfer_at: string | null;
    realized_at: string | null;
  };
  lines: Array<Record<string, unknown>>;
  corrections: Array<Record<string, unknown>>;
  transfers: Array<Record<string, unknown>>;
  recovery_events: Array<Record<string, unknown>>;
  finance_confirmers?: string[];
  documents: Array<Record<string, unknown>>;
  not_eligible: Array<Record<string, unknown>>;
};

export type OwnerRealizationNotEligible = {
  period: string;
  rows: Array<{
    lease_id: string;
    room_code: string;
    resident_name: string;
    owner_name: string;
    owner_profile_status: "active" | "archived" | null;
    contract_rent_amount: string;
    reason_code: string;
    reason_label?: string;
  }>;
  meta: { offset: number; limit: number; total: number };
};

const base = "/admin/property-owner-realizations";

export const ownerRealizationApi = {
  list: (filters: OwnerRealizationFilters) =>
    apiClient.get<OwnerRealizationList>(base, { query: filters }),
  historicalSources: (propertyId: string) =>
    apiClient.get<{ items: string[] }>(`${base}/historical-sources`, {
      query: { property_id: propertyId },
    }),
  financeConfirmers: (propertyId: string) =>
    apiClient.get<{ items: string[] }>(`${base}/finance-confirmers`, {
      query: { property_id: propertyId },
    }),
  detail: (realizationId: string, propertyId: string) =>
    apiClient.get<OwnerRealizationDetail>(`${base}/${encodeURIComponent(realizationId)}`, {
      query: { property_id: propertyId },
    }),
  notEligible: (filters: OwnerRealizationFilters) =>
    apiClient.get<OwnerRealizationNotEligible>(`${base}/not-eligible`, { query: filters }),
  prepare: (
    ownerId: string,
    body: {
      property_id: string;
      period: string;
      notes?: string;
      selected_lease_ids?: string[];
    },
  ) =>
    apiClient.post(`${base}/owners/${encodeURIComponent(ownerId)}/prepare`, body, {
      idempotencyKey: crypto.randomUUID(),
    }),
  voidDraft: (realizationId: string, body: { property_id: string; reason: string }) =>
    apiClient.post(`${base}/${encodeURIComponent(realizationId)}/void-draft`, body, {
      idempotencyKey: crypto.randomUUID(),
    }),
  cancel: (realizationId: string, body: { property_id: string; reason: string }) =>
    apiClient.post(`${base}/${encodeURIComponent(realizationId)}/void`, body, {
      idempotencyKey: crypto.randomUUID(),
    }),
  transition: (
    realizationId: string,
    action:
      | "submit-review"
      | "approve"
      | "return-draft"
      | "submit-finance"
      | "awaiting-transfer"
      | "publish",
    body: { property_id: string; note: string },
  ) =>
    apiClient.post(`${base}/${encodeURIComponent(realizationId)}/${action}`, body, {
      idempotencyKey: crypto.randomUUID(),
    }),
  correction: (
    realizationId: string,
    body: {
      property_id: string;
      correction_kind:
        | "contract_correction"
        | "transfer_recovery"
        | "approved_operational_adjustment";
      amount: number;
      reason: string;
      evidence_reference?: string;
      source_reference?: string;
      recovery_disposition?:
        | "recover_from_owner"
        | "net_against_future_realization"
        | "outside_system_finance";
      evidence_file_ids?: string[];
    },
  ) =>
    apiClient.post(`${base}/${encodeURIComponent(realizationId)}/corrections`, body, {
      idempotencyKey: crypto.randomUUID(),
    }),
  transfer: (
    realizationId: string,
    body: {
      property_id: string;
      amount: number;
      method: "bank_transfer";
      reference: string;
      transferred_at: string;
      evidence_reference?: string;
      evidence_file_ids?: string[];
      finance_confirmed_by?: string;
      finance_confirmation_channel?: "telepon" | "pesan" | "email" | "tatap_muka";
      finance_confirmed_at?: string;
      legacy_evidence_reason?: string;
      legacy_evidence_source?: string;
    },
  ) =>
    apiClient.post(`${base}/${encodeURIComponent(realizationId)}/transfers`, body, {
      idempotencyKey: crypto.randomUUID(),
    }),
  recoveryEvent: (
    realizationId: string,
    correctionId: string,
    body: {
      property_id: string;
      amount: number;
      occurred_at: string;
      finance_reference?: string;
      note: string;
      evidence_file_ids?: string[];
    },
  ) =>
    apiClient.post(
      `${base}/${encodeURIComponent(realizationId)}/corrections/${encodeURIComponent(correctionId)}/recovery-events`,
      body,
      {
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  historical: (
    ownerId: string,
    body: {
      property_id: string;
      period: string;
      entry_kind: "historical_manual" | "historical_import";
      historical_source: string;
      notes?: string;
      lines: Array<{
        lease_id?: string;
        room_code: string;
        resident_name: string;
        contract_total: number;
        management_fee: number;
        correction_amount?: number;
        legacy_reference?: string;
        duration_months?: number;
        payment_completed_at?: string;
        check_in_at?: string;
        check_out_at?: string;
      }>;
      transfer_amount?: number;
      transfer_method?: "bank_transfer";
      transfer_reference?: string;
      transfer_evidence_reference?: string;
      transferred_at?: string;
      transfers?: Array<{
        amount: number;
        method: "bank_transfer";
        reference: string;
        transferred_at: string;
        evidence_reference?: string;
        evidence_file_ids?: string[];
        legacy_evidence_reason?: string;
        finance_confirmed_by?: string;
        finance_confirmation_channel?: "telepon" | "pesan" | "email" | "tatap_muka";
        finance_confirmed_at?: string;
      }>;
    },
  ) =>
    apiClient.post(`${base}/owners/${encodeURIComponent(ownerId)}/historical`, body, {
      idempotencyKey: crypto.randomUUID(),
    }),
};

async function download(path: string, fallbackName: string) {
  await fetchPreviewAndDownload(
    async () => {
      const token = getAccessToken();
      const response = await fetch(`${env.VITE_API_BASE_URL}${path}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as {
          error?: { message?: unknown };
          message?: unknown;
        } | null;
        const message =
          typeof payload?.error?.message === "string"
            ? payload.error.message
            : typeof payload?.message === "string"
              ? payload.message
              : `Unduhan Realisasi Owner gagal (HTTP ${response.status}).`;
        throw new Error(message);
      }
      return response;
    },
    fallbackName,
    { preview: path.includes("format=pdf") || path.endsWith("/receipt") },
  );
}

export function downloadOwnerRealization(
  realizationId: string,
  propertyId: string,
  format: "pdf" | "xlsx",
) {
  return download(
    `${base}/${encodeURIComponent(realizationId)}/export?${new URLSearchParams({ property_id: propertyId, format })}`,
    `realisasi-owner.${format}`,
  );
}

export function downloadOwnerRealizationQueue(
  filters: OwnerRealizationFilters,
  format: "pdf" | "xlsx",
) {
  const parameters = new URLSearchParams({ format });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") parameters.set(key, String(value));
  }
  return download(`${base}/export?${parameters.toString()}`, `antrian-realisasi-owner.${format}`);
}

export function downloadOwnerRealizationNotEligible(
  filters: OwnerRealizationFilters,
  format: "pdf" | "xlsx",
) {
  const parameters = new URLSearchParams({ format });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") parameters.set(key, String(value));
  }
  return download(
    `${base}/not-eligible/export?${parameters.toString()}`,
    `tidak-layak-realisasi-owner.${format}`,
  );
}

export function downloadOwnerRealizationFinanceRequest(
  filters: OwnerRealizationFilters,
  format: "pdf" | "xlsx",
) {
  const parameters = new URLSearchParams({ format });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") parameters.set(key, String(value));
  }
  parameters.set("workspace", "history");
  return download(
    `${base}/finance-request/export?${parameters.toString()}`,
    `form-pengajuan-realisasi-passive-income.${format}`,
  );
}

export function downloadOwnerRealizationReceipt(
  realizationId: string,
  transferId: string,
  propertyId: string,
) {
  return download(
    `${base}/${encodeURIComponent(realizationId)}/transfers/${encodeURIComponent(transferId)}/receipt?${new URLSearchParams({ property_id: propertyId })}`,
    "kuitansi-realisasi-owner.pdf",
  );
}
