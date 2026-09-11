import { useQuery } from "@tanstack/react-query";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import type { ReminderHistoryResponse } from "@/lib/admin-reminder-history";
import { useProperty } from "@/lib/property";

export function useResidentReminderHistory(
  residentId: string,
  options: { limit?: number; enabled?: boolean } = {},
) {
  const { currentPropertyId } = useProperty();
  const limit = options.limit ?? 20;
  return useQuery<ReminderHistoryResponse>({
    queryKey: ["reminders", "resident-history", currentPropertyId, residentId, limit] as const,
    queryFn: ({ signal }) =>
      adminUxV2Requester.get<ReminderHistoryResponse>("/admin/reminders/history", {
        query: {
          property_id: currentPropertyId ?? undefined,
          resident_id: residentId,
          limit,
          offset: 0,
        },
        signal,
      }),
    enabled: Boolean(currentPropertyId && residentId) && options.enabled !== false,
  });
}
