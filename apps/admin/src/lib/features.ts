// Public feature-flag readers. Components must import from here, not from env.ts,
// so flags can be stubbed in tests later without touching env loading.
import { features } from "./env";

export const isSmartLockLive = (): boolean => features.smartlockMode === "live";
export const isSmartLockSimulated = (): boolean => features.smartlockMode === "simulated";
export const isCctvEnabled = (): boolean => features.cctvEnabled;
export const isBookingEnabled = (): boolean => features.bookingEnabled;
export const isChatEnabled = (): boolean => features.chatEnabled;
export const isPushEnabled = (): boolean => features.pushEnabled;

/**
 * M3 introduces routes ahead of their owning UI milestones. These flags are
 * intentionally read outside the shared env schema so an older deployment can
 * never accidentally enable an unfinished surface. Only `true` opts in.
 */
function isExplicitlyEnabled(key: string): boolean {
  const meta = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};
  return meta[key] === "true";
}

export const isAdminUxMasterEnabled = (): boolean =>
  isExplicitlyEnabled("VITE_FEATURE_ADMIN_UX_MASTER_ENABLED");

export const isAdminUxLeaseEnabled = (): boolean =>
  isExplicitlyEnabled("VITE_FEATURE_ADMIN_UX_LEASE_ENABLED");

export type AdminFeatureFlag = "adminUxMaster" | "adminUxLease" | "booking" | "cctv" | "smartLock";

/** The route registry is the consumer-facing evaluator for navigation flags. */
export function isAdminFeatureEnabled(flag: AdminFeatureFlag): boolean {
  switch (flag) {
    case "adminUxMaster":
      return isAdminUxMasterEnabled();
    case "adminUxLease":
      return isAdminUxLeaseEnabled();
    case "booking":
      return isBookingEnabled();
    case "cctv":
      return isCctvEnabled();
    case "smartLock":
      return isSmartLockLive() || isSmartLockSimulated();
  }
}

export { features };
