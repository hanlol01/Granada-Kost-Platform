import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateHistoricalOwnerRealizationDto } from '../../src/modules/property-owner-management/dto/property-owner-management.dto';

const payload = {
  property_id: '11111111-1111-4111-8111-111111111111',
  period: '2026-08',
  entry_kind: 'historical_import',
  historical_source: 'Rekap Excel Agustus 2026',
  lines: [
    {
      room_code: 'RK-05-01',
      resident_name: 'Farhan Maulana',
      contract_total: 21_600_000,
      management_fee: 3_600_000,
    },
  ],
  transfers: [
    {
      amount: 9_000_000,
      method: 'bank_transfer',
      reference: 'TRX-OWNER-001',
      transferred_at: '2026-08-30T09:00:00.000Z',
    },
    {
      amount: 9_000_000,
      method: 'bank_transfer',
      reference: 'TRX-OWNER-002',
      evidence_reference: 'Bukti transfer 2',
      transferred_at: '2026-08-31T09:00:00.000Z',
    },
  ],
};

test('historical realization accepts multiple individually validated transfers', async () => {
  const errors = await validate(plainToInstance(CreateHistoricalOwnerRealizationDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  assert.deepEqual(errors, []);
});

test('historical realization rejects malformed transfer entries', async () => {
  const errors = await validate(
    plainToInstance(CreateHistoricalOwnerRealizationDto, {
      ...payload,
      transfers: [{ ...payload.transfers[0], amount: 0, method: 'wallet', reference: 'x' }],
    }),
    { whitelist: true, forbidNonWhitelisted: true },
  );

  assert.ok(errors.some((error) => error.property === 'transfers'));
});
