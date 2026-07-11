import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  defaultEvidencePath,
  sanitizeEvidenceText,
  sha256,
  writeSanitizedEvidence,
} from '../../../backend/api/src/infrastructure/database/scripts/admin-ux-m1/sanitized-evidence';

type GateCommand = {
  id: string;
  command: string;
  args: string[];
};

type GateResult = {
  id: string;
  status: 'passed' | 'failed' | 'skipped';
  exit_code: number | null;
  duration_ms: number;
  output_sha256?: string;
};

function repositoryRoot(): string {
  return resolve(__dirname, '../../..');
}

function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function qaWorkspaceCommand(id: string, script: string): GateCommand {
  return {
    id,
    command: npmCommand(),
    args: ['--workspace', '@granada-kost/admin-ux-qa', 'run', script],
  };
}

function commands(): GateCommand[] {
  const npm = npmCommand();
  return [
    qaWorkspaceCommand('qa-test-runner', 'test'),
    qaWorkspaceCommand('synthetic-two-property-fixture', 'fixture:validate'),
    { id: 'api-lint', command: npm, args: ['--workspace', '@granada-kost/api', 'run', 'lint'] },
    { id: 'api-build', command: npm, args: ['--workspace', '@granada-kost/api', 'run', 'build'] },
    { id: 'admin-lint', command: npm, args: ['--workspace', '@granada-kost/admin', 'run', 'lint'] },
    {
      id: 'admin-typecheck',
      command: npm,
      args: ['--workspace', '@granada-kost/admin', 'run', 'typecheck'],
    },
    { id: 'admin-build', command: npm, args: ['--workspace', '@granada-kost/admin', 'run', 'build'] },
    qaWorkspaceCommand('disposable-database-guard', 'db:qa:guard'),
    qaWorkspaceCommand('migration-reentrant', 'db:migrate:verify'),
    qaWorkspaceCommand('legacy-contract', 'test:contract:legacy'),
    qaWorkspaceCommand('public-contract', 'test:contract:public'),
  ];
}

async function runCommand(command: GateCommand): Promise<GateResult> {
  const startedAt = Date.now();
  return new Promise((resolveResult) => {
    const child = spawn(command.command, command.args, {
      cwd: repositoryRoot(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('error', (error: Error) => {
      output += error.message;
    });
    child.on('close', (exitCode) => {
      const durationMs = Date.now() - startedAt;
      resolveResult({
        id: command.id,
        status: exitCode === 0 ? 'passed' : 'failed',
        exit_code: exitCode,
        duration_ms: durationMs,
        output_sha256: sha256(sanitizeEvidenceText(output)),
      });
    });
  });
}

async function main(): Promise<void> {
  const results: GateResult[] = [];
  let failed = false;

  for (const command of commands()) {
    if (failed) {
      results.push({ id: command.id, status: 'skipped', exit_code: null, duration_ms: 0 });
      continue;
    }
    const result = await runCommand(command);
    results.push(result);
    console.log(`${result.status.toUpperCase()}: ${result.id} (${result.duration_ms}ms)`);
    failed = result.status === 'failed';
  }

  const reportPath = await writeSanitizedEvidence(defaultEvidencePath('release-gate.json'), {
    gate: 'admin-ux-m1-release',
    passed: !failed,
    command_results: results,
  });
  console.log(`Sanitized Admin UX M1 evidence: ${reportPath}`);
  if (failed) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? sanitizeEvidenceText(error.message) : 'Unexpected failure';
  console.error(`Admin UX M1 release gate failed: ${message}`);
  process.exitCode = 1;
});
