import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('W09B complaint and maintenance authority contracts', () => {
  test('complaint lifecycle mutations use the shared command boundary', () => {
    const source = read('src/modules/complaint/services/complaint.service.ts');
    assert.ok(source.includes('idempotencyKey'));
    assert.ok(source.includes('this.database.transaction'));
    assert.ok(source.includes('INSERT INTO business_events'));
    assert.ok(source.includes('complaint.status_changed'));
    assert.ok(source.includes('findByIdForUpdate'));
    assert.ok(source.includes('this.histories.record'));
  });

  test('work-order lifecycle mutations are transactional and replay-safe', () => {
    const source = read('src/modules/maintenance/services/work-order.service.ts');
    assert.ok(source.includes('DatabaseService'));
    assert.ok(source.includes('idempotencyKey'));
    assert.ok(source.includes('this.database.transaction'));
    assert.ok(source.includes('INSERT INTO business_events'));
    assert.ok(source.includes('work_order.status_changed'));
    assert.ok(source.includes('findByIdForUpdate'));
  });

  test('Admin exposes the full work-order lifecycle without bypassing the service', () => {
    const source = read('src/modules/maintenance/controllers/work-order.controller.ts');
    for (const action of ['assign', 'start', 'complete', 'verify', 'rework', 'cancel']) {
      assert.ok(source.includes(`:${'workOrderId'}/${action}`));
    }
    assert.ok(source.includes("request.headers['idempotency-key']"));
  });

  test('schema protects one actionable work order per complaint', () => {
    const migration = read(
      'src/infrastructure/database/migrations/044_complaint_maintenance_w09b.sql',
    );
    assert.ok(migration.includes('uq_maintenance_work_orders_actionable_complaint'));
    assert.ok(migration.includes('complaint.status_changed'));
  });
});
