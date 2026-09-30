export type TransferEvidencePolicyInput = {
  transferredAt: string;
  fileIds?: readonly string[];
  legacyReason?: string;
  legacySource?: string;
  reference: string;
  rolloutAt?: string;
};

/** A missing upload is an auditable exception for pre-rollout transactions only. */
export function transferEvidenceIsValid(input: TransferEvidencePolicyInput): boolean {
  if (input.fileIds?.length) return true;
  const cutoff = new Date(input.rolloutAt || '2026-09-29T00:00:00+07:00');
  const transferDate = new Date(input.transferredAt);
  return (
    !Number.isNaN(cutoff.getTime()) &&
    !Number.isNaN(transferDate.getTime()) &&
    transferDate < cutoff &&
    Boolean(input.legacyReason?.trim()) &&
    Boolean(input.legacySource?.trim()) &&
    Boolean(input.reference.trim())
  );
}
