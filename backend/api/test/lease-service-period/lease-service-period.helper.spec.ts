import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildServicePeriod,
  servicePeriodLabel,
} from '../../src/modules/lease/lease-service-period.helper';

void test('payment or administrative activation does not establish a service period', () => {
  assert.deepEqual(buildServicePeriod(null, 12), { startDate: null, endDate: null });
  assert.equal(
    servicePeriodLabel(true, 12),
    '12 bulan · Masa sewa belum dimulai—menunggu check-in',
  );
});

for (const termMonths of [1, 2, 3, 11, 12]) {
  void test(`${termMonths}-month period begins on physical check-in`, () => {
    const period = buildServicePeriod('2026-10-01', termMonths);
    const expectedEnd = new Date(Date.UTC(2026, 9 + termMonths, 1)).toISOString().slice(0, 10);
    assert.deepEqual(period, { startDate: '2026-10-01', endDate: expectedEnd });
  });
}

void test('month-end and leap-day periods preserve calendar month convention', () => {
  assert.equal(buildServicePeriod('2026-01-31', 1).endDate, '2026-02-28');
  assert.equal(buildServicePeriod('2024-02-29', 12).endDate, '2025-02-28');
  assert.throws(() => buildServicePeriod('2026-02-30', 12));
});
