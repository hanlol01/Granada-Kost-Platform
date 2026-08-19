import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOT = existsSync(join(process.cwd(), 'backend'))
  ? process.cwd()
  : join(process.cwd(), '..', '..', '..');
const migration = readFileSync(
  join(ROOT, 'backend/api/src/infrastructure/database/migrations/045_expense_lifecycle_w09c.sql'),
  'utf8',
);
const controller = readFileSync(
  join(ROOT, 'backend/api/src/modules/expense/controllers/expense.controller.ts'),
  'utf8',
);
const service = readFileSync(
  join(ROOT, 'backend/api/src/modules/expense/services/expense.service.ts'),
  'utf8',
);

test('W09C migration defines the property-scoped append-only expense authority', () => {
  for (const table of [
    'expenses',
    'expense_status_histories',
    'expense_payments',
    'expense_reversals',
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migration, /EXPENSE_ORIGINAL_APPEND_ONLY/);
  assert.match(migration, /EXPENSE_EVIDENCE_APPEND_ONLY/);
  assert.match(migration, /EXPENSE_EVIDENCE_SCOPE_DENIED/);
  assert.match(migration, /business_events/); // migration prerequisite: outbox authority exists
  assert.match(migration, /expense_proof/);
});

test('W09C API is Admin/manager/owner billing-scoped and idempotency protected', () => {
  assert.match(controller, /@RequireRoles\('owner', 'manager', 'admin'\)/);
  assert.match(controller, /@RequirePermissions\('billing\.manage'\)/);
  assert.match(controller, /IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(controller, /assertCanReadProperty/);
});

test('W09C service preserves threshold and financial correction boundaries', () => {
  assert.match(service, /EXPENSE_HIGH_VALUE_THRESHOLD = 500_000/);
  assert.match(service, /EXPENSE_HIGH_VALUE_REQUIRES_HIGHER_APPROVER/);
  assert.match(service, /EXPENSE_APPROVAL_REQUIRED/);
  assert.match(service, /EXPENSE_REVERSAL_REQUIRES_PAID/);
  assert.match(service, /business_events/);
  assert.match(service, /audit\.write/);
});
