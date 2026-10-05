require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const { FileService } = require('../../src/modules/file/file.service.ts');
const { FileRepository } = require('../../src/modules/file/file.repository.ts');

const record = {
  id: 'proof',
  propertyId: 'property',
  uploaderUserId: 'user',
  filePurpose: 'lease_revision_evidence',
  mimeType: 'application/pdf',
  fileExtension: 'pdf',
  fileSizeBytes: 100,
  storagePath: 'private/proof.pdf',
  isDeleted: false,
  createdAt: new Date('2026-10-03T00:00:00Z'),
};
const user = (roles, permissions = []) => ({ id: 'user', roles, permissions });
function fixture(overrides = {}) {
  const audit = [],
    storage = [],
    scopes = [];
  const repository = {
    findById: async () => record,
    downloadContext: async () => ({
      label: 'Bukti-Koreksi-Penyewaan',
      code: 'LSE-2026-0001-KOREKSI-2',
      sequence: '3',
    }),
    ...overrides.files,
  };
  const service = new FileService(
    repository,
    {
      assertCanReadProperty: async (actor, propertyId) => {
        scopes.push(propertyId);
        if (overrides.foreignProperty) throw new Error('Property denied');
      },
    },
    { write: async (event) => audit.push(event) },
    {},
    {},
    {
      exists: async () => {
        storage.push('exists');
        return true;
      },
      read: async () => {
        storage.push('read');
        return Buffer.from('proof');
      },
    },
  );
  return { service, audit, storage, scopes };
}
test('private correction evidence denies every non-Admin role even its uploader', async () => {
  for (const role of ['resident', 'property_owner', 'owner', 'manager', 'technician', 'finance']) {
    for (const action of ['getMetadata', 'readContent', 'softDelete']) {
      const f = fixture();
      await assert.rejects(
        f.service[action](user([role], ['lease.read', 'lease.manage']), 'proof', {}),
        (e) => e.getResponse?.().code === 'FILE_ACCESS_DENIED',
      );
      assert.equal(f.audit.length, 1);
      assert.equal(f.audit[0].resultStatus, 'denied');
      assert.deepEqual(f.storage, []);
      assert.deepEqual(f.scopes, ['property']);
    }
  }
});
test('Admin evidence reads require lease permission and deletion requires management', async () => {
  const f = fixture();
  await assert.rejects(
    f.service.getMetadata(user(['admin']), 'proof', {}),
    (e) => e.getResponse?.().code === 'FILE_ACCESS_DENIED',
  );
  await assert.rejects(
    f.service.softDelete(user(['admin'], ['lease.read']), 'proof', {}),
    (e) => e.getResponse?.().code === 'FILE_ACCESS_DENIED',
  );
  assert.equal(await f.service.getMetadata(user(['admin'], ['lease.read']), 'proof', {}), record);
  assert.equal(
    (await f.service.readContent(user(['admin'], ['lease.manage']), 'proof', {})).buffer.toString(),
    'proof',
  );
});
test('upload denies non-Admin and Admin without lease management before storage', async () => {
  for (const actor of [
    user(['admin']),
    user(['resident'], ['lease.manage']),
    user(['property_owner'], ['lease.manage']),
  ]) {
    const f = fixture();
    await assert.rejects(
      f.service.upload(
        actor,
        { property_id: 'property', file_purpose: 'lease_revision_evidence' },
        undefined,
        {},
      ),
      (e) => e.getResponse?.().code === 'FILE_PURPOSE_DENIED',
    );
    assert.equal(f.audit[0].action, 'file.upload.denied');
    assert.deepEqual(f.storage, []);
  }
});
test('authorized Admin cannot bypass property scope to read correction proof', async () => {
  const f = fixture({ foreignProperty: true });
  await assert.rejects(
    f.service.readContent(user(['admin'], ['lease.manage']), 'proof', {}),
    /Property denied/,
  );
  assert.equal(f.audit[0].resultStatus, 'denied');
  assert.deepEqual(f.storage, []);
});
test('evidence download names use the lease and amendment codes, not uploader names or UUIDs', async () => {
  assert.equal(
    await fixture().service.downloadName(record),
    'Bukti-Koreksi-Penyewaan-LSE-2026-0001-KOREKSI-2-03.pdf',
  );
});
test('attached or uncertain correction evidence is not soft-deleted after acquiring its row lock', async () => {
  for (const attached of [true, undefined]) {
    const calls = [];
    const repository = new FileRepository({
      transaction: async (callback) =>
        callback({
          query: async (sql) => {
            calls.push(sql);
            if (sql.includes('FOR UPDATE')) return { rows: [{ id: 'proof' }] };
            if (sql.includes('SELECT EXISTS'))
              return { rows: attached === undefined ? [] : [{ attached }] };
            throw new Error('Unexpected write');
          },
        }),
    });
    await assert.rejects(
      repository.softDelete('proof', 'admin', 'lease_revision_evidence'),
      (e) => e.getResponse?.().code === 'LEASE_CORRECTION_EVIDENCE_ATTACHED',
    );
    assert.ok(calls[0].includes('FOR UPDATE'));
    assert.ok(calls[1].includes('lease_data_correction_evidence'));
    assert.ok(!calls.some((sql) => /UPDATE files/.test(sql)));
  }
});
test('an unattached draft proof can be metadata-deleted without claiming physical bytes were freed', async () => {
  const calls = [];
  const repository = new FileRepository({
    transaction: async (callback) =>
      callback({
        query: async (sql) => {
          calls.push(sql);
          if (sql.includes('FOR UPDATE')) return { rows: [{ id: 'proof' }] };
          if (sql.includes('SELECT EXISTS')) return { rows: [{ attached: false }] };
          return {
            rows: [
              {
                id: 'proof',
                property_id: 'property',
                file_purpose: 'lease_revision_evidence',
                file_size_bytes: '100',
                is_deleted: true,
              },
            ],
          };
        },
      }),
  });
  const result = await repository.softDelete('proof', 'admin', 'lease_revision_evidence');
  assert.equal(result.isDeleted, true);
  assert.ok(calls[2].includes('UPDATE files'));
  assert.equal('freed_bytes' in result, false);
});
test('correction download lookup keeps numbering across the complete amendment and scopes both identifiers', async () => {
  const calls = [];
  const repository = new FileRepository({
    client: {
      query: async (sql, values) => {
        calls.push({ sql, values });
        return { rows: [{ code: 'LSE-2026-0001-KOREKSI-2', sequence: '3' }] };
      },
    },
  });
  assert.deepEqual(await repository.downloadContext(record), {
    label: 'Bukti-Koreksi-Penyewaan',
    code: 'LSE-2026-0001-KOREKSI-2',
    sequence: '3',
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, ['proof', 'property']);
  assert.match(calls[0].sql, /PARTITION BY evidence\.correction_id/);
});
