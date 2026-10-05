require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluateLeaseArchiveRestoration } = require('../../src/modules/lease/lease-archive-restoration-policy.helper.ts');
const eligible = { archiveStatus: 'archived', leaseStatus: 'cancelled', physicalCheckInRecorded: false,
  relatedTransactionCount: 0, paymentProofCount: 0, recognizedIncomeAmount: 0, ownerRealizationLinked: false,
  roomAvailable: true, residentAvailable: true, periodValid: true, bindingsRestorable: true,
  commercialTermsValid: true, sponsorshipValid: true, filePurgeUnresolved: false };
test('a validated no-money archive can be reviewed for direct restoration', () => {
  assert.deepEqual(evaluateLeaseArchiveRestoration(eligible), { allowed: true, code: null, message: null, recommendedAction: 'direct_restore' });
});
test('a reused room, ended period or changed commercial policy offers a linked successor, never an automatic restore', () => {
  for (const patch of [{ roomAvailable: false },{ residentAvailable: false },{ periodValid: false },
    { bindingsRestorable: false },{ commercialTermsValid: false },{ sponsorshipValid: false }]) {
    const decision = evaluateLeaseArchiveRestoration({ ...eligible, ...patch });
    assert.equal(decision.allowed, false); assert.equal(decision.recommendedAction, 'linked_successor');
    assert.ok(decision.code); assert.ok(decision.message.length > 50);
  }
});
test('verified, pending, reversed/refunded transaction history and invoice proof never revive old finance', () => {
  for (const patch of [{ relatedTransactionCount: 1 },{ paymentProofCount: 1 }]) {
    const decision = evaluateLeaseArchiveRestoration({ ...eligible, ...patch });
    assert.equal(decision.code, 'LEASE_ARCHIVE_RESTORE_FINANCIAL_HISTORY');
    assert.equal(decision.recommendedAction, 'linked_successor');
  }
});
test('real occupancy, realization and recognized income require authority review before a successor', () => {
  for (const patch of [{ physicalCheckInRecorded: true },{ ownerRealizationLinked: true },{ recognizedIncomeAmount: 1 }]) {
    const decision = evaluateLeaseArchiveRestoration({ ...eligible, ...patch });
    assert.equal(decision.code, 'LEASE_ARCHIVE_RESTORE_HISTORY_PROTECTED');
    assert.equal(decision.recommendedAction, 'review_records');
  }
});
test('unknown booleans or invalid financial amounts fail closed instead of treating zero as safe', () => {
  for (const patch of [{ relatedTransactionCount: NaN },{ relatedTransactionCount: -1 },{ paymentProofCount: Number.MAX_SAFE_INTEGER + 1 },
    { roomAvailable: null },{ sponsorshipValid: undefined },{ recognizedIncomeAmount: '0' }]) {
    const decision = evaluateLeaseArchiveRestoration({ ...eligible, ...patch });
    assert.equal(decision.code, 'LEASE_ARCHIVE_RESTORE_FACTS_INVALID');
    assert.equal(decision.recommendedAction, 'review_records');
  }
});
test('restored or superseded archives are not restored a second time', () => {
  for (const patch of [{ archiveStatus: 'restored' },{ archiveStatus: 'superseded' },{ leaseStatus: 'active' }])
    assert.equal(evaluateLeaseArchiveRestoration({ ...eligible, ...patch }).code, 'LEASE_ARCHIVE_RESTORE_STATUS_INVALID');
});
test('an unfinished or failed file purge must be resolved before direct restoration', () => {
  const decision = evaluateLeaseArchiveRestoration({ ...eligible, filePurgeUnresolved: true });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'LEASE_ARCHIVE_RESTORE_FILE_PURGE_UNRESOLVED');
  assert.equal(decision.recommendedAction, 'review_records');
  assert.match(decision.message, /berkas.*Coba ulang/);
  assert.equal(evaluateLeaseArchiveRestoration({ ...eligible, filePurgeUnresolved: undefined }).code,
    'LEASE_ARCHIVE_RESTORE_FACTS_INVALID');
});
