// Validated Vite env. Per ADR-FE-006.
import { parseFrontendEnv, resolveFeatureFlags, type FrontendEnv } from "@granada-kost/domain/env";

function readRawEnv(): Record<string, unknown> {
  const meta = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};
  return meta;
}

function load(): FrontendEnv {
  const raw = readRawEnv();
  const isDev = raw.DEV === true || raw.MODE === "development";
  try {
    return parseFrontendEnv(raw);
  } catch (err) {
    if (isDev) throw err;
    // eslint-disable-next-line no-console
    console.error("[env] Invalid VITE_* configuration. Falling back to defaults.", err);
    return parseFrontendEnv({});
  }
}

export const env = load();
export const features = resolveFeatureFlags(env);
