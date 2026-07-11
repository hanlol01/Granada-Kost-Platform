import { Pool } from 'pg';
import {
  assertDisposableDatabaseConnection,
  disposableDatabasePoolConfig,
  disposableDatabaseTargetFromEnv,
  sanitizedDisposableTarget,
} from './disposable-database';
import { safeErrorMessage } from './sanitized-evidence';

async function main(): Promise<void> {
  const target = disposableDatabaseTargetFromEnv();
  const pool = new Pool(disposableDatabasePoolConfig(target));

  try {
    await assertDisposableDatabaseConnection(pool, target);
    console.log(
      JSON.stringify({
        gate: 'admin-ux-m1-disposable-database',
        passed: true,
        target: sanitizedDisposableTarget(target),
      }),
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(`Admin UX M1 disposable database guard failed: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
