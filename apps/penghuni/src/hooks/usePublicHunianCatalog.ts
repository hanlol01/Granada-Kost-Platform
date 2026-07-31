// Public hunian catalog hooks (M18C list + M18D detail + M19D gallery).
//
// Anonymous, read-only access to the M18B public hunian catalog API:
//   GET /api/v1/public/hunian-catalog        (list + gender/category filters)
//   GET /api/v1/public/hunian-catalog/:slug  (public-safe detail)
//
// The API returns ONLY public-safe hunian/unit/group offerings (M18A frozen
// allowlist): no room IDs, no room_code, no exact room numbers, no tenant/
// resident/occupancy data, no payment/invoice data, no Smart Lock data.
// This module must never be extended to request or render such data.
//
// M19D: `galleryPreview`/`gallery` carry the frozen M19B public gallery image
// shape (objects, not URL strings) — see `PublicHunianGalleryImage` below.
//
// `anonymous: true` makes the shared ApiClient skip the Authorization header
// AND the 401 single-flight refresh, so the public /kamar pages can never
// trigger a login/refresh-token loop.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ApiError, ERROR_CODES } from "@granada-kost/api-client";
import { z } from "zod";
import { apiClient } from "@/lib/api";
import { env } from "@/lib/env";
import type { PublicCategory, PublicGender, PublicRoomGroup } from "@/hooks/usePublicRooms";

// API-level gender values (M18B contract). The /kamar URL keeps the M16E
// `putra`/`putri` params for shareable-link backward compatibility and maps
// them to the API values at this query layer.
export type PublicHunianGender = "male" | "female";

// M19B/M19D public gallery image — the frozen M19A Section 1 public response
// allowlist. ONLY these fields exist publicly. The backend never sends (and
// this type must never be extended with) storage_path/file paths, internal
// fileId, roomId/room_code/exact room numbers, uploader identity, or any
// private metadata. `contentUrl` is the backend-mediated public media path
// (GET /api/v1/public/hunian-gallery/:id/content), never a storage URL.
export type PublicHunianGalleryImage = {
  contentUrl: string;
  thumbnailUrl: string | null;
  altText: string;
  caption: string | null;
  sortOrder: number;
  isCover: boolean;
};

// Resolve an M19B backend-mediated media path against the configured API base
// URL (same origin convention as the ApiClient). Handles absolute URLs,
// absolute `/api/...` paths, and paths relative to the API base. This helper
// never constructs storage/file-system URLs — it only joins the allowlisted
// `contentUrl`/`thumbnailUrl` values onto the API origin.
export function resolveGalleryImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = env.VITE_API_BASE_URL.replace(/\/+$/, "");
  if (path.startsWith("/api/")) {
    // Absolute API path: join onto the API origin (falls back to the
    // same-origin absolute path when the base itself is relative).
    try {
      return new URL(path, base).toString();
    } catch {
      return path;
    }
  }
  return `${base}/${path.replace(/^\/+/, "")}`;
}

// Prefill context for the existing M17 lead form. Maps 1:1 onto the
// `POST /api/v1/public/booking-leads` payload context (M18A rule) — no new
// lead fields are introduced by M18.
export type PublicHunianBookingLeadDefaults = {
  category: PublicCategory;
};

export type PublicHunianGenderAvailability = {
  gender: PublicHunianGender;
  genderLabel: string;
  availabilityCount: number;
};

// M18B list item (allowlisted public-safe fields only).
export type PublicHunianCatalogItem = {
  slug: string;
  title: string;
  category: PublicCategory;
  categoryLabel: string;
  shortDescription: string;
  priceFromMonthly: number | null;
  priceFromYearly: number | null;
  availabilityCount: number;
  facilitiesPreview: string[];
  // M19B: cover image or first public-visible image only; [] when unpublished.
  galleryPreview: PublicHunianGalleryImage[] | null;
  ctaLabel: string;
  bookingLeadDefaults: PublicHunianBookingLeadDefaults;
  disclaimers: string[];
  leaseMinimumMonths: number;
  paymentSchedules: string[];
  dpMinimumPercent: number;
  securityDepositMonths: number;
  genderAvailability: PublicHunianGenderAvailability[];
};

export type PublicHunianCatalogParams = {
  // UI-level values from the /kamar URL search params.
  gender?: PublicGender;
  category?: PublicCategory;
  plannedStart?: string;
  paymentSchedule?: "annual" | "two_month_installments";
};

const publicGalleryImageSchema = z
  .object({
    contentUrl: z
      .string()
      .regex(
        /^\/api\/v1\/public\/hunian-gallery\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/content$/i,
      ),
    thumbnailUrl: z
      .string()
      .regex(
        /^\/api\/v1\/public\/hunian-gallery\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/content$/i,
      )
      .nullable(),
    altText: z.string().trim().min(1),
    caption: z.string().nullable(),
    sortOrder: z.number().int().nonnegative(),
    isCover: z.boolean(),
  })
  .strict();

const publicGallerySchema = z.array(publicGalleryImageSchema).superRefine((images, context) => {
  if (new Set(images.map((image) => image.sortOrder)).size !== images.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate gallery order" });
  }
  if (images.length > 0 && images.filter((image) => image.isCover).length !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Gallery cover authority invalid" });
  }
  if (images.some((image, index) => image.sortOrder !== index)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Gallery order is invalid" });
  }
});

const publicCatalogItemObjectSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    category: z.enum(["rukost", "apartkost"]),
    categoryLabel: z.string().min(1),
    shortDescription: z.string(),
    priceFromMonthly: z.number().int().nonnegative().nullable(),
    priceFromYearly: z.number().int().nonnegative().nullable(),
    availabilityCount: z.number().int().nonnegative(),
    facilitiesPreview: z.array(z.string().trim().min(1)),
    galleryPreview: z
      .array(publicGalleryImageSchema)
      .max(1)
      .refine(
        (images) => images.length === 0 || (images[0]?.isCover && images[0].sortOrder === 0),
        {
          message: "Gallery preview must be the cover",
        },
      )
      .nullable(),
    ctaLabel: z.string().trim().min(1),
    bookingLeadDefaults: z
      .object({
        category: z.enum(["rukost", "apartkost"]),
      })
      .strict(),
    disclaimers: z.array(z.string().trim().min(1)),
    leaseMinimumMonths: z.literal(12),
    paymentSchedules: z
      .array(z.enum(["annual", "two_month_installments"]))
      .length(2)
      .refine(
        (items) =>
          new Set(items).size === 2 &&
          items.includes("annual") &&
          items.includes("two_month_installments"),
        "Payment schedule authority invalid",
      ),
    dpMinimumPercent: z.literal(25),
    securityDepositMonths: z.literal(1),
    genderAvailability: z
      .array(
        z
          .object({
            gender: z.enum(["male", "female"]),
            genderLabel: z.string().min(1),
            availabilityCount: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(2)
      .refine(
        (items) => new Set(items.map((item) => item.gender)).size === items.length,
        "Duplicate gender availability",
      ),
  })
  .strict();

function validateCatalogConsistency(
  item: z.infer<typeof publicCatalogItemObjectSchema>,
  context: z.RefinementCtx,
) {
  if (item.bookingLeadDefaults.category !== item.category) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Category context mismatch" });
  }
  const genderTotal = item.genderAvailability.reduce(
    (sum, entry) => sum + entry.availabilityCount,
    0,
  );
  if (genderTotal !== item.availabilityCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Availability mismatch" });
  }
}

const publicCatalogItemSchema = publicCatalogItemObjectSchema.superRefine(
  validateCatalogConsistency,
);

export function parsePublicHunianCatalogList(
  raw: unknown,
  expectedCategory?: PublicCategory,
): PublicHunianCatalogItem[] {
  return z
    .array(publicCatalogItemSchema)
    .max(2)
    .superRefine((items, context) => {
      if (new Set(items.map((item) => item.category)).size !== items.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate category authority" });
      }
      if (expectedCategory && items.some((item) => item.category !== expectedCategory)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Requested category mismatch" });
      }
    })
    .parse(raw);
}

const GENDER_API_MAP: Record<PublicGender, PublicHunianGender> = {
  putra: "male",
  putri: "female",
};

export function getPublicHunianCatalog(
  params: PublicHunianCatalogParams = {},
): Promise<PublicHunianCatalogItem[]> {
  // Note: the ApiClient unwraps the top-level `data` envelope, so the sibling
  // `summary` object of this endpoint is not consumed here. The existing
  // /public/rooms/summary endpoint (M16D) remains the source for hero totals.
  return apiClient
    .get<unknown>("/public/hunian-catalog", {
      anonymous: true,
      query: {
        gender: params.gender ? GENDER_API_MAP[params.gender] : undefined,
        category: params.category,
        planned_start: params.plannedStart,
        payment_schedule: params.paymentSchedule,
      },
    })
    .then((raw) => parsePublicHunianCatalogList(raw, params.category));
}

// Availability is aggregated and admin-confirmed via WhatsApp; a short cache
// keeps the public page snappy without pretending counts are realtime.
const STALE_TIME_MS = 60_000;

export function usePublicHunianCatalog(
  params: PublicHunianCatalogParams,
): UseQueryResult<PublicHunianCatalogItem[]> {
  return useQuery<PublicHunianCatalogItem[]>({
    queryKey: [
      "public-hunian-catalog",
      "list",
      params.gender ?? "all",
      params.category ?? "all",
      params.plannedStart ?? "unset",
      params.paymentSchedule ?? "unset",
    ],
    queryFn: () => getPublicHunianCatalog(params),
    staleTime: STALE_TIME_MS,
  });
}

// Adapter for legacy WhatsApp message helpers only. Empty physical fields are
// never sent to the public booking-lead API or rendered as public authority.
export function toPublicRoomGroup(
  item: PublicHunianCatalogItem,
  gender: PublicHunianGender,
): PublicRoomGroup {
  const defaults = item.bookingLeadDefaults;
  const availability = item.genderAvailability.find((entry) => entry.gender === gender);
  if (!availability) {
    throw new Error("Selected gender is not available for this category.");
  }
  return {
    groupKey: `${item.category}-${gender}`,
    category: defaults.category ?? item.category,
    categoryLabel: item.categoryLabel,
    gender,
    genderLabel: availability.genderLabel,
    buildingCode: "",
    buildingName: "",
    floorCode: "",
    floorLabel: "",
    availableCount: availability.availabilityCount,
    priceFromMonthly: item.priceFromMonthly,
    priceFromYearly: item.priceFromYearly,
    publicTitle: item.title,
    ctaLabel: item.ctaLabel,
  };
}

// ---------------------------------------------------------------------------
// M18D — public hunian detail (/kamar/$slug)
// ---------------------------------------------------------------------------

export type PublicHunianFaqItem = { question: string; answer: string };

// M18B detail item: extends the list item with public-safe detail-only fields.
// Still strictly allowlisted — never roomId/room_code/exact room numbers,
// tenant/resident/occupancy PII, invoice/payment/bank data, or Smart Lock data.
export type PublicHunianCatalogDetail = PublicHunianCatalogItem & {
  longDescription: string;
  facilities: string[];
  pricingExplanation: string;
  minimumLeaseTerm: string;
  dpExplanation: string;
  securityDepositExplanation: string;
  manualPaymentMethods: string[];
  houseRules: string[];
  visitorHours: string | null;
  contactInformation: string;
  // M19B: all public-visible images for the slug, cover first, then sortOrder.
  gallery: PublicHunianGalleryImage[] | null;
};

export function getJakartaDateBounds(now = new Date()): { today: string; max: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const today = `${value("year")}-${value("month")}-${value("day")}`;
  const [year, month, day] = today.split("-").map(Number);
  const max = new Date(Date.UTC(year, month - 1, day + 62)).toISOString().slice(0, 10);
  return { today, max };
}

export function normalizePublicPlannedStart(raw: unknown, now = new Date()): string | undefined {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const timestamp = Date.parse(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== raw) {
    return undefined;
  }
  const { today, max } = getJakartaDateBounds(now);
  return raw >= today && raw <= max ? raw : undefined;
}

const publicCatalogDetailSchema = publicCatalogItemObjectSchema
  .extend({
    longDescription: z.string(),
    facilities: z.array(z.string()),
    pricingExplanation: z.string().min(1),
    minimumLeaseTerm: z.string().min(1),
    dpExplanation: z.string().min(1),
    securityDepositExplanation: z.string().min(1),
    manualPaymentMethods: z.array(z.string().min(1)),
    houseRules: z.array(z.string().min(1)),
    visitorHours: z.string().nullable(),
    contactInformation: z.string(),
    gallery: publicGallerySchema.nullable(),
  })
  .strict()
  .superRefine(validateCatalogConsistency);

export function parsePublicHunianCatalogDetail(
  raw: unknown,
  expectedSlug?: string,
): PublicHunianCatalogDetail {
  return publicCatalogDetailSchema
    .superRefine((item, context) => {
      if (expectedSlug && item.slug !== expectedSlug) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Requested catalog mismatch" });
      }
    })
    .parse(raw);
}

export function getPublicHunianCatalogDetail(slug: string): Promise<PublicHunianCatalogDetail> {
  return apiClient
    .get<unknown>(`/public/hunian-catalog/${encodeURIComponent(slug)}`, { anonymous: true })
    .then((raw) => parsePublicHunianCatalogDetail(raw, slug));
}

// Unknown slugs return HTTP 404 (NOT_FOUND) and malformed slugs HTTP 400
// (VALIDATION_FAILED) per the M18B contract. Both are terminal for a public
// visitor, so the page renders a safe not-found state (no ID-probing feedback,
// no raw backend error) and the query does not retry them.
export function isPublicHunianCatalogNotFound(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === ERROR_CODES.NOT_FOUND || error.code === ERROR_CODES.VALIDATION_FAILED)
  );
}

export function usePublicHunianCatalogDetail(
  slug: string,
): UseQueryResult<PublicHunianCatalogDetail> {
  return useQuery<PublicHunianCatalogDetail>({
    queryKey: ["public-hunian-catalog", "detail", slug],
    queryFn: () => getPublicHunianCatalogDetail(slug),
    staleTime: STALE_TIME_MS,
    retry: (failureCount, error) => !isPublicHunianCatalogNotFound(error) && failureCount < 2,
  });
}
