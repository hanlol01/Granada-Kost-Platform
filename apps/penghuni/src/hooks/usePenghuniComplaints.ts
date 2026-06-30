// Penghuni complaints domain hook.
//
// Backend (MyComplaintController @Controller('my/complaints')):
//   GET  /my/complaints?limit=&offset=
//   GET  /my/complaints/:id
//   POST /my/complaints   (CreateMyComplaintDto: { category_id, title, description, ... })
//
// IMPORTANT: GET /complaint-categories requires the `complaint.manage`
// permission and is therefore NOT callable by a `resident` token (see
// backend/api/src/modules/complaint/controllers/complaint-category.controller.ts).
// Without a category UUID picker the create form cannot satisfy backend
// validation, so the create mutation is exported but the Penghuni UI keeps
// the submit button disabled with a clear label until a resident-scoped
// category endpoint ships in a future milestone.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { qk } from "@/lib/query-client";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";

export type MyComplaintPriority = "low" | "medium" | "high" | "urgent";
export type MyComplaintStatus =
  | "submitted"
  | "acknowledged"
  | "in_progress"
  | "on_hold"
  | "escalated"
  | "resolved"
  | "reopened"
  | "closed"
  | "cancelled";

export type MyComplaintRecord = {
  id: string;
  propertyId: string;
  residentId: string;
  roomId: string | null;
  categoryId: string;
  complaintCode: string;
  title: string;
  description: string;
  priority: MyComplaintPriority;
  complaintStatus: MyComplaintStatus;
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

export function useMyComplaints(
  filters: { limit?: number; offset?: number } = {},
): UseQueryResult<MyComplaintRecord[]> {
  return useQuery<MyComplaintRecord[]>({
    queryKey: qk.penghuni.complaints(filters),
    queryFn: () =>
      apiClient.get<MyComplaintRecord[]>("/my/complaints", {
        query: { limit: filters.limit ?? 50, offset: filters.offset },
      }),
  });
}

export type CreateMyComplaintInput = {
  category_id: string;
  room_id?: string;
  title: string;
  description: string;
  location_note?: string;
};

export function useCreateMyComplaint() {
  const queryClient = useQueryClient();
  return useMutation<MyComplaintRecord, unknown, CreateMyComplaintInput>({
    mutationFn: (body) =>
      apiClient.post<MyComplaintRecord>("/my/complaints", body, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: async () => {
      toastMutationSuccess("Tiket berhasil dibuat");
      await queryClient.invalidateQueries({ queryKey: qk.penghuni.complaints() });
      await queryClient.invalidateQueries({ queryKey: qk.penghuni.notifications() });
    },
    onError: (err) => toastMutationError(err, "Gagal membuat tiket"),
  });
}
