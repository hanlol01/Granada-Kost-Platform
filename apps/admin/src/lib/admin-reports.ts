import { apiClient, getAccessToken } from "@/lib/api";
import { fetchPreviewAndDownload } from "@/lib/document-download";
import { env } from "@/lib/env";

export type AdminReportType = "leases" | "payments" | "expenses" | "finance";
export type ReportScalar = string | number | boolean | null;

export type AdminReportFilters = {
  property_id: string;
  date_from: string;
  date_to: string;
  q?: string;
  status?: string;
  category?: string;
  building_id?: string;
  gender?: string;
  method?: string;
  purpose?: string;
  payment_plan?: string;
  date_basis?: string;
  has_evidence?: string;
  limit?: number;
  offset?: number;
};

export type AdminReport = {
  report_type: AdminReportType;
  title: string;
  property_name: string;
  period: { date_from: string; date_to: string };
  generated_at: string;
  filter_checksum: string;
  methodology: string;
  summary: Record<string, number>;
  rows: Array<Record<string, ReportScalar>>;
  meta: { limit: number; offset: number; total: number };
};

export function getAdminReport(type: AdminReportType, filters: AdminReportFilters) {
  return apiClient.get<AdminReport>(`/reports/${type}/preview`, { query: filters });
}

export async function downloadAdminReport(
  type: AdminReportType,
  format: "pdf" | "xlsx",
  filters: AdminReportFilters,
) {
  const query = new URLSearchParams();
  Object.entries({ ...filters, format }).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  await fetchPreviewAndDownload(
    async () => {
      const token = getAccessToken();
      const response = await fetch(`${env.VITE_API_BASE_URL}/reports/${type}/export?${query}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) throw new Error(`Ekspor laporan gagal (HTTP ${response.status}).`);
      return response;
    },
    `${type}-${filters.date_from}-${filters.date_to}.${format}`,
    { preview: format === "pdf" },
  );
}
