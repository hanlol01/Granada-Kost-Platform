export const REPORT_TYPES = ['leases', 'payments', 'expenses', 'finance'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export type ReportScalar = string | number | boolean | null;
export type ReportRow = Record<string, ReportScalar>;

export type ReportResult = {
  report_type: ReportType;
  title: string;
  property_name: string;
  period: { date_from: string; date_to: string };
  generated_at: string;
  filter_checksum: string;
  methodology: string;
  summary: Record<string, number>;
  rows: ReportRow[];
  meta: { limit: number; offset: number; total: number };
};
