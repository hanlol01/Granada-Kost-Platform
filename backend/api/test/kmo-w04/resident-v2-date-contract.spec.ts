import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { toCanonicalResidentDate } from '../../src/modules/resident/resident.controller';

test('V2 resident detail serializes a database date as canonical date-only text', () => {
  assert.equal(toCanonicalResidentDate(new Date('2004-08-02T00:00:00.000Z')), '2004-08-02');
  assert.equal(toCanonicalResidentDate(null), null);
});
