// Public booking lead submission hook (M17D).
//
// Anonymous, write-only access to the M17B public booking lead endpoint.
// The payload carries ONLY public-safe aggregated group context plus the
// visitor's minimum follow-up PII (name, WhatsApp phone, optional note and
// move-in date). Never send room IDs, room_code, exact room numbers, or
// propertyId — the backend rejects unknown fields and this module must never
// be extended to send them.
//
// `anonymous: true` makes the shared ApiClient skip the Authorization header
// AND the 401 single-flight refresh, so the public /kamar page can never
// trigger a login/refresh-token loop. A booking lead is NOT a confirmed
// booking; it never reserves a room or creates invoice/occupancy/resident
// records, and it never touches Payment Gateway or Smart Lock.

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { PublicCategory } from "@/hooks/usePublicRooms";

export type CreatePublicBookingLeadInput = {
  category: PublicCategory;
  gender: "male" | "female";
  buildingCode?: string;
  floorCode?: "A" | "B";
  publicGroupKey?: string;
  visitorName: string;
  visitorPhone: string;
  visitorMessage?: string;
  preferredMoveInDate?: string; // YYYY-MM-DD
};

// Safe public acknowledgment only (M17B contract). No PII echo, no property
// ID, no room data.
export type PublicBookingLeadResponse = {
  id: string;
  status: string;
  category: PublicCategory;
  gender: "male" | "female";
  createdAt: string;
  message: string;
};

// UX-only phone sanity check. The backend performs authoritative validation
// and normalization (0 / +62 -> 62xxxxxxxxxx), same normalization family as
// the WhatsApp CTA helper.
export function isLikelyWhatsAppPhone(raw: string): boolean {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  return digits.length >= 9 && digits.length <= 15;
}

export function createPublicBookingLead(
  input: CreatePublicBookingLeadInput,
): Promise<PublicBookingLeadResponse> {
  return apiClient.post<PublicBookingLeadResponse>("/public/booking-leads", input, {
    anonymous: true,
  });
}

export function useCreatePublicBookingLead(): UseMutationResult<
  PublicBookingLeadResponse,
  unknown,
  CreatePublicBookingLeadInput
> {
  return useMutation({ mutationFn: createPublicBookingLead });
}
