import assert from 'node:assert/strict';
import test from 'node:test';
import { transferEvidenceIsValid } from '../../src/modules/property-owner-management/owner-realization-evidence-policy.ts';

const base = {
  transferredAt: '2026-10-01T08:00:00+07:00',
  reference: 'TRF-OWNER-001',
};

test('current transfer requires an uploaded proof', () => {
  assert.equal(transferEvidenceIsValid(base), false);
  assert.equal(
    transferEvidenceIsValid({ ...base, legacyReason: 'Arsip lama', legacySource: 'Rekap admin' }),
    false,
  );
  assert.equal(transferEvidenceIsValid({ ...base, fileIds: ['proof-id'] }), true);
});

test('pre-rollout exception requires a reason, traceable source and reference', () => {
  const past = { ...base, transferredAt: '2026-08-30T08:00:00+07:00' };
  assert.equal(transferEvidenceIsValid(past), false);
  assert.equal(
    transferEvidenceIsValid({ ...past, legacyReason: 'Bukti digital belum tersedia' }),
    false,
  );
  assert.equal(
    transferEvidenceIsValid({
      ...past,
      legacyReason: 'Bukti digital belum tersedia',
      legacySource: 'Rekap Admin Agustus',
    }),
    true,
  );
  assert.equal(
    transferEvidenceIsValid({
      ...past,
      reference: ' ',
      legacyReason: 'Arsip lama',
      legacySource: 'Rekap Admin',
    }),
    false,
  );
});

test('invalid rollout configuration never silently permits a missing proof', () => {
  assert.equal(
    transferEvidenceIsValid({
      ...base,
      transferredAt: '2026-08-01T00:00:00Z',
      legacyReason: 'Arsip lama',
      legacySource: 'Rekap Admin',
      rolloutAt: 'invalid',
    }),
    false,
  );
});
