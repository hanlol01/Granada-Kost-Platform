import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { AuthService } from '../../src/modules/auth/auth.service';
import { IamRepository } from '../../src/modules/iam/repositories/iam.repository';
import type { UserAccessContext } from '../../src/modules/iam/types/iam.types';

const root = resolve(__dirname, '../..');
const ACTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROPERTY_A = '11111111-1111-4111-8111-111111111111';
const PROPERTY_B = '22222222-2222-4222-8222-222222222222';

function user(propertyIds: string[] = [PROPERTY_A]): UserAccessContext {
  return {
    id: ACTOR_ID,
    email: 'actor@example.test',
    phone: null,
    displayName: 'Rollout Actor',
    roles: ['manager'],
    permissions: ['room.read', 'lease.read', 'billing.read'],
    propertyIds,
    sessionId: 'session-rollout',
  };
}

function serviceWithIam(iam: object, jwt: object = {}, config: object = {}): AuthService {
  return new AuthService(iam as never, {} as never, jwt as never, config as never, {} as never);
}

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `Missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

function assertExactRollout(value: unknown): void {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  const rollout = value as Record<string, unknown>;
  assert.deepEqual(Object.keys(rollout), ['propertyId', 'adminUxRead', 'bookingHoldWrite']);
  assert.deepEqual(Object.keys(rollout.adminUxRead as object), ['enabled']);
  assert.deepEqual(Object.keys(rollout.bookingHoldWrite as object), ['enabled']);
  assert.equal(typeof (rollout.adminUxRead as { enabled?: unknown }).enabled, 'boolean');
  assert.equal(typeof (rollout.bookingHoldWrite as { enabled?: unknown }).enabled, 'boolean');
}

void test('M7-D2B1B repository resolves active rollouts in one deterministic query', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new IamRepository({
    client: {
      query: (text: string, values: unknown[]) => {
        queries.push({ text, values });
        return Promise.resolve({
          rows: [
            { property_id: PROPERTY_A, admin_ux_read: null, booking_hold_write: null },
            { property_id: PROPERTY_B, admin_ux_read: true, booking_hold_write: true },
          ],
        });
      },
    },
  } as never);

  const result = await repository.listAdminUxReadPropertyRollouts(ACTOR_ID);

  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].values, [ACTOR_ID]);
  assert.doesNotMatch(queries[0].text, /\$2/);
  assert.deepEqual(result, [
    { propertyId: PROPERTY_A, enabled: false, bookingHoldWriteEnabled: false },
    { propertyId: PROPERTY_B, enabled: true, bookingHoldWriteEnabled: true },
  ]);

  const sql = queries[0].text;
  assert.match(sql, /FROM properties/);
  assert.match(sql, /CROSS JOIN actor_access/);
  assert.match(sql, /LEFT JOIN property_feature_flags/);
  assert.match(sql, /properties\.status = 'active'/);
  assert.match(sql, /COALESCE\(property_feature_flags\.admin_ux_read, FALSE\)/);
  assert.match(sql, /COALESCE\(property_feature_flags\.booking_hold_write, FALSE\)/);
  assert.match(sql, /ORDER BY properties\.id ASC/);
  assert.doesNotMatch(sql, /\bDISTINCT\b/);
  assert.doesNotMatch(sql, /lease_write|lease_transfer|lease_billing_scheduler/);
});

void test('M7-D2B1B treats every unrevoked owner assignment as global', async () => {
  let sql = '';
  const repository = new IamRepository({
    client: {
      query: (text: string) => {
        sql = text;
        return Promise.resolve({ rows: [] });
      },
    },
  } as never);

  await repository.listAdminUxReadPropertyRollouts(ACTOR_ID);
  const ownerBranch = section(
    sql,
    'FROM user_property_roles AS owner_assignment',
    ') AS has_global_property_read',
  );

  assert.match(ownerBranch, /owner_assignment\.user_id = \$1::uuid/);
  assert.match(ownerBranch, /owner_assignment\.revoked_at IS NULL/);
  assert.match(ownerBranch, /owner_role\.code = 'owner'/);
  assert.doesNotMatch(ownerBranch, /property_id/);
});

void test('M7-D2B1B mirrors effective manager and admin property scope server-side', async () => {
  let sql = '';
  const repository = new IamRepository({
    client: {
      query: (text: string) => {
        sql = text;
        return Promise.resolve({ rows: [] });
      },
    },
  } as never);

  await repository.listAdminUxReadPropertyRollouts(ACTOR_ID);
  const roleBranch = section(
    sql,
    'FROM user_property_roles AS scoped_role_assignment',
    ') AS has_scoped_dashboard_role',
  );
  const propertyBranch = section(
    sql,
    'FROM user_property_roles AS scoped_assignment',
    'ORDER BY properties.id ASC',
  );

  assert.match(roleBranch, /scoped_role_assignment\.user_id = \$1::uuid/);
  assert.match(roleBranch, /scoped_role_assignment\.revoked_at IS NULL/);
  assert.match(roleBranch, /scoped_role\.code IN \('manager', 'admin'\)/);
  assert.doesNotMatch(roleBranch, /property_id = properties\.id/);
  assert.match(propertyBranch, /scoped_assignment\.user_id = \$1::uuid/);
  assert.match(propertyBranch, /scoped_assignment\.revoked_at IS NULL/);
  assert.match(propertyBranch, /scoped_assignment\.property_id = properties\.id/);
  assert.doesNotMatch(propertyBranch, /JOIN roles|role\.code/);
});

void test('M7-D2B1B adds only the exact rollout carrier to auth me', async () => {
  const calls: string[] = [];
  const service = serviceWithIam({
    listAdminUxReadPropertyRollouts: (userId: string) => {
      calls.push(userId);
      return Promise.resolve([
        { propertyId: PROPERTY_A, enabled: false, bookingHoldWriteEnabled: null },
        { propertyId: PROPERTY_B, enabled: true, bookingHoldWriteEnabled: true },
      ]);
    },
  });

  const response = await service.me(user());

  assert.deepEqual(calls, [ACTOR_ID]);
  assert.deepEqual(Object.keys(response), [
    'id',
    'email',
    'phone',
    'displayName',
    'roles',
    'permissions',
    'propertyIds',
    'property_ids',
    'propertyRollouts',
  ]);
  assert.deepEqual(response.propertyRollouts, [
    {
      propertyId: PROPERTY_A,
      adminUxRead: { enabled: false },
      bookingHoldWrite: { enabled: false },
    },
    {
      propertyId: PROPERTY_B,
      adminUxRead: { enabled: true },
      bookingHoldWrite: { enabled: true },
    },
  ]);
  for (const rollout of response.propertyRollouts) assertExactRollout(rollout);
  assert.doesNotMatch(
    JSON.stringify(response),
    /property_rollouts|admin_ux_read|leaseWrite|leaseTransfer|leaseBillingScheduler/,
  );

  const emptyResponse = await serviceWithIam({
    listAdminUxReadPropertyRollouts: () => Promise.resolve([]),
  }).me(user([]));
  assert.deepEqual(emptyResponse.propertyRollouts, []);
});

void test('M14 rollout addition remains exact and fails closed without truthy coercion', async () => {
  const response = await serviceWithIam({
    listAdminUxReadPropertyRollouts: () =>
      Promise.resolve([
        { propertyId: PROPERTY_A, enabled: true },
        { propertyId: PROPERTY_B, enabled: true, bookingHoldWriteEnabled: 'true' },
      ]),
  }).me(user([PROPERTY_A, PROPERTY_B]));

  assert.deepEqual(
    response.propertyRollouts.map((rollout) => rollout.bookingHoldWrite.enabled),
    [false, false],
  );
  for (const rollout of response.propertyRollouts) assertExactRollout(rollout);

  const canonical = response.propertyRollouts[0];
  assert.throws(() => {
    const { bookingHoldWrite: _missing, ...mutation } = canonical;
    assertExactRollout(mutation);
  });
  assert.throws(() =>
    assertExactRollout({
      ...canonical,
      bookingHoldWrite: { enabled: 'true' },
    }),
  );
  assert.throws(() => assertExactRollout({ ...canonical, unexpected: true }));
});

void test('M7-D2B1B fails closed to an empty carrier when the rollout query rejects', async () => {
  const sentinel = 'raw-rollout-query-sentinel';
  const actor = user([PROPERTY_A, PROPERTY_B]);
  const service = serviceWithIam({
    listAdminUxReadPropertyRollouts: () => Promise.reject(new Error(sentinel)),
  });

  const response = await service.me(actor);

  assert.deepEqual(response, {
    id: actor.id,
    email: actor.email,
    phone: actor.phone,
    displayName: actor.displayName,
    roles: actor.roles,
    permissions: actor.permissions,
    propertyIds: actor.propertyIds,
    property_ids: actor.propertyIds,
    propertyRollouts: [],
  });
  const serialized = JSON.stringify(response);
  assert.equal(serialized.includes(sentinel), false);
  assert.doesNotMatch(
    serialized,
    /property_rollouts|admin_ux_read|leaseWrite|leaseTransfer|leaseBillingScheduler/,
  );
});

void test('M7-D2B1B keeps token users, access context, and JWT claims carrier-free', async () => {
  const jwtCalls: Array<{
    payload: Record<string, unknown>;
    options: Record<string, unknown>;
  }> = [];
  const service = serviceWithIam(
    {},
    {
      signAsync: (payload: Record<string, unknown>, options: Record<string, unknown>) => {
        jwtCalls.push({ payload, options });
        return Promise.resolve('signed-token');
      },
    },
    {
      getOrThrow: (key: string) =>
        ({
          'auth.jwtAccessSecret': 'test-secret',
          'auth.jwtAccessTtlSeconds': 900,
        })[key as 'auth.jwtAccessSecret' | 'auth.jwtAccessTtlSeconds'],
    },
  );
  const internals = service as unknown as {
    serializeUser(value: UserAccessContext): Record<string, unknown>;
    signAccessToken(value: UserAccessContext): Promise<string>;
  };
  const actor = user();

  assert.deepEqual(Object.keys(internals.serializeUser(actor)), [
    'id',
    'email',
    'phone',
    'displayName',
    'roles',
    'permissions',
    'propertyIds',
    'property_ids',
  ]);
  assert.equal(await internals.signAccessToken(actor), 'signed-token');
  assert.deepEqual(jwtCalls, [
    {
      payload: {
        sub: actor.id,
        session_id: actor.sessionId,
        roles: actor.roles,
        property_ids: actor.propertyIds,
      },
      options: { secret: 'test-secret', expiresIn: 900 },
    },
  ]);

  const [responseTypes, authService, iamTypes] = await Promise.all([
    readFile(resolve(root, 'src/modules/auth/types/auth-response.types.ts'), 'utf8'),
    readFile(resolve(root, 'src/modules/auth/auth.service.ts'), 'utf8'),
    readFile(resolve(root, 'src/modules/iam/types/iam.types.ts'), 'utf8'),
  ]);
  assert.match(
    responseTypes,
    /export type AuthMeResponse = AuthUserResponse & \{[\s\S]*propertyRollouts: AuthPropertyRolloutResponse\[\];/,
  );
  assert.match(responseTypes, /export type AuthTokenResponse = \{[\s\S]*user: AuthUserResponse;/);
  assert.equal((authService.match(/listAdminUxReadPropertyRollouts/g) ?? []).length, 1);

  const refreshBlock = section(authService, '  async refresh(', '  async logout(');
  const issueTokensBlock = section(
    authService,
    '  private async issueTokens(',
    '  private signAccessToken(',
  );
  const serializeUserBlock = section(
    authService,
    '  private serializeUser(',
    '  private safeIdentifier(',
  );
  assert.match(refreshBlock, /user: this\.serializeUser\(accessContext\)/);
  assert.doesNotMatch(refreshBlock, /propertyRollouts|listAdminUxReadPropertyRollouts/);
  assert.match(issueTokensBlock, /user: this\.serializeUser\(accessContext\)/);
  assert.doesNotMatch(issueTokensBlock, /propertyRollouts|listAdminUxReadPropertyRollouts/);
  assert.doesNotMatch(serializeUserBlock, /propertyRollouts|adminUxRead/);
  assert.doesNotMatch(iamTypes, /propertyRollouts|adminUxRead|admin_ux_read/);
});
