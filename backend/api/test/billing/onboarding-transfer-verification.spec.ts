import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..', '..');

test('verification permits onboarding payments while a lease awaits activation', () => {
  const source = readFileSync(
    join(root, 'src/modules/billing/services/w06-billing.service.ts'),
    'utf8',
  );

  assert.match(source, /isPreActivationOnboardingPayment/);
  assert.match(source, /settlement\.state === 'awaiting_activation'[\s\S]*!allowPreActivationRent/);
  assert.match(source, /payment\.command_fingerprint\?\.startsWith\('onboarding:'\) === true/);
  assert.match(source, /isPreActivationOnboardingPayment,/);
});
