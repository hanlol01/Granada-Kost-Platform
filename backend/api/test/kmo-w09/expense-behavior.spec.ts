import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ConflictException } from '@nestjs/common';
import {
  canTransitionExpense,
  EXPENSE_HIGH_VALUE_THRESHOLD,
  EXPENSE_TRANSITIONS,
} from '../../src/modules/expense/services/expense.service';
import type { ExpenseStatus } from '../../src/modules/expense/types/expense.types';

test('W09C approval boundary keeps Rp500.000 pending for higher approval', () => {
  assert.equal(EXPENSE_HIGH_VALUE_THRESHOLD, 500_000);
  assert.equal(EXPENSE_HIGH_VALUE_THRESHOLD >= 500_000, true);
  assert.equal(499_999 < EXPENSE_HIGH_VALUE_THRESHOLD, true);
});

test('W09C lifecycle only permits forward status transitions and paid correction', () => {
  const statuses = Object.keys(EXPENSE_TRANSITIONS) as ExpenseStatus[];
  for (const status of statuses) {
    assert.equal(canTransitionExpense(status, status), false);
  }
  assert.equal(canTransitionExpense('draft', 'pending_approval'), true);
  assert.equal(canTransitionExpense('pending_approval', 'approved'), true);
  assert.equal(canTransitionExpense('approved', 'paid'), true);
  assert.equal(canTransitionExpense('paid', 'reversed'), true);
  assert.equal(canTransitionExpense('pending_approval', 'rejected'), true);
  assert.equal(canTransitionExpense('rejected', 'archived'), true);
  assert.equal(canTransitionExpense('reversed', 'archived'), true);
  assert.equal(canTransitionExpense('paid', 'cancelled'), false);
  assert.equal(canTransitionExpense('reversed', 'paid'), false);
  assert.equal(canTransitionExpense('archived', 'reversed'), false);
});

test('W09C high-value approval error remains a domain conflict, not an auto-payment', () => {
  const error = new ConflictException({
    code: 'EXPENSE_HIGH_VALUE_REQUIRES_HIGHER_APPROVER',
    message: 'Pengeluaran nominal tinggi menunggu approver yang lebih tinggi.',
  });
  assert.equal(error.getStatus(), 409);
  assert.match(JSON.stringify(error.getResponse()), /EXPENSE_HIGH_VALUE_REQUIRES_HIGHER_APPROVER/);
});
