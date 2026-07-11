import {
  loadAdminUxM1Fixture,
  validateAdminUxM1Fixture,
} from './admin-ux-m1-fixtures';
import { safeErrorMessage } from './sanitized-evidence';

async function main(): Promise<void> {
  const fixture = await loadAdminUxM1Fixture();
  console.log(
    JSON.stringify({
      gate: 'admin-ux-m1-two-property-fixture',
      passed: true,
      summary: validateAdminUxM1Fixture(fixture),
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(`Admin UX M1 fixture validation failed: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
