import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHistoricalRealizationTransfers } from '../../src/modules/property-owner-management/owner-realization-historical-transfer.helper';

test('historical transfer installments are summed and remain partial until entitlement is covered', () => {
  assert.deepEqual(resolveHistoricalRealizationTransfers(18_000_000, [10_000_000, 5_000_000]), {
    ok: true,
    transferredTotal: 15_000_000,
    status: 'partially_realized',
  });
});

test('historical realization becomes realized only when positive transfers equal Owner entitlement', () => {
  assert.deepEqual(resolveHistoricalRealizationTransfers(18_000_000, [10_000_000, 8_000_000]), {
    ok: true,
    transferredTotal: 18_000_000,
    status: 'realized',
  });
  assert.deepEqual(resolveHistoricalRealizationTransfers(18_000_000, []), {
    ok: true,
    transferredTotal: 0,
    status: 'draft',
  });
});

test('historical transfer resolver rejects nonpositive, excessive, and unsafe totals', () => {
  assert.deepEqual(resolveHistoricalRealizationTransfers(18_000_000, [0]), {
    ok: false,
    reason: 'invalid_transfer_amount',
  });
  assert.deepEqual(resolveHistoricalRealizationTransfers(18_000_000, [18_000_001]), {
    ok: false,
    reason: 'exceeds_owner_total',
  });
  assert.deepEqual(
    resolveHistoricalRealizationTransfers(Number.MAX_SAFE_INTEGER, [Number.MAX_SAFE_INTEGER, 1]),
    { ok: false, reason: 'unsafe_transfer_total' },
  );
});
