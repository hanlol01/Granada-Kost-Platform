// Public booking lead submission hook (M17D).
//
// Anonymous, write-only access to the M17B public booking lead endpoint.
// The payload carries ONLY category/gender context plus the visitor's minimum
// follow-up data. Never send room IDs, exact room numbers, building details, or
// propertyId — the backend rejects unknown fields and this module must never
// be extended to send them.
//
// `anonymous: true` makes the shared ApiClient skip the Authorization header
// AND the 401 single-flight refresh, so the public /kamar page can never
// trigger a login/refresh-token loop. A booking lead is NOT a confirmed
// booking; it never reserves a room or creates invoice/occupancy/resident
// records, and it never touches Payment Gateway or Smart Lock.

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient } from "@/lib/api";
import type { PublicCategory } from "@/hooks/usePublicRooms";

export type CreatePublicBookingLeadInput = {
  idempotencyKey: string;
  category: PublicCategory;
  gender: "male" | "female";
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  visitorUniversity: string;
  consent: true;
  visitorMessage?: string;
  preferredMoveInDate?: string; // YYYY-MM-DD
};

// Safe public acknowledgment only (M17B contract). No PII echo, no property
// ID, no room data.
export type PublicBookingLeadResponse = {
  reference: string;
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
  const { idempotencyKey, ...body } = input;
  return apiClient
    .post<unknown>("/public/booking-leads", body, {
      anonymous: true,
      idempotencyKey,
    })
    .then((raw) => parsePublicBookingLeadResponse(raw, input.category, input.gender));
}

const publicBookingLeadResponseSchema = z
  .object({
    reference: z.string().regex(/^MINAT-(RUKOST|APARTKOST)-[A-F0-9]{12}$/),
    status: z.literal("new"),
    category: z.enum(["rukost", "apartkost"]),
    gender: z.enum(["male", "female"]),
    createdAt: z.string().datetime(),
    message: z.string().min(1),
  })
  .strict();

export function parsePublicBookingLeadResponse(
  raw: unknown,
  expectedCategory?: PublicCategory,
  expectedGender?: "male" | "female",
): PublicBookingLeadResponse {
  return publicBookingLeadResponseSchema
    .superRefine((response, context) => {
      if (expectedCategory && response.category !== expectedCategory) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Lead category mismatch" });
      }
      if (expectedGender && response.gender !== expectedGender) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Lead gender mismatch" });
      }
    })
    .parse(raw);
}

export function useCreatePublicBookingLead(): UseMutationResult<
  PublicBookingLeadResponse,
  unknown,
  CreatePublicBookingLeadInput
> {
  return useMutation({ mutationFn: createPublicBookingLead });
}
