export const REPORT_TYPES = [
  'leases',
  'payments',
  'expenses',
  'finance',
  'property-owners',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export type ReportScalar = string | number | boolean | null;
export type ReportRow = Record<string, ReportScalar>;

export type ReportResult = {
  report_type: ReportType;
  title: string;
  property_name: string;
  period: {
    date_from: string;
    date_to: string;
    label?: string;
  };
  generated_at: string;
  generated_by?: string;
  filter_checksum: string;
  methodology: string;
  filter_summary?: Array<[string, ReportScalar]>;
  summary: Record<string, number>;
  rows: ReportRow[];
  /** Optional audited appendices such as transfers, corrections, or exclusions. */
  additional_sheets?: Array<{ name: string; rows: ReportScalar[][] }>;
  meta: { limit: number; offset: number; total: number };
};
