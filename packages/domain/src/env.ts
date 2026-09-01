// Shared env schema used by both apps. Validated at bootstrap (ADR-FE-006).
import { z } from "zod";

export const FrontendEnvSchema = z.object({
  // API authority must be provided explicitly by every build environment.
  // Keep development defaults only in each app's .env.example, never in the
  // runtime schema: Vite statically embeds this module into production bundles.
  VITE_API_BASE_URL: z.string().url(),
  VITE_APP_NAME: z.string().default("Granada Kost"),
  VITE_ADMIN_WHATSAPP_PHONE: z.string().default("6281234567890"),
  // Public room listing WhatsApp CTA destination (M16E).
  // Empty string = not configured; the public UI renders a safe disabled CTA.
  VITE_PUBLIC_WHATSAPP_NUMBER: z.string().default(""),
  // Feature flags (booleans encoded as strings in Vite env).
  VITE_FEATURE_SMARTLOCK_MODE: z.enum(["simulated", "live"]).default("simulated"),
  VITE_FEATURE_CCTV_ENABLED: z
    .union([z.literal("true"), z.literal("false")])
    .default("false"),
  VITE_FEATURE_BOOKING_ENABLED: z
    .union([z.literal("true"), z.literal("false")])
    .default("false"),
  VITE_FEATURE_CHAT_ENABLED: z
    .union([z.literal("true"), z.literal("false")])
    .default("false"),
  VITE_FEATURE_PUSH_ENABLED: z
    .union([z.literal("true"), z.literal("false")])
    .default("false"),
});

export type FrontendEnv = z.infer<typeof FrontendEnvSchema>;

export type ResolvedFeatureFlags = {
  smartlockMode: "simulated" | "live";
  cctvEnabled: boolean;
  bookingEnabled: boolean;
  chatEnabled: boolean;
  pushEnabled: boolean;
};

export function resolveFeatureFlags(env: FrontendEnv): ResolvedFeatureFlags {
  const toBool = (v: "true" | "false"): boolean => v === "true";
  return {
    smartlockMode: env.VITE_FEATURE_SMARTLOCK_MODE,
    cctvEnabled: toBool(env.VITE_FEATURE_CCTV_ENABLED),
    bookingEnabled: toBool(env.VITE_FEATURE_BOOKING_ENABLED),
    chatEnabled: toBool(env.VITE_FEATURE_CHAT_ENABLED),
    pushEnabled: toBool(env.VITE_FEATURE_PUSH_ENABLED),
  };
}

export function parseFrontendEnv(raw: Record<string, unknown>): FrontendEnv {
  // Throws ZodError if invalid. Production callers must fail fast rather than
  // silently compiling or running against an unintended API endpoint.
  return FrontendEnvSchema.parse(raw);
}
