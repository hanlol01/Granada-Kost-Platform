import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthService } from '../../src/modules/auth/auth.service';
import { IamRepository } from '../../src/modules/iam/repositories/iam.repository';
import { normalizeLoginIdentifier } from '../../src/modules/iam/identifier-normalizer';

void test('resident login accepts the local 0 phone form for a canonical 62 account', () => {
  assert.equal(normalizeLoginIdentifier('081222891172'), '6281222891172');
  assert.equal(normalizeLoginIdentifier('6281222891172'), '6281222891172');
  assert.equal(normalizeLoginIdentifier('+6281222891172'), '6281222891172');
});

void test('login normalization trims and canonicalizes email without changing malformed identifiers', () => {
  assert.equal(normalizeLoginIdentifier('  Resident@Example.Test '), 'resident@example.test');
  assert.equal(normalizeLoginIdentifier('not-an-email-or-phone'), 'not-an-email-or-phone');
  assert.equal(normalizeLoginIdentifier('  0812-2289-1172 '), '6281222891172');
});

void test('IAM lookup uses the canonical phone value for a local login input', async () => {
  let values: unknown[] = [];
  const repository = new IamRepository({
    client: {
      query: (_sql: string, queryValues: unknown[]) => {
        values = queryValues;
        return Promise.resolve({ rows: [] });
      },
    },
  } as never);

  await repository.findUserByIdentifier('081222891172');

  assert.deepEqual(values, ['6281222891172']);
});

void test('AuthService shares the canonical identifier with lookup and rate limiting', async () => {
  const calls: string[] = [];
  const service = new AuthService(
    {
      findUserByIdentifier: (identifier: string) => {
        calls.push(`iam:${identifier}`);
        return Promise.resolve(null);
      },
    } as never,
    {
      write: () => Promise.resolve(),
    } as never,
    {} as never,
    {} as never,
    {
      assertLoginAllowed: (identifier: string) => {
        calls.push(`allow:${identifier}`);
        return Promise.resolve();
      },
      clearLoginAttempts: (identifier: string) => {
        calls.push(`clear:${identifier}`);
        return Promise.resolve();
      },
    } as never,
  );

  await assert.rejects(
    service.login(
      { identifier: '081222891172', password: 'incorrect' },
      { ipAddress: '127.0.0.1' },
    ),
    (error: unknown) => (error as { status?: number }).status === 401,
  );

  assert.deepEqual(calls, ['allow:6281222891172', 'iam:6281222891172']);
});
