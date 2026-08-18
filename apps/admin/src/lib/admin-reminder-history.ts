export type ReminderHistoryChannel = "whatsapp_manual" | "manual";
export type ReminderHistoryStatus = "previewed" | "external_opened" | "manual_sent" | "failed";

export type ReminderHistoryAttempt = {
  id: string;
  property_id: string;
  resident_id: string;
  actor_user_id: string;
  channel: ReminderHistoryChannel;
  outcome_status: ReminderHistoryStatus;
  invoice_ids: string[];
  invoice_count: number;
  total_outstanding_amount: number;
  template_version: number;
  recipient_name: string;
  room_number: string;
  outcome_note: string | null;
  created_at: string;
  archived_at: string | null;
};

export type ReminderHistoryResponse = {
  data: ReminderHistoryAttempt[];
  meta: { limit: number; offset: number; total: number };
};

export const reminderHistoryStatusLabels: Record<ReminderHistoryStatus, string> = {
  previewed: "Preview dibuat",
  external_opened: "WhatsApp dibuka",
  manual_sent: "Dikirim manual",
  failed: "Gagal",
};

export const reminderHistoryChannelLabels: Record<ReminderHistoryChannel, string> = {
  whatsapp_manual: "WhatsApp manual",
  manual: "Catatan manual",
};
