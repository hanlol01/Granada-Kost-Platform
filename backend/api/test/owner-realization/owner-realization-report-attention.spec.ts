import assert from 'node:assert/strict';
import test from 'node:test';
import { PropertyOwnerRealizationService } from '../../src/modules/property-owner-management/property-owner-realization.service';

const propertyId = '00000000-0000-4000-8000-000000000001';
const ownerA = '00000000-0000-4000-8000-000000000002';
const ownerB = '00000000-0000-4000-8000-000000000003';
const ownerC = '00000000-0000-4000-8000-000000000004';

void test('report attention counts ready contracts after a completed batch and excludes empty or in-progress Owners', async () => {
  const profiles = [ownerA, ownerB, ownerC].map((id) => ({
    id,
    full_name: id,
    phone: null,
    email: null,
    profile_status: 'active',
    created_at: '2026-08-01',
  }));
  const candidates = [
    { owner_profile_id: ownerA, lease_id: 'lease-a1', room_code: 'RK-01-01' },
    { owner_profile_id: ownerA, lease_id: 'lease-a2', room_code: 'RK-01-02' },
    { owner_profile_id: ownerC, lease_id: 'lease-c1', room_code: 'RK-03-01' },
  ].map((row) => ({
    ...row,
    asset_id: `asset-${row.owner_profile_id}`,
    building_code: 'RK-01',
    building_name: 'Rumah Kost Unit 01',
    plot_number: null,
    resident_name: row.lease_id,
    contract_total_amount: '5400000',
    management_fee_amount: '900000',
    net_realization_amount: '4500000',
  }));
  const realizations = [
    {
      id: '00000000-0000-4000-8000-000000000005',
      owner_profile_id: ownerA,
      realization_status: 'published_to_owner',
      realization_period: '2026-08-01',
      realization_reference: 'RLS-A',
      room_count: 1,
      eligible_contract_total: '5400000',
      management_fee_total: '900000',
      realization_total: '4500000',
      transferred_total: '4500000',
      published_at: '2026-09-01',
    },
    {
      id: '00000000-0000-4000-8000-000000000006',
      owner_profile_id: ownerC,
      realization_status: 'draft',
      realization_period: '2026-08-01',
      realization_reference: 'RLS-C',
      room_count: 1,
      eligible_contract_total: '5400000',
      management_fee_total: '900000',
      realization_total: '4500000',
      transferred_total: '0',
      published_at: null,
    },
  ];
  const client = {
    query: (sql: string) => {
      if (sql.includes('SELECT DISTINCT ON')) return Promise.resolve({ rows: [] });
      if (sql.includes('WITH rent_ledger AS')) return Promise.resolve({ rows: candidates });
      if (sql.includes('WITH ownership_scope AS')) return Promise.resolve({ rows: [] });
      if (sql.includes('FROM property_owner_realizations realization'))
        return Promise.resolve({ rows: realizations });
      if (sql.includes('FROM property_owner_profiles')) return Promise.resolve({ rows: profiles });
      if (sql.includes('FROM property_owner_realization_lines'))
        return Promise.resolve({ rows: [] });
      throw new Error(`Unexpected query: ${sql.slice(0, 80)}`);
    },
  };
  const service = new PropertyOwnerRealizationService(
    { client } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const actor = { propertyIds: [propertyId] } as never;

  const result = await service.list(actor, {
    property_id: propertyId,
    period: '2026-08',
    workspace: 'active',
    status: 'not_prepared',
    limit: 20,
    offset: 0,
  });

  assert.equal(result.summary.attention.ready_owners, 1);
  assert.equal(result.summary.attention.ready_contracts, 2);
  assert.equal(result.summary.attention.created_realizations, 2);
  assert.equal(result.summary.attention.created_owners, 2);
  assert.equal(result.summary.attention.statuses.published_to_owner, 1);
  assert.equal(result.summary.attention.statuses.draft, 1);
  assert.deepEqual(
    result.rows.map((row) => row.owner_id),
    [ownerA],
  );
});
