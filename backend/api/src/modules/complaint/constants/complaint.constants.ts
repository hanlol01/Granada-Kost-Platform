import { ComplaintPriority, ComplaintStatus, StoredComplaintStatus } from '../types/complaint.types';

export const COMPLAINT_PRIORITIES: ComplaintPriority[] = ['low', 'medium', 'high', 'urgent'];

export const COMPLAINT_STATUSES: StoredComplaintStatus[] = [
  'submitted',
  'acknowledged',
  'in_progress',
  'on_hold',
  'escalated',
  'resolved',
  'reopened',
  'closed',
  'cancelled',
];

export const COMPLAINT_WORKFLOW_ACTIONS = {
  create: 'submitted',
  acknowledge: 'acknowledged',
  assign: 'assigned',
  start: 'in_progress',
  hold: 'on_hold',
  resolve: 'resolved',
  close: 'closed',
  reopen: 'reopened',
  cancel: 'cancelled',
} as const satisfies Record<string, ComplaintStatus>;

export const COMPLAINT_AUDIT_ACTIONS = {
  create: 'complaint.create',
  acknowledge: 'complaint.acknowledge',
  assign: 'complaint.assign',
  resolve: 'complaint.resolve',
  close: 'complaint.close',
  reopen: 'complaint.reopen',
  cancel: 'complaint.cancel',
  fileAttach: 'complaint.file_attach',
} as const;

export const COMPLAINT_SLA_TARGETS = {
  urgent: { responseHours: 2, resolutionHours: 24 },
  high: { responseHours: 4, resolutionHours: 48 },
  medium: { responseHours: 8, resolutionHours: 24 * 5 },
  low: { responseHours: 24, resolutionHours: 24 * 10 },
} as const satisfies Record<ComplaintPriority, { responseHours: number; resolutionHours: number }>;
