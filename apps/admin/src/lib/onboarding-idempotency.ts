import type { OnboardingPayload } from "./admin-onboarding.ts";
import { newIdempotencyKey } from "./idempotency.ts";
import { LeaseRevisionContractError } from "./lease-revision-contract.ts";

function fingerprintPayload(payload: OnboardingPayload): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(payload).sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

/** Unknown linked-successor results retain the original command, never a changed form. */
export function createOnboardingIdempotencyLedger(createKey: () => string = newIdempotencyKey) {
  let current: { fingerprint: string; key: string } | null = null;
  let uncertain: OnboardingPayload | null = null;
  return {
    keyFor(payload: OnboardingPayload) {
      const fingerprint = fingerprintPayload(payload);
      if (uncertain && fingerprint !== current?.fingerprint)
        throw new LeaseRevisionContractError(
          "LEASE_ARCHIVE_SUCCESSOR_SUBMISSION_UNCERTAIN",
          "Hasil penyewaan pengganti belum dapat dipastikan. Coba ulang pengajuan awal tanpa mengubah isian atau periksa riwayat arsip.",
        );
      if (!current || current.fingerprint !== fingerprint)
        current = { fingerprint, key: createKey() };
      return current.key;
    },
    freeze(payload: OnboardingPayload) {
      if (!payload.source_archive_id || uncertain) return;
      this.keyFor(payload);
      uncertain = structuredClone(payload);
    },
    uncertainPayload() {
      return uncertain ? structuredClone(uncertain) : null;
    },
    resolve() {
      uncertain = null;
    },
    reset(force = false) {
      if (uncertain && !force) return false;
      current = null;
      uncertain = null;
      return true;
    },
  };
}
