const assert = require('node:assert/strict');
const test = require('node:test');
const { randomBytes } = require('node:crypto');
const argon2 = require('argon2');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
const { OwnerAccountService } = require('../../dist/modules/auth/owner-account.service.js');
const { AuthService } = require('../../dist/modules/auth/auth.service.js');
const { JwtAuthGuard } = require('../../dist/modules/rbac/guards/jwt-auth.guard.js');
const { DatabaseService } = require('../../dist/infrastructure/database/database.service.js');
const { ChangeOwnerEmailDto } = require('../../dist/modules/auth/dto/change-owner-email.dto.js');

const password = randomBytes(24).toString('hex');
const passwordHash = argon2.hash(password);
const actor = { id: '00000000-0000-4000-8000-000000000001', roles: ['property_owner'], permissions: [], propertyIds: [] };

test('revoked sessions reject even a cryptographically valid access token', async () => {
  const guard = new JwtAuthGuard({ verifyAsync: async () => ({ sub: actor.id, session_id: 'session' }) },
    { getOrThrow: () => 'test-only' },
    { findSessionById: async () => ({ userId: actor.id, revokedAt: new Date(), expiresAt: new Date(Date.now() + 60000) }), getAccessContext: () => assert.fail('Revoked token must not resolve account context') });
  await assert.rejects(guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer test-token' } }) }) }),
    (error) => error.getResponse().code === 'UNAUTHENTICATED');
});

async function fixture(options = {}) {
  const hash = await passwordHash;
  const queries = [];
  const state = { accountEmail: 'old@example.test', profileEmail: 'old@example.test', revoked: false, audits: [] };
  let saved;
  let released = false;
  const client = {
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql === 'BEGIN') { saved = structuredClone(state); return { rows: [] }; }
      if (sql === 'COMMIT') return { rows: [] };
      if (sql === 'ROLLBACK') { Object.assign(state, saved); return { rows: [] }; }
      if (sql.includes('FROM users account')) return { rows: options.missing ? [] : [{ id: actor.id, profile_id: 'profile', email: state.accountEmail, password_hash: hash }] };
      if (sql.startsWith('SELECT id FROM users')) return { rows: options.duplicate ? [{ id: 'another-user' }] : [] };
      if (sql.startsWith('UPDATE users')) { state.accountEmail = values[1]; return { rows: [] }; }
      if (sql.includes('UPDATE property_owner_profiles')) {
        if (options.uniqueRace) throw Object.assign(new Error('duplicate'), { code: '23505' });
        state.profileEmail = values[1]; return { rows: [] };
      }
      if (sql.includes('UPDATE user_sessions')) { state.revoked = true; return { rows: [] }; }
      if (sql.includes('INSERT INTO auth_audit_logs')) {
        if (options.auditFailure) throw new Error('audit unavailable');
        state.audits.push(JSON.parse(values[4])); return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() { released = true; },
  };
  // Execute the production transaction method, including COMMIT/ROLLBACK/release.
  const database = { transaction(operation) { return DatabaseService.prototype.transaction.call({ pool: { connect: async () => client } }, operation); } };
  return { service: new OwnerAccountService(database), state, queries, released: () => released };
}

const command = (email = ' NEW@example.test ', current_password = password) => ({ email, current_password });
const code = (expected) => (error) => error.getResponse?.().code === expected;

test('only Property Owner can execute own-email change', async () => {
  const f = await fixture();
  await assert.rejects(f.service.changeEmail({ ...actor, roles: ['resident'] }, command(), {}), code('OWNER_ACCOUNT_ACCESS_DENIED'));
  assert.equal(f.queries.length, 0);
});

test('wrong password and missing Owner link do not write account data', async () => {
  for (const [options, input, expected] of [[{}, command(undefined, 'incorrect'), 'CURRENT_PASSWORD_INVALID'], [{ missing: true }, command(), 'OWNER_ACCOUNT_CONTEXT_INVALID']]) {
    const f = await fixture(options);
    await assert.rejects(f.service.changeEmail(actor, input, {}), code(expected));
    assert.equal(f.state.accountEmail, 'old@example.test');
    assert.equal(f.state.revoked, false);
    assert.equal(f.state.audits.length, 0);
    assert.ok(f.queries.some(({ sql }) => sql === 'ROLLBACK'));
    assert.equal(f.released(), true);
  }
});

test('duplicate email is rejected before writes', async () => {
  const f = await fixture({ duplicate: true });
  await assert.rejects(f.service.changeEmail(actor, command(), {}), code('OWNER_EMAIL_ALREADY_USED'));
  assert.equal(f.state.accountEmail, 'old@example.test');
  assert.equal(f.state.revoked, false);
});

test('normalizes email, updates only authenticated account/profile, revokes sessions and audits without password', async () => {
  const f = await fixture();
  assert.deepEqual(await f.service.changeEmail(actor, command(), {}), { success: true, changed: true });
  assert.equal(f.state.accountEmail, 'new@example.test');
  assert.equal(f.state.profileEmail, 'new@example.test');
  assert.equal(f.state.revoked, true);
  assert.deepEqual(f.state.audits, [{ old_email: 'old@example.test', new_email: 'new@example.test' }]);
  assert.equal(f.queries.find(({ sql }) => sql.includes('FROM users account')).values[0], actor.id);
  assert.equal(f.queries.find(({ sql }) => sql.startsWith('UPDATE users')).values[0], actor.id);
  assert.equal(f.queries.at(-1).sql, 'COMMIT');
  assert.equal(f.released(), true);
});

test('same normalized email is a no-op without a new audit or session revocation', async () => {
  const f = await fixture();
  assert.deepEqual(await f.service.changeEmail(actor, command(' OLD@example.test '), {}), { success: true, changed: false });
  assert.equal(f.state.revoked, false);
  assert.equal(f.state.audits.length, 0);
});

test('uniqueness race and failed audit roll back every account/profile/session change', async () => {
  for (const options of [{ uniqueRace: true }, { auditFailure: true }]) {
    const f = await fixture(options);
    await assert.rejects(f.service.changeEmail(actor, command(), {}), options.uniqueRace ? code('OWNER_EMAIL_ALREADY_USED') : /audit unavailable/);
    assert.equal(f.state.accountEmail, 'old@example.test');
    assert.equal(f.state.profileEmail, 'old@example.test');
    assert.equal(f.state.revoked, false);
    assert.equal(f.state.audits.length, 0);
    assert.equal(f.queries.at(-1).sql, 'ROLLBACK');
    assert.equal(f.released(), true);
  }
});

test('email DTO normalizes valid email and rejects invalid address or missing password', () => {
  const valid = plainToInstance(ChangeOwnerEmailDto, command());
  assert.equal(valid.email, 'new@example.test');
  assert.equal(validateSync(valid).length, 0);
  assert.ok(validateSync(plainToInstance(ChangeOwnerEmailDto, command('not-an-email'))).length > 0);
  assert.ok(validateSync(plainToInstance(ChangeOwnerEmailDto, command(undefined, ''))).length > 0);
});

test('existing password command verifies old password, hashes new password and revokes all sessions', async () => {
  let changedHash;
  let revoked = false;
  const iam = { findUserById: async () => ({ passwordHash: await passwordHash }), changePassword: async (id, hash) => { assert.equal(id, actor.id); changedHash = hash; }, revokeAllSessions: async (id) => { assert.equal(id, actor.id); revoked = true; } };
  const auth = new AuthService(iam, { write: async () => {} }, {}, {}, {});
  await assert.rejects(auth.changePassword(actor, { current_password: 'incorrect', new_password: password + 'next' }, {}), code('CURRENT_PASSWORD_INVALID'));
  assert.equal(changedHash, undefined);
  assert.equal(revoked, false);
  await auth.changePassword(actor, { current_password: password, new_password: password + 'next' }, {});
  assert.equal(await argon2.verify(changedHash, password + 'next'), true);
  assert.equal(revoked, true);
});
