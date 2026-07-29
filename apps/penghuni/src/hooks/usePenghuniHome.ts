// Penghuni home composition hook.
//
// Composes existing domain hooks instead of calling a dedicated /home endpoint
// (one does not exist in Phase 1). The home page is a read-only roll-up of:
//   - /my/resident-context + auth/me via usePenghuniProfile()
//   - /my/invoices       via useMyInvoices() -> first relevant invoice
//   - /my/payments       via useMyPayments() -> most recent few
//   - /my/notifications/unread-count for the bell badge
//
// Resident-context state remains independent from billing state so a missing
// or invalid context never fabricates or suppresses authoritative billing.

import {
  selectCurrentInvoice,
  useMyInvoices,
  useMyPayments,
  type MyInvoiceRecord,
  type MyPaymentRecord,
} from "./usePenghuniBilling";
import { useUnreadCount } from "./usePenghuniNotifications";
import { usePenghuniProfile, type PenghuniProfileView } from "./usePenghuniProfile";

export type PenghuniHomeView = {
  profile: PenghuniProfileView;
  currentInvoice: MyInvoiceRecord | null;
  recentPayments: MyPaymentRecord[];
  unreadNotifications: number;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<void>;
};

export function usePenghuniHome(): PenghuniHomeView {
  const profile = usePenghuniProfile();
  const invoices = useMyInvoices({ limit: 12 });
  const payments = useMyPayments({ limit: 5 });
  const unread = useUnreadCount();

  const isLoading = invoices.isLoading || payments.isLoading || unread.isLoading;
  const isError = invoices.isError || payments.isError;
  const error = invoices.error ?? payments.error;

  return {
    profile,
    currentInvoice: selectCurrentInvoice(invoices.data),
    recentPayments: payments.data ?? [],
    unreadNotifications: unread.data ?? 0,
    isLoading,
    isError,
    error,
    refetch: async () => {
      await Promise.all([invoices.refetch(), payments.refetch(), unread.refetch()]);
    },
  };
}
