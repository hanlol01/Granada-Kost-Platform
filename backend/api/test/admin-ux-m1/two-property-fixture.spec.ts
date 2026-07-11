import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  loadAdminUxM1Fixture,
  validateAdminUxM1Fixture,
} from '../../src/infrastructure/database/scripts/admin-ux-m1/admin-ux-m1-fixtures';

test('validates the synthetic two-property fixture with role and room-state coverage', async () => {
  const fixture = await loadAdminUxM1Fixture();
  const summary = validateAdminUxM1Fixture(fixture);

  assert.deepEqual(summary, {
    fixture_id: 'admin-ux-m1-two-property-synthetic',
    properties: 2,
    actors: 10,
    residents: 2,
    legacy_invoices: 2,
    public_catalog_entries: 2,
    pii_detected: false,
  });
});
