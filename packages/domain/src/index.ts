// @granada-kost/domain
// Shared, framework-agnostic types and helpers consumed by Admin and Penghuni.
// Frozen at M11B per ADR-FE-001 and ADR-FE-002.

export const PRODUCT_LANGUAGE = {
  residentLabel: "Penghuni",
} as const;

export * from "./envelopes";
export * from "./errors";
export * from "./enums";
// Keep the source extension explicit so ESM runtimes do not resolve the
// untracked CommonJS build artifact (`kmo-lifecycle.js`) that may sit beside
// the TypeScript source during local development.
export * from "./kmo-lifecycle.ts";
export * from "./auth";
export * from "./money";
export * from "./date";
export * from "./file";
