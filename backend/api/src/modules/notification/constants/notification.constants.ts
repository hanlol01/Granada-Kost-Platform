import { NotificationPriority } from '../types/notification.types';

export const NOTIFICATION_AUDIT_ACTIONS = {
  create: 'notification.create',
  read: 'notification.read',
  archive: 'notification.archive',
  deliveryQueued: 'notification.delivery.queued',
  deliverySent: 'notification.delivery.sent',
  deliveryFailed: 'notification.delivery.failed',
  preferenceUpdate: 'notification.preference.update',
} as const;

export const NOTIFICATION_DEFAULTS = {
  retentionDays: 90,
  maxDeliveryAttempts: 5,
  brevoDailyLimit: 300,
  brevoQuotaWarningThreshold: 0.8,
} as const;

export const NOTIFICATION_TYPES = {
  billingInvoiceIssued: 'billing.invoice_issued',
  billingOverdue: 'billing.invoice_overdue',
  complaintCreated: 'complaint.created',
  complaintResolved: 'complaint.resolved',
  workOrderAssigned: 'maintenance.work_order_assigned',
  vehicleApproved: 'vehicle.approved',
  occupancyCheckIn: 'occupancy.check_in_completed',
  occupancyCheckOut: 'occupancy.check_out_finalized',
} as const;

export type NotificationTemplateCode = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export type NotificationTemplateDefinition = {
  code: NotificationTemplateCode;
  priority: NotificationPriority;
  title: string;
  body: string;
  subject?: string;
  html?: string;
  emailEnabled: boolean;
};

export const NOTIFICATION_TEMPLATES: Record<NotificationTemplateCode, NotificationTemplateDefinition> = {
  [NOTIFICATION_TYPES.billingInvoiceIssued]: {
    code: NOTIFICATION_TYPES.billingInvoiceIssued,
    priority: 'normal',
    title: 'Tagihan {{period}} sudah terbit',
    body: 'Tagihan {{period}} sebesar {{amount}} untuk kamar {{room_number}} sudah terbit. Jatuh tempo {{due_date}}.',
    subject: 'Tagihan {{period}} Granada Kost',
    html: '<p>Tagihan {{period}} sebesar <strong>{{amount}}</strong> untuk kamar {{room_number}} sudah terbit.</p><p>Jatuh tempo {{due_date}}.</p>',
    emailEnabled: true,
  },
  [NOTIFICATION_TYPES.billingOverdue]: {
    code: NOTIFICATION_TYPES.billingOverdue,
    priority: 'high',
    title: 'Tagihan {{period}} melewati jatuh tempo',
    body: 'Tagihan {{period}} untuk kamar {{room_number}} sudah overdue. Total outstanding {{outstanding_amount}}.',
    subject: 'Tagihan Granada Kost Overdue',
    html: '<p>Tagihan {{period}} untuk kamar {{room_number}} sudah overdue.</p><p>Total outstanding: <strong>{{outstanding_amount}}</strong>.</p>',
    emailEnabled: true,
  },
  [NOTIFICATION_TYPES.complaintCreated]: {
    code: NOTIFICATION_TYPES.complaintCreated,
    priority: 'normal',
    title: 'Complaint baru: {{complaint_title}}',
    body: 'Complaint {{complaint_code}} dibuat oleh {{resident_name}}.',
    emailEnabled: false,
  },
  [NOTIFICATION_TYPES.complaintResolved]: {
    code: NOTIFICATION_TYPES.complaintResolved,
    priority: 'high',
    title: 'Complaint {{complaint_code}} selesai',
    body: 'Complaint {{complaint_title}} telah diselesaikan. Silakan cek detail di aplikasi.',
    subject: 'Complaint Granada Kost selesai',
    html: '<p>Complaint <strong>{{complaint_title}}</strong> telah diselesaikan.</p>',
    emailEnabled: true,
  },
  [NOTIFICATION_TYPES.workOrderAssigned]: {
    code: NOTIFICATION_TYPES.workOrderAssigned,
    priority: 'high',
    title: 'Work order baru: {{work_order_title}}',
    body: 'Work order {{work_order_code}} telah ditugaskan kepada Anda.',
    subject: 'Work order baru Granada Kost',
    html: '<p>Work order <strong>{{work_order_code}}</strong> telah ditugaskan kepada Anda.</p>',
    emailEnabled: true,
  },
  [NOTIFICATION_TYPES.vehicleApproved]: {
    code: NOTIFICATION_TYPES.vehicleApproved,
    priority: 'normal',
    title: 'Kendaraan {{plate_number}} disetujui',
    body: 'Kendaraan {{plate_number}} telah aktif untuk property {{property_name}}.',
    emailEnabled: false,
  },
  [NOTIFICATION_TYPES.occupancyCheckIn]: {
    code: NOTIFICATION_TYPES.occupancyCheckIn,
    priority: 'normal',
    title: 'Check-in berhasil',
    body: 'Check-in kamar {{room_number}} berhasil pada {{check_in_date}}.',
    subject: 'Check-in Granada Kost berhasil',
    html: '<p>Check-in kamar <strong>{{room_number}}</strong> berhasil pada {{check_in_date}}.</p>',
    emailEnabled: true,
  },
  [NOTIFICATION_TYPES.occupancyCheckOut]: {
    code: NOTIFICATION_TYPES.occupancyCheckOut,
    priority: 'normal',
    title: 'Check-out selesai',
    body: 'Check-out kamar {{room_number}} telah selesai pada {{check_out_date}}.',
    subject: 'Check-out Granada Kost selesai',
    html: '<p>Check-out kamar <strong>{{room_number}}</strong> telah selesai pada {{check_out_date}}.</p>',
    emailEnabled: true,
  },
};
