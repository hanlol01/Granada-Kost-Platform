// Complaints + complaint categories. Backend: @Controller('complaints') and
// @Controller('complaint-categories'). Both require complaint.manage permission;
// the AuthGuard already ensures the user is authenticated, but a 403 here will
// surface through the normalized ApiError pipeline (ADR-FE-008).

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useProperty } from "@/lib/property";

export type ComplaintPriority = "low" | "medium" | "high" | "urgent";
export type StoredComplaintStatus =
  | "submitted"
  | "acknowledged"
  | "in_progress"
  | "on_hold"
  | "escalated"
  | "resolved"
  | "reopened"
  | "closed"
  | "cancelled";

export type ComplaintRecord = {
  id: string;
  propertyId: string;
  residentId: string;
  roomId: string | null;
  categoryId: string;
  complaintCode: string;
  title: string;
  description: string;
  priority: ComplaintPriority;
  complaintStatus: StoredComplaintStatus;
  reopenCount: number;
  responseSlaBreached: boolean;
  resolutionSlaBreached: boolean;
  locationNote: string | null;
  assignedToUserId: string | null;
  submittedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  snapshotRoomNumber: string | null;
  snapshotResidentName: string;
  createdAt: string;
  updatedAt: string;
};

export type ComplaintCategoryRecord = {
  id: string;
  propertyId: string;
  name: string;
  normalizedCode: string;
  defaultPriority: ComplaintPriority;
  description: string | null;
  icon: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type UseComplaintsFilters = {
  status?: StoredComplaintStatus;
  limit?: number;
  offset?: number;
};

export function useComplaints(
  filters: UseComplaintsFilters = {},
): UseQueryResult<ComplaintRecord[]> {
  const { currentPropertyId } = useProperty();
  return useQuery<ComplaintRecord[]>({
    queryKey: ["complaints", "list", { propertyId: currentPropertyId }, filters] as const,
    queryFn: () =>
      apiClient.get<ComplaintRecord[]>("/complaints", {
        query: {
          property_id: currentPropertyId ?? undefined,
          status: filters.status,
          limit: filters.limit ?? 50,
          offset: filters.offset,
        },
      }),
    enabled: Boolean(currentPropertyId),
  });
}

export function useComplaintCategories(): UseQueryResult<ComplaintCategoryRecord[]> {
  const { currentPropertyId } = useProperty();
  return useQuery<ComplaintCategoryRecord[]>({
    queryKey: ["complaints", "categories", { propertyId: currentPropertyId }] as const,
    queryFn: () =>
      apiClient.get<ComplaintCategoryRecord[]>("/complaint-categories", {
        query: { property_id: currentPropertyId ?? undefined },
      }),
    // Categories are master data — slightly longer cache lifetime per ADR-FE-002.
    staleTime: 5 * 60_000,
    enabled: Boolean(currentPropertyId),
  });
}
