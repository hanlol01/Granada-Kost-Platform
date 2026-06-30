// Public feature-flag readers. Components must import from here, not from env.ts,
// so flags can be stubbed in tests later without touching env loading.
import { features } from "./env";

export const isSmartLockLive = (): boolean => features.smartlockMode === "live";
export const isSmartLockSimulated = (): boolean => features.smartlockMode === "simulated";
export const isCctvEnabled = (): boolean => features.cctvEnabled;
export const isBookingEnabled = (): boolean => features.bookingEnabled;
export const isChatEnabled = (): boolean => features.chatEnabled;
export const isPushEnabled = (): boolean => features.pushEnabled;

export { features };
