// Validated Vite env. Per ADR-FE-006.
import { parseFrontendEnv, resolveFeatureFlags, type FrontendEnv } from "@granada-kost/domain/env";

function readRawEnv(): Record<string, unknown> {
  const meta = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};
  return meta;
}

function load(): FrontendEnv {
  const raw = readRawEnv();
  try {
    return parseFrontendEnv(raw);
  } catch {
    throw new Error(
      "[env] Invalid frontend configuration: VITE_API_BASE_URL is required and must be an absolute API URL.",
    );
  }
}

export const env = load();
export const features = resolveFeatureFlags(env);
