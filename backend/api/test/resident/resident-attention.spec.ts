import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ResidentRepository } from '../../src/modules/resident/repositories/resident.repository';
import {
  RESIDENT_ATTENTION_PREDICATES,
  CHECKOUT_STATUS_FILTER_SQL,
  RESIDENT_CHECKOUT_JOIN,
} from '../../src/modules/resident/repositories/resident-attention.sql';
import { checkoutInvoiceBalanceSql } from '../../src/modules/lease/helpers/checkout-read-model.helper';

function harness() {
  const queries: { sql: string; values: unknown[] }[] = [];
  const repository = new ResidentRepository({
    client: {
      query: async (sql: string, values: unknown[]) => {
        queries.push({ sql, values });
        return { rows: sql.startsWith('SELECT count(*)::text AS total') ? [{ total: '0' }] : [] };
      },
    },
  } as never);
  return { repository, queries };
}

test('all residents includes completed check-outs; list and count use identical attention filters', async () => {
  const { repository, queries } = harness();
  const query = {
    property_id: '11111111-1111-4111-8111-111111111111',
    attention_category: 'refund_pending' as const,
    limit: 20,
  };
  await repository.list(query, [query.property_id]);
  await repository.count(query, [query.property_id]);
  for (const { sql, values } of queries) {
    assert.doesNotMatch(sql, /\$3::text IS NULL AND \$14::text IS NULL/);
    assert.match(sql, /refund_status='settled'[\s\S]*decision_status='refund_pending'/);
    assert.match(sql, /attention_category/);
    assert.equal(values[17], 'refund_pending');
    assert.deepEqual(values[0], [query.property_id]);
  }
});

test('notification counts are scoped to property, not search filters or pagination', async () => {
  const { repository, queries } = harness();
  const property = '11111111-1111-4111-8111-111111111111';
  const summary = await repository.attentionSummary(property, [property]);
  assert.equal(summary.property_id, property);
  assert.equal(summary.counts.handover_overdue, 0);
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].values, [[property], property]);
  assert.doesNotMatch(queries[0].sql, /LIMIT \$|OFFSET|ILIKE/);
  assert.match(queries[0].sql, /COUNT\(\*\) FILTER/);
});

test('handover filters include scheduled future, today and overdue while counts remain distinct', () => {
  assert.match(
    CHECKOUT_STATUS_FILTER_SQL,
    /\$14='awaiting_handover' AND checkout_projection.checkout_state='scheduled'/,
  );
  assert.match(RESIDENT_ATTENTION_PREDICATES.awaiting_handover, /handover_date >=/);
  assert.match(RESIDENT_ATTENTION_PREDICATES.handover_overdue, /handover_date </);
  assert.match(RESIDENT_CHECKOUT_JOIN, /AT TIME ZONE 'Asia\/Jakarta'/);
  assert.match(RESIDENT_CHECKOUT_JOIN, /checkout\.state<>'cancelled'/);
});

test('completed historical checkouts never hide a different active lease', () => {
  for (const category of ['outstanding', 'lease_expired', 'lease_ending'] as const) {
    assert.match(
      RESIDENT_ATTENTION_PREDICATES[category],
      /checkout_lease_id IS DISTINCT FROM projection.projected_lease_id/,
    );
  }
});

test('financial balance remains property-scoped and accounts for credit, verified payments and partial reversals', () => {
  const sql = checkoutInvoiceBalanceSql('settlement');
  assert.match(sql, /invoice\.property_id=link\.property_id/);
  assert.match(sql, /payment\.property_id=invoice\.property_id/);
  assert.match(sql, /link\.property_id=settlement\.property_id/);
  assert.match(sql, /invoice\.credit_amount/);
  assert.match(sql, /payment\.payment_status='verified'/);
  assert.match(sql, /payment_reversal_allocations/);
  assert.match(sql, /LEAST\(link\.linked_amount/);
});
