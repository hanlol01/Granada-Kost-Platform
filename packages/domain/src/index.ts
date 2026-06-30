// @granada-kost/domain
// Shared, framework-agnostic types and helpers consumed by Admin and Penghuni.
// Frozen at M11B per ADR-FE-001 and ADR-FE-002.

export const PRODUCT_LANGUAGE = {
  residentLabel: "Penghuni",
} as const;

export * from "./envelopes";
export * from "./errors";
export * from "./enums";
export * from "./auth";
export * from "./money";
export * from "./date";
