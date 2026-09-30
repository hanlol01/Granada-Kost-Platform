export type HistoricalRealizationTransferStatus = 'draft' | 'partially_realized' | 'realized';

export type HistoricalRealizationTransferResolution =
  | {
      ok: true;
      transferredTotal: number;
      status: HistoricalRealizationTransferStatus;
    }
  | {
      ok: false;
      reason:
        | 'invalid_owner_total'
        | 'invalid_transfer_amount'
        | 'unsafe_transfer_total'
        | 'exceeds_owner_total';
    };

export function resolveHistoricalRealizationTransfers(
  ownerTotal: number,
  transferAmounts: readonly number[],
): HistoricalRealizationTransferResolution {
  if (!Number.isSafeInteger(ownerTotal) || ownerTotal < 0) {
    return { ok: false, reason: 'invalid_owner_total' };
  }

  let transferredTotal = 0;
  for (const amount of transferAmounts) {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return { ok: false, reason: 'invalid_transfer_amount' };
    }
    transferredTotal += amount;
    if (!Number.isSafeInteger(transferredTotal)) {
      return { ok: false, reason: 'unsafe_transfer_total' };
    }
  }

  if (transferredTotal > ownerTotal) {
    return { ok: false, reason: 'exceeds_owner_total' };
  }

  const status =
    transferredTotal === 0
      ? 'draft'
      : transferredTotal === ownerTotal
        ? 'realized'
        : 'partially_realized';

  return { ok: true, transferredTotal, status };
}
