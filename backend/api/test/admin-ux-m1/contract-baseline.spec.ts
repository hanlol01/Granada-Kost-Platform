import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  assertNoForbiddenResponseKeys,
  contractTemplateContext,
  expandContractTemplate,
  loadAdminUxContractBaseline,
} from '../../src/infrastructure/database/scripts/admin-ux-m1/admin-ux-contract-baseline';
import {
  loadAdminUxM1Fixture,
  validateAdminUxM1Fixture,
} from '../../src/infrastructure/database/scripts/admin-ux-m1/admin-ux-m1-fixtures';

test('anchors the legacy/public contract baseline to the M0 PASS commit', async () => {
  const baseline = await loadAdminUxContractBaseline();

  assert.equal(baseline.source_commit, '404f722');
  assert.ok(baseline.suites.legacy.length > 0);
  assert.ok(baseline.suites.public.length > 0);
  assert.ok(baseline.suites.public.every((endpoint) => endpoint.requires_auth === false));
});

test('expands legacy and public fixture placeholders without leaking fixture data', async () => {
  const fixture = await loadAdminUxM1Fixture();
  validateAdminUxM1Fixture(fixture);
  const context = contractTemplateContext(fixture);

  assert.equal(
    expandContractTemplate('/api/v1/rooms/{property_alpha_room_vacant_id}', context),
    `/api/v1/rooms/${context.property_alpha_room_vacant_id}`,
  );
  assert.throws(
    () => expandContractTemplate('/api/v1/rooms/{missing_value}', context),
    /has no fixture value/,
  );
});

test('fails the baseline leak scan on KTP/NIK-like response keys', () => {
  assert.throws(
    () => assertNoForbiddenResponseKeys({ data: { resident_ktp: 'masked' } }, ['ktp', 'nik']),
    /forbidden key/,
  );
  assert.doesNotThrow(() =>
    assertNoForbiddenResponseKeys({ data: { public_room_code: 'QA-A-VACANT' } }, ['ktp', 'nik']),
  );
});
