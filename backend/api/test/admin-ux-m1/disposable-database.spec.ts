import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { disposableDatabaseTargetFromEnv } from '../../src/infrastructure/database/scripts/admin-ux-m1/disposable-database';

function disposableEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: 'postgresql://qa_runner:qa_password@127.0.0.1:5432/granada_kost_m1_qa',
    ADMIN_UX_QA_DISPOSABLE: 'true',
    NODE_ENV: 'test',
    ...overrides,
  };
}

test('accepts an explicit local M1 disposable database target', () => {
  const target = disposableDatabaseTargetFromEnv(disposableEnvironment());

  assert.deepEqual(
    { database: target.database, host: target.host, port: target.port },
    { database: 'granada_kost_m1_qa', host: '127.0.0.1', port: '5432' },
  );
});

test('refuses a missing disposable marker before any connection', () => {
  const environment = disposableEnvironment({ ADMIN_UX_QA_DISPOSABLE: undefined });

  assert.throws(() => disposableDatabaseTargetFromEnv(environment), /ADMIN_UX_QA_DISPOSABLE=true/);
});

test('refuses production and staging environments before any connection', () => {
  assert.throws(
    () => disposableDatabaseTargetFromEnv(disposableEnvironment({ NODE_ENV: 'production' })),
    /refuse NODE_ENV production or staging/,
  );
  assert.throws(
    () => disposableDatabaseTargetFromEnv(disposableEnvironment({ NODE_ENV: 'staging' })),
    /refuse NODE_ENV production or staging/,
  );
});

test('refuses production-like database names and unapproved hosts', () => {
  assert.throws(
    () =>
      disposableDatabaseTargetFromEnv(
        disposableEnvironment({
          DATABASE_URL: 'postgresql://qa_runner:qa_password@127.0.0.1:5432/granada_prod_m1_qa',
        }),
      ),
    /production or staging-like targets/,
  );
  assert.throws(
    () =>
      disposableDatabaseTargetFromEnv(
        disposableEnvironment({
          DATABASE_URL: 'postgresql://qa_runner:qa_password@database.example.test:5432/granada_kost_m1_qa',
        }),
      ),
    /not an approved disposable host/,
  );
});

test('requires an M1 QA database name even on a local host', () => {
  assert.throws(
    () =>
      disposableDatabaseTargetFromEnv(
        disposableEnvironment({
          DATABASE_URL: 'postgresql://qa_runner:qa_password@127.0.0.1:5432/granada_kost',
        }),
      ),
    /must end in _m1_qa/,
  );
});

test('allows an explicitly allowlisted CI service host', () => {
  const target = disposableDatabaseTargetFromEnv(
    disposableEnvironment({
      DATABASE_URL: 'postgresql://qa_runner:qa_password@postgres:5432/granada_kost_m1_qa_ci',
      ADMIN_UX_QA_ALLOWED_HOSTS: 'postgres',
    }),
  );

  assert.equal(target.host, 'postgres');
});
