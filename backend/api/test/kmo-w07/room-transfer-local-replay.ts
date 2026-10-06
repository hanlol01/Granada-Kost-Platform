// Opt-in diagnostic: clone an explicitly selected LOCAL database into a disposable
// PostgreSQL cluster. All room-transfer writes occur in the clone and are removed.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { Pool } from 'pg';
import { explicitDatabaseConfigFromEnv } from '../../src/infrastructure/database/scripts/database-url';
import { LeaseRepository } from '../../src/modules/lease/lease.repository';
import { LeaseFeatureService } from '../../src/modules/lease/lease-feature.service';
import { LeaseTransferService } from '../../src/modules/lease/lease-transfer.service';
import { contractRoomIdSql } from '../../src/modules/lease/helpers/contract-room-reference.helper';
import type { UserAccessContext } from '../../src/modules/iam/types/iam.types';

async function main() {
  assert.equal(process.env.KOSTATION_TRANSFER_REPLAY, '1', 'Explicit local replay opt-in required');
  loadEnv({ path: resolve('.env') });
  loadEnv({ path: resolve('.env.local'), override: true });
  const source = explicitDatabaseConfigFromEnv();
  const sourceUrl = source.connectionString ? new URL(source.connectionString) : null;
  const host = sourceUrl?.hostname ?? source.host;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(host!), 'Replay source must be local');
  const password = sourceUrl ? decodeURIComponent(sourceUrl.password) : source.password;
  assert.equal(typeof password, 'string');
  const bin = process.env.KOSTATION_POSTGRES_BIN!;
  assert.ok(bin, 'KOSTATION_POSTGRES_BIN required');
  const directory = mkdtempSync(join(tmpdir(), 'kostation-room-transfer-replay-'));
  const cluster = join(directory, 'cluster');
  const archive = join(directory, 'source.dump');
  const port = 59500 + Math.floor(Math.random() * 300);
  const pg = (name: string) => join(bin, process.platform === 'win32' ? `${name}.exe` : name);
  const run = (name: string, args: string[], env = process.env) => {
    const result = spawnSync(pg(name), args, { encoding: 'utf8', env, windowsHide: true });
    assert.equal(result.status, 0, `${name} failed: ${result.stderr}`);
  };
  let started = false;
  let pool: Pool | undefined;
  try {
    run('pg_dump', ['--format=custom', '--file', archive, '--no-owner', '--no-privileges'], {
      ...process.env,
      PGHOST: host!,
      PGPORT: String(sourceUrl?.port || source.port || 5432),
      PGUSER: sourceUrl ? decodeURIComponent(sourceUrl.username) : source.user!,
      PGPASSWORD: password as string,
      PGDATABASE: sourceUrl ? decodeURIComponent(sourceUrl.pathname.slice(1)) : source.database!,
    });
    run('initdb', [
      '-D',
      cluster,
      '-A',
      'trust',
      '-U',
      'postgres',
      '--no-locale',
      '--encoding=UTF8',
    ]);
    const server = spawn(
      pg('pg_ctl'),
      ['-D', cluster, '-o', `-h 127.0.0.1 -p ${port}`, '-W', 'start'],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      },
    );
    server.unref();
    started = true;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        spawnSync(pg('pg_isready'), ['-h', '127.0.0.1', '-p', String(port)], { windowsHide: true })
          .status === 0
      )
        break;
      await new Promise((done) => setTimeout(done, 100));
    }
    run('pg_restore', [
      '--host=127.0.0.1',
      `--port=${port}`,
      '--username=postgres',
      '--dbname=postgres',
      '--no-owner',
      '--no-privileges',
      '--exit-on-error',
      archive,
    ]);
    pool = new Pool({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
    await pool.query(
      readFileSync(
        resolve('src/infrastructure/database/migrations/113_room_transfer_contract_addendum.sql'),
        'utf8',
      ),
    );
    const residentId =
      process.env.KOSTATION_REPLAY_RESIDENT_ID ?? 'f0984325-b302-4e07-947e-cc4c9d756d32';
    const {
      rows: [lease],
    } = await pool.query(
      `SELECT l.* FROM leases l WHERE resident_id=$1 AND lease_status='active'`,
      [residentId],
    );
    assert.ok(lease, 'Replay needs an active source lease');
    const financialState = async () =>
      (
        await pool!.query(
          `SELECT jsonb_build_object(
        'invoices', (SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY id), '[]') FROM invoices i WHERE lease_id=$1),
        'allocations', (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id), '[]') FROM payment_allocations a JOIN invoices i ON i.id=a.invoice_id WHERE i.lease_id=$1),
        'payments', (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY id), '[]') FROM payments p WHERE lease_id=$1),
        'deposit', (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY id), '[]') FROM lease_deposit_transactions d WHERE lease_id=$1)) AS state`,
          [lease.id],
        )
      ).rows[0].state;
    const beforeFinance = await financialState();
    const {
      rows: [admin],
    } = await pool.query(
      `SELECT id FROM users WHERE user_status='active' ORDER BY created_at LIMIT 1`,
    );
    const {
      rows: [room],
    } = await pool.query(
      `SELECT r.id,r.number FROM rooms r JOIN residents p ON p.id=$2
       JOIN room_buildings b ON b.id=r.building_id
       WHERE r.property_id=$1 AND r.room_status='vacant' AND r.kost_type_id IS NOT NULL
         AND (r.gender_policy='mixed' OR r.gender_policy=p.gender)
         AND (b.gender_policy='mixed' OR b.gender_policy=p.gender)
         AND NOT EXISTS (SELECT 1 FROM leases l WHERE l.room_id=r.id AND l.lease_status='active')
       ORDER BY r.number LIMIT 1`,
      [lease.property_id, residentId],
    );
    assert.ok(room, 'Replay needs a compatible vacant target room');
    const actor: UserAccessContext = {
      id: admin.id,
      email: null,
      phone: null,
      displayName: 'Replay Admin',
      roles: ['admin'],
      permissions: ['lease.manage', 'billing.manage'],
      propertyIds: [lease.property_id],
      sessionId: randomUUID(),
    };
    const repository = new LeaseRepository({ client: pool } as never);
    const service = new LeaseTransferService(repository, new LeaseFeatureService(repository));
    const { data: preview } = await service.preview(actor, lease.id, {
      target_room_id: room.id,
      transfer_path: 'same_day_exception',
    });
    const deposit = preview.deposit as { top_up_required_amount: number };
    console.log(
      JSON.stringify({ phase: 'preview', target: room.number, deposit, billing: preview.billing }),
    );
    const command = {
      target_room_id: room.id,
      effective_date: preview.effective_date as string,
      reason_code: 'resident_request' as const,
      exception_reason: 'Disposable regression replay',
      ...(deposit.top_up_required_amount > 0
        ? {
            top_up: {
              amount: deposit.top_up_required_amount,
              payment: { payment_method: 'cash' as const, reference_number: 'LOCAL-REPLAY' },
            },
          }
        : {}),
    };
    const key = randomUUID();
    const response = await service.transfer(actor, lease.id, command, key, {
      correlationId: 'room-transfer-disposable-replay',
    });
    assert.equal(response.status, 201);
    assert.equal(deposit.top_up_required_amount, 0, 'Fixture contract has no deposit obligation');
    assert.deepEqual(
      await financialState(),
      beforeFinance,
      'Move must not alter existing financial records',
    );
    const {
      rows: [after],
    } = await pool.query('SELECT * FROM leases WHERE id=$1', [lease.id]);
    for (const field of [
      'lease_code',
      'start_date',
      'end_date',
      'term_months',
      'contract_rent_amount',
      'snapshot_monthly_price',
      'security_deposit_required_amount',
      'pricing_source',
      'contract_paid_at',
    ])
      assert.deepEqual(after[field], lease[field], `Contract ${field} must remain unchanged`);
    assert.equal(after.room_id, room.id);
    assert.equal(after.lease_status, 'active');
    const financialRoom = await pool.query(
      `SELECT (${contractRoomIdSql('lease')}) AS room_id FROM leases lease WHERE lease.id=$1`,
      [lease.id],
    );
    assert.equal(
      financialRoom.rows[0].room_id,
      lease.room_id,
      'Full-contract Owner entitlement must keep its original room after a physical move',
    );
    const retry = await service.transfer(actor, lease.id, command, key, {
      correlationId: 'room-transfer-retry',
    });
    assert.deepEqual(retry.body, response.body);
    assert.equal(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM room_transfer_records WHERE from_lease_id=$1',
          [lease.id],
        )
      ).rows[0].n,
      1,
    );
    console.log(
      'PASS: same-day move, unchanged contract/payments and idempotent retry in disposable clone',
    );
    // A second move on the same lease proves the addendum migration, real
    // deposit payment trigger compatibility, and rollback after lifecycle writes.
    await pool.query('UPDATE leases SET security_deposit_required_amount=500000 WHERE id=$1', [
      lease.id,
    ]);
    await pool.query(
      `INSERT INTO lease_deposit_transactions(property_id,lease_id,transaction_type,
      direction,amount,reason_type,reason,created_by_user_id)
      VALUES($1,$2,'collection','credit',300000,'verified_payment','Disposable agreed deposit fixture',$3)`,
      [lease.property_id, lease.id, actor.id],
    );
    const {
      rows: [nextRoom],
    } = await pool.query(
      `SELECT r.id FROM rooms r JOIN residents p ON p.id=$2 JOIN room_buildings b ON b.id=r.building_id
       WHERE r.property_id=$1 AND r.room_status='vacant' AND r.kost_type_id IS NOT NULL
        AND (r.gender_policy='mixed' OR r.gender_policy=p.gender) AND (b.gender_policy='mixed' OR b.gender_policy=p.gender)
        AND NOT EXISTS(SELECT 1 FROM leases l WHERE l.room_id=r.id AND l.lease_status='active')
       ORDER BY r.number LIMIT 1`,
      [lease.property_id, residentId],
    );
    assert.ok(nextRoom);
    const beforeFailureFinance = await financialState();
    const beforeFailureLease = (await pool.query('SELECT * FROM leases WHERE id=$1', [lease.id]))
      .rows[0];
    const failedKey = randomUUID();
    const secondCommand = {
      ...command,
      target_room_id: nextRoom.id,
      top_up: {
        amount: 200_000,
        payment: { payment_method: 'bank_transfer' as const, reference_number: 'REPLAY-BANK' },
      },
    };
    await assert.rejects(
      service.transfer(actor, lease.id, secondCommand, failedKey, {}),
      (error: unknown) =>
        (error as { getResponse: () => { code: string } }).getResponse().code ===
        'TRANSFER_PROOF_REQUIRED',
    );
    assert.deepEqual(await financialState(), beforeFailureFinance);
    assert.deepEqual(
      (await pool.query('SELECT * FROM leases WHERE id=$1', [lease.id])).rows[0],
      beforeFailureLease,
    );
    assert.equal(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM idempotency_commands WHERE idempotency_key=$1',
          [failedKey],
        )
      ).rows[0].n,
      0,
    );
    await service.transfer(
      actor,
      lease.id,
      {
        ...secondCommand,
        top_up: {
          amount: 200_000,
          payment: { payment_method: 'cash', reference_number: 'REPLAY-CASH' },
        },
      },
      failedKey,
      {},
    );
    assert.equal(
      (
        await pool.query(
          `SELECT sum(CASE direction WHEN 'credit' THEN amount ELSE -amount END)::int AS balance
      FROM lease_deposit_transactions WHERE lease_id=$1`,
          [lease.id],
        )
      ).rows[0].balance,
      500_000,
    );
    assert.equal(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM room_transfer_records WHERE from_lease_id=$1',
          [lease.id],
        )
      ).rows[0].n,
      2,
    );
    const originalFinancialRoom = await pool.query(
      `SELECT (${contractRoomIdSql('lease')}) AS room_id FROM leases lease WHERE lease.id=$1`,
      [lease.id],
    );
    assert.equal(
      originalFinancialRoom.rows[0].room_id,
      lease.room_id,
      'A repeat move must still use the first financial room, not the intermediate room',
    );
    assert.equal(
      (
        await pool.query(
          `SELECT count(*)::int AS n FROM payments p JOIN payment_allocations a ON a.payment_id=p.id
      WHERE p.lease_id=$1 AND p.payment_purpose='security_deposit'`,
          [lease.id],
        )
      ).rows[0].n,
      0,
    );
    console.log(
      'PASS: repeat move, positive deposit, invoice-only allocations and atomic failure/retry',
    );
  } catch (error) {
    const e = error as {
      code?: string;
      constraint?: string;
      message?: string;
      getResponse?: () => unknown;
    };
    console.error(
      JSON.stringify({
        code: e.code,
        constraint: e.constraint,
        message: e.message,
        response: e.getResponse?.(),
      }),
    );
    process.exitCode = 1;
  } finally {
    await pool?.end();
    if (started) run('pg_ctl', ['-D', cluster, '-m', 'immediate', 'stop']);
    // directory is a verified mkdtemp child owned exclusively by this replay.
    assert.ok(directory.startsWith(join(tmpdir(), 'kostation-room-transfer-replay-')));
    rmSync(directory, { recursive: true, force: true });
  }
}
void main();
