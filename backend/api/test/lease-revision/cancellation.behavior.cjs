require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const { LeaseArchiveService } = require('../../src/modules/lease/lease-archive.service.ts');

const user = { id: 'admin', roles: ['admin'], permissions: ['lease.manage'], propertyIds: ['property'] };
function harness(options = {}) {
  const writes = [];
  const journal = new Map();
  let tail = Promise.resolve();
  const context = {
    lease: { id: 'lease', property_id: 'property', resident_id: 'resident', lease_code: 'LSE-TEST',
      lease_status: options.active ? 'active' : 'awaiting_activation', commercial_mode: options.sponsored ? 'owner_sponsored' : 'rent',
      recorded_start_date: '2026-10-05', recorded_end_date: '2027-10-05', term_months: 12,
      physical_check_in_recorded: false },
    room: { id: 'room', number: 'RK-06-03', plot_number: '6A' },
    financial: { related_transaction_count: options.money ? 1 : 0, recognized_income_amount: 0,
      verified_payment_amount: options.money ? 1000 : 0, pending_payment_amount: 0 },
    policies: { cancellation: { allowed: !options.occupied, code: options.occupied ? 'LEASE_CANCELLATION_REAL_OCCUPANCY' : null,
      message: options.occupied ? 'Kamar sudah dihuni; gunakan check-out.' : null,
      requires_mistaken_activation_confirmation: Boolean(options.active), financial_resolution_required: Boolean(options.money) } },
  };
  const bindings = {
    room_status: options.active ? 'awaiting_check_in' : 'reserved', resident_status: 'active',
    commitment_id: 'commitment', commitment_status: options.active ? 'completed' : 'committed',
    hold_id: 'hold', hold_status: options.active ? 'released' : 'committed',
    booking_lead_id: null, booking_lead_status: null, settlement: null, sponsored_term: null,
    binding_valid: true, room_conflict: false, active_access: false,
  };
  const repository = {
    async transaction(operation) {
      let release;
      const client = { async query(sql, values = []) {
        if (sql.includes('archive_scope')) return { rows: [{ property_id: 'property' }] };
        if (sql.includes('pg_advisory_xact_lock')) {
          const previous = tail; tail = new Promise((resolve) => { release = resolve; }); await previous;
        }
        if (sql.includes('archive_replay')) return { rows: journal.has(values[1]) ? [journal.get(values[1])] : [] };
        if (sql.includes('archive_bindings')) return { rows: [bindings] };
        if (sql.includes('archive_invoices')) return { rows: options.money ? [{ id: 'invoice', invoice_status: 'partially_paid' }] : [{ id: 'invoice', invoice_status: 'issued' }] };
        if (sql.includes('archive_record')) {
          const record = { id: values[0], property_id: values[1], lease_id: values[2], command_fingerprint: values[3],
            request_fingerprint: values[4], created_by_user_id: values[5], reason: values[6], previous_snapshot: JSON.parse(values[7]),
            result_snapshot: JSON.parse(values[8]), created_at: new Date() };
          journal.set(values[3], record); return { rows: [record], rowCount: 1 };
        }
        if (/^(\s*)(UPDATE|INSERT)/.test(sql)) writes.push({ sql, values });
        if (sql.includes('archive_release_room') && options.failRelease) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 1 };
      } };
      try { return await operation(client); } finally { release?.(); }
    },
  };
  const revision = { readInTransaction: async () => ({ data: context }) };
  const billing = { voidInvoiceInTransaction: async (...args) => {
    writes.push({ sql: 'canonical invoice void', values: args });
    if (options.failBilling) throw new Error('injected invoice failure');
  } };
  return { service: new LeaseArchiveService(repository, revision, billing), context, bindings, writes, journal };
}
async function proposal(h, overrides = {}) {
  const review = await h.service.previewCancellation(user, 'lease');
  return { reason: 'Penyewaan awal keliru dibuat', review_fingerprint: review.data.review_fingerprint, cancellation_confirmed: true,
    ...overrides };
}

test('real occupancy and non-Admin roles cannot review or cancel an archive', async () => {
  const occupied = harness({ occupied: true });
  await assert.rejects(occupied.service.previewCancellation(user, 'lease'), (error) => error.getResponse().code === 'LEASE_CANCELLATION_REAL_OCCUPANCY');
  assert.equal(occupied.writes.length, 0);
  const normal = harness();
  await assert.rejects(normal.service.previewCancellation({ ...user, roles: ['property_owner'] }, 'lease'), (error) => error.getStatus() === 403);
  await assert.rejects(normal.service.previewCancellation({ ...user, propertyIds: [] }, 'lease'), (error) => error.getStatus() === 403);
});

test('missing confirmation, key or a stale review never releases the room', async () => {
  const h = harness(); const dto = await proposal(h);
  for (const [input, key, expected] of [
    [{ ...dto, cancellation_confirmed: false }, 'key', 'LEASE_CANCELLATION_CONFIRMATION_REQUIRED'],
    [dto, undefined, 'IDEMPOTENCY_KEY_REQUIRED'],
    [{ ...dto, review_fingerprint: '0'.repeat(64) }, 'key', 'LEASE_CANCELLATION_REVIEW_STALE'],
  ]) await assert.rejects(h.service.cancel(user, 'lease', input, key), (error) => error.getResponse().code === expected);
  assert.equal(h.writes.length, 0);
});

test('mistaken administrative activation requires its separate confirmation', async () => {
  const h = harness({ active: true }); const dto = await proposal(h);
  await assert.rejects(h.service.cancel(user, 'lease', dto, 'key'), (error) => error.getResponse().code === 'LEASE_CANCELLATION_ACTIVATION_CONFIRMATION_REQUIRED');
  assert.equal(h.writes.length, 0);
  const result = await h.service.cancel(user, 'lease', { ...dto, mistaken_activation_confirmed: true }, 'key');
  assert.equal(result.data.archive.financial_resolution_state, 'not_required');
});

test('financial records remain unresolved and are not refunded, reversed or voided by archive', async () => {
  const h = harness({ money: true }); const dto = await proposal(h);
  const result = await h.service.cancel(user, 'lease', dto, 'key');
  assert.equal(result.data.archive.financial_resolution_state, 'pending_review');
  assert.equal(h.writes.some((write) => write.sql === 'canonical invoice void'), false);
  assert.equal(h.writes.some((write) => /UPDATE payments|payment_reversals|INSERT INTO.*refund/.test(write.sql)), false);
});

test('no-money cancellation uses canonical invoice void and releases only its own commitment/hold', async () => {
  const h = harness(); const dto = await proposal(h);
  await h.service.cancel(user, 'lease', dto, 'key');
  assert.equal(h.writes.filter((write) => write.sql === 'canonical invoice void').length, 1);
  assert.ok(h.writes.some((write) => /archive_release_room/.test(write.sql)));
  assert.ok(h.writes.some((write) => /archive_resident/.test(write.sql) && /NOT EXISTS/.test(write.sql)));
  assert.equal(h.writes.some((write) => /DELETE FROM/.test(write.sql)), false);
});

test('identical concurrent cancellation retries append one command and replay its original result', async () => {
  const h = harness(); const dto = await proposal(h);
  const results = await Promise.all([h.service.cancel(user, 'lease', dto, 'same'), h.service.cancel(user, 'lease', dto, 'same')]);
  assert.equal(h.journal.size, 1);
  assert.equal(h.writes.filter((write) => /archive_release_room/.test(write.sql)).length, 1);
  assert.deepEqual(results.map((result) => result.idempotent).sort(), [false, true]);
  await assert.rejects(h.service.cancel(user, 'lease', { ...dto, reason: 'Alasan berbeda' }, 'same'), (error) => error.getResponse().code === 'IDEMPOTENCY_KEY_REUSED');
});

test('unavailable access, inconsistent bindings or another claim prevent all writes', async () => {
  for (const patch of [{ binding_valid: false }, { active_access: true }, { room_conflict: true }, { room_status: 'occupied' }]) {
    const h = harness(); Object.assign(h.bindings, patch);
    await assert.rejects(h.service.previewCancellation(user, 'lease'), (error) => error.getStatus() === 409);
    assert.equal(h.writes.length, 0);
  }
});
