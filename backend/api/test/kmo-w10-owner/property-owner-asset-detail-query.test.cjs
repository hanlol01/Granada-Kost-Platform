const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

test('owner asset detail projects every referenced lease field', () => {
  const source = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/property-owner-management/property-owner-portal.service.ts',
    ),
    'utf8',
  );
  const detailQuery = source
    .split('async getAssetDetail(')[1]
    ?.split('async getOccupancyResidentDetail(')[0];

  assert.ok(detailQuery, 'owner asset detail query must exist');
  assert.match(detailQuery, /lease\.service_period_state='pending_check_in'/);
  assert.match(
    detailQuery,
    /SELECT id, lease_status, commercial_mode, start_date, end_date, resident_id, occupancy_id,\s*service_period_state\s+FROM leases/,
    'the lateral lease projection must select service_period_state before the outer query uses it',
  );
});
