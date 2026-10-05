require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const { mkdtemp, readFile, writeFile, lstat, rm, rename, symlink, link } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { resolve, join, sep } = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { LocalFileStorage } = require('../../src/modules/file/storage/local-file-storage.ts');

async function fixture(operation) {
  const root = await mkdtemp(join(tmpdir(), 'kostation-h08-purge-'));
  assert.ok(resolve(root).startsWith(`${resolve(tmpdir())}${sep}kostation-h08-purge-`));
  const storage = new LocalFileStorage({ getOrThrow: () => root });
  const bytes = Buffer.from('H08 generated temporary evidence; never a user upload');
  const target = { id: randomUUID(), propertyId: randomUUID(), purpose: 'payment_proof', extension: 'pdf',
    sizeBytes: bytes.length, checksumSha256: createHash('sha256').update(bytes).digest('hex') };
  target.storagePath = await storage.save(target.id, target.propertyId, target.purpose, bytes, target.extension);
  try { await operation(storage, target, root, bytes); }
  finally {
    // Delete only the exact, freshly created and verified test directory.
    assert.ok(resolve(root).startsWith(`${resolve(tmpdir())}${sep}kostation-h08-purge-`));
    await rm(root, { recursive: true, force: true });
  }
}
test('purge verifies exact evidence identity and credits only bytes actually removed', async () => fixture(async (storage, target, root) => {
  assert.deepEqual(await storage.purgeVerified(target), { state: 'deleted', verifiedAbsent: true, freedBytes: target.sizeBytes });
  await assert.rejects(lstat(join(root, target.storagePath)), { code: 'ENOENT' });
  assert.deepEqual(await storage.purgeVerified(target), { state: 'deleted', verifiedAbsent: true, freedBytes: 0 });
}));
test('changed contents remain untouched and are not reported as deleted', async () => fixture(async (storage, target, root) => {
  const changed = Buffer.from('Content no longer matches the recorded checksum');
  await writeFile(join(root, target.storagePath), changed);
  assert.deepEqual(await storage.purgeVerified(target), { state: 'failed', code: 'FILE_PURGE_CONTENT_CHANGED', availability: 'present' });
  assert.deepEqual(await readFile(join(root, target.storagePath)), changed);
}));
test('unsafe or foreign metadata never reaches deletion', async () => fixture(async (storage, target, root, bytes) => {
  for (const altered of [{ ...target, storagePath: '../outside.pdf' }, { ...target, propertyId: randomUUID() }, { ...target, extension: '../pdf' }, { ...target, storagePath: root }]) {
    assert.deepEqual(await storage.purgeVerified(altered), { state: 'failed', code: 'FILE_PURGE_PATH_INVALID', availability: 'unknown' });
  }
  assert.deepEqual(await readFile(join(root, target.storagePath)), bytes);
}));
test('a junction or hard-linked upload is protected even when content and checksum match', async () => {
  await fixture(async (storage, target, root, bytes) => {
    const actual = join(root, target.propertyId);
    const relocated = join(root, 'generated-proof-relocated');
    assert.ok(resolve(actual).startsWith(`${resolve(root)}${sep}`));
    assert.ok(resolve(relocated).startsWith(`${resolve(root)}${sep}`));
    await rename(actual, relocated);
    await symlink(relocated, actual, process.platform === 'win32' ? 'junction' : 'dir');
    assert.deepEqual(await storage.purgeVerified(target), { state: 'failed', code: 'FILE_PURGE_PATH_INVALID', availability: 'unknown' });
    assert.deepEqual(await readFile(join(root, target.storagePath)), bytes);
  });
  await fixture(async (storage, target, root, bytes) => {
    await link(join(root, target.storagePath), join(root, 'generated-proof-hard-link.pdf'));
    assert.deepEqual(await storage.purgeVerified(target), { state: 'failed', code: 'FILE_PURGE_PATH_INVALID', availability: 'unknown' });
    assert.deepEqual(await readFile(join(root, target.storagePath)), bytes);
  });
});
test('a missing storage root is retry pending rather than a successful deletion', async () => fixture(async (_storage, target, root, bytes) => {
  const unavailable = new LocalFileStorage({ getOrThrow: () => join(root, 'unavailable-storage-root') });
  assert.deepEqual(await unavailable.purgeVerified(target), { state: 'retry_pending', code: 'FILE_PURGE_STORAGE_UNVERIFIED', availability: 'unknown' });
  assert.deepEqual(await readFile(join(root, target.storagePath)), bytes);
}));
test('ordinary content lookup distinguishes an absent file from an offline storage root', async () => fixture(async (storage, target, root) => {
  assert.equal(await storage.exists(`${target.propertyId}/payment_proof/not-uploaded.pdf`), false);
  const unavailable = new LocalFileStorage({ getOrThrow: () => join(root, 'unavailable-storage-root') });
  await assert.rejects(unavailable.exists(target.storagePath), { code: 'ENOENT' });
  await assert.rejects(storage.exists('../outside-storage.pdf'), /escapes storage root/);
}));
