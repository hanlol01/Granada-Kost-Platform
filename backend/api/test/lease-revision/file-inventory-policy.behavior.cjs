require('./register-typescript.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateArchiveFile } = require('../../src/modules/lease/lease-archive-file-policy.ts');
const base = {
  propertyId: 'property', leaseId: 'lease', archiveStatus: 'archived',
  file: { propertyId: 'property', purpose: 'payment_proof', sizeBytes: 100,
    isDeleted: false, claimId: null, duplicatePath: false },
  references: [{ relationship: 'Bukti pembayaran', recordCode: 'PAY-01',
    propertyId: 'property', leaseIds: ['lease'], protected: false, availableEvidenceCount: 1 }],
  coverageVerified: true,
};
test('exclusive archived evidence is selectable, but capacity is only an estimate', () => {
  const result = evaluateArchiveFile(base);
  assert.equal(result.selectable, true);
  assert.equal(result.onlyDigitalEvidence, true);
  assert.equal(result.estimatedBytes, 100);
  assert.equal(result.freedBytes, undefined);
});
for (const [name, input, code] of [
  ['restored archive', { archiveStatus: 'restored' }, 'LEASE_FILE_PURGE_ARCHIVE_ACTIVE'],
  ['unverified coverage', { coverageVerified: false }, 'LEASE_FILE_PURGE_COVERAGE_UNVERIFIED'],
  ['durable prior claim', { file: { ...base.file, claimId: 'claim' } }, 'LEASE_FILE_PURGE_ALREADY_CLAIMED'],
  ['foreign file property', { file: { ...base.file, propertyId: 'other' } }, 'LEASE_FILE_PURGE_PROTECTED'],
  ['identity always retained', { file: { ...base.file, purpose: 'ktp' } }, 'LEASE_FILE_PURGE_PROTECTED'],
  ['duplicated storage path', { file: { ...base.file, duplicatePath: true } }, 'LEASE_FILE_PURGE_PROTECTED'],
  ['unsafe size', { file: { ...base.file, sizeBytes: NaN } }, 'LEASE_FILE_PURGE_FACTS_INVALID'],
  ['unbound orphan', { references: [] }, 'LEASE_FILE_PURGE_OWNERSHIP_UNVERIFIED'],
  ['unknown owner', { references: [{ ...base.references[0], leaseIds: [] }] }, 'LEASE_FILE_PURGE_OWNERSHIP_UNVERIFIED'],
  ['another lease', { references: [{ ...base.references[0], leaseIds: ['lease', 'other'] }] }, 'LEASE_FILE_PURGE_SHARED'],
  ['protected linked room photo', { references: [...base.references, { ...base.references[0], relationship: 'Foto kamar', protected: true }] }, 'LEASE_FILE_PURGE_PROTECTED'],
  ['foreign reference property', { references: [{ ...base.references[0], propertyId: 'other' }] }, 'LEASE_FILE_PURGE_PROTECTED'],
]) test(name, () => {
  const result = evaluateArchiveFile({ ...base, ...input });
  assert.equal(result.selectable, false);
  assert.equal(result.code, code);
  assert.equal(result.estimatedBytes, 0);
  assert.ok(result.message.length > 20);
});
test('a linked successor retains the cancelled original evidence ownership', () => {
  assert.equal(evaluateArchiveFile({ ...base, archiveStatus: 'superseded' }).selectable, true);
});
test('another digital attachment prevents the sole-evidence warning', () => {
  assert.equal(evaluateArchiveFile({ ...base,
    references: [{ ...base.references[0], availableEvidenceCount: 2 }] }).onlyDigitalEvidence, false);
});
test('legacy metadata removal does not prove physical deletion or prevent an exclusive-byte purge', () => {
  const result = evaluateArchiveFile({ ...base, file: { ...base.file, isDeleted: true } });
  assert.equal(result.selectable, true);
  assert.equal(result.onlyDigitalEvidence, false, 'Hidden evidence is not an available digital attachment');
  assert.equal(result.estimatedBytes, 100);
  assert.equal(result.freedBytes, undefined);
  assert.equal(evaluateArchiveFile({ ...base, file: { ...base.file, isDeleted: true, claimId: 'existing' } }).code,
    'LEASE_FILE_PURGE_ALREADY_CLAIMED', 'Verified prior purge remains immutable and cannot free bytes twice');
});
