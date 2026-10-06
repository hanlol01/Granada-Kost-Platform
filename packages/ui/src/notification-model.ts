export type NotificationRole = "admin" | "owner" | "resident";
export type NotificationStatus = "unread" | "read" | "archived";
export type NotificationView = NotificationStatus | "active";
export type NotificationPriority = "urgent" | "high" | "normal" | "low";

export interface NotificationItem {
  id: string;
  category: string;
  title: string;
  body: string;
  priority: NotificationPriority;
  status: NotificationStatus;
  createdAt: string;
  readAt: string | null;
  expiresAt: string | null;
  relatedHref: string | null;
  superseded?: boolean;
}

export interface NotificationPage {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
  availableCategories: string[];
  availableAssets?: string[];
  limit: number;
  offset: number;
}

export interface NotificationFilters {
  status?: NotificationView;
  category?: string;
  priority?: NotificationPriority;
  search?: string;
  period?: string;
  asset?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export const notificationCategoryLabels: Record<string, string> = {
  booking: "Booking & kamar",
  payments: "Tagihan & pembayaran",
  rooms: "Kamar & hunian",
  lease: "Penyewaan & check-in",
  checkout: "Check-out & pengembalian dana",
  realization: "Realisasi Owner",
  transfer: "Transfer Owner",
  service: "Layanan & perawatan",
  account: "Akun & keamanan",
  system: "Informasi sistem",
  other: "Informasi lainnya",
};
export const notificationPriorityLabels: Record<NotificationPriority, string> =
  {
    urgent: "Mendesak",
    high: "Perlu perhatian",
    normal: "Informasi",
    low: "Informasi tambahan",
  };

// Defense in depth: destinations are resolved and authorized by the API first.
export function safeNotificationHref(
  href: string | null,
  role: NotificationRole,
): string | null {
  if (
    !href ||
    !href.startsWith("/") ||
    href.startsWith("//") ||
    /[\\\u0000-\u001f]/.test(href)
  )
    return null;
  const pathname = new URL(href, "https://notification.invalid").pathname;
  const allowed =
    role === "owner"
      ? /^\/property-owners\/portal(?:\/|$)/
      : role === "resident"
        ? /^\/(?:booking|billing|payments|rooms|kamar|lease|checkout|complaints|maintenance|profile|account|info|notifications)(?:\/|$)/
        : /^\/(?:booking-leads|payments|rooms|tenants|reports|complaints|maintenance|vehicles|property-owners|notifications|settings)(?:\/|$)/;
  return allowed.test(pathname) ? href : null;
}

export function notificationTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Waktu tidak tersedia"
    : new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }).format(date) + " WIB";
}

export function notificationErrorMessage(error: unknown): string {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? error.status
      : null;
  if (status === 403)
    return "Akses notifikasi ini tidak tersedia untuk akun Anda. Periksa akun atau properti yang sedang dipilih.";
  if (status === 404)
    return "Notifikasi ini tidak lagi tersedia dalam akses Anda. Perbarui daftar untuk melihat informasi terbaru.";
  return "Notifikasi belum dapat diperbarui. Periksa koneksi lalu coba lagi; status sebelumnya tetap dipertahankan.";
}
