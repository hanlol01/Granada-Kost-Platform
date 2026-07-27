import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  safeErrorMessage,
  sanitizeEvidenceText,
  sha256,
  writeSanitizedEvidence,
} from "../../../backend/api/src/infrastructure/database/scripts/admin-ux-m1/sanitized-evidence";

// M8 aggregate read-only recovery gate. Runs the full non-mutating regression
// surface across API/Admin/Penghuni sequentially with fail-fast semantics and
// writes sanitized JSON evidence (status, exit code, duration, and the SHA-256
// of sanitized output only — raw child output is never stored or printed) to a
// temporary path via the existing sanitized-evidence helper. This gate never
// touches databases, services, HTTP, providers, formatters in write mode, or
// Git state beyond `git diff --check`. Importing this module is side-effect
// free; the gate only runs on direct execution.

export const GATE_NAME = "m8-read-only-recovery";
export const SCHEMA_VERSION = 1;

export type GateCommand = {
  id: string;
  command: string;
  args: string[];
};

export type GateResult = {
  id: string;
  status: "passed" | "failed" | "skipped";
  exit_code: number | null;
  duration_ms: number;
  output_sha256?: string;
};

export type CommandRunner = (command: GateCommand) => Promise<GateResult>;

export function repositoryRoot(): string {
  return resolve(__dirname, "../../..");
}

export function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function recoveryEvidencePath(): string {
  return join(
    tmpdir(),
    "granada-kost-admin-ux-m8",
    "m8-read-only-recovery.json",
  );
}

function workspaceCommand(
  id: string,
  workspace: string,
  script: string,
): GateCommand {
  return {
    id,
    command: npmCommand(),
    args: ["--workspace", workspace, "run", script],
  };
}

export function commands(): GateCommand[] {
  return [
    workspaceCommand(
      "m8-gate-contract",
      "@granada-kost/admin-ux-qa",
      "test:read-only-gate",
    ),
    workspaceCommand(
      "backend-read-only-contracts",
      "@granada-kost/admin-ux-qa",
      "test:read-only-contracts",
    ),
    workspaceCommand("admin-tests", "@granada-kost/admin", "test"),
    workspaceCommand("api-lint", "@granada-kost/api", "lint"),
    workspaceCommand("api-build", "@granada-kost/api", "build"),
    workspaceCommand("admin-lint", "@granada-kost/admin", "lint"),
    workspaceCommand("admin-typecheck", "@granada-kost/admin", "typecheck"),
    workspaceCommand("admin-build", "@granada-kost/admin", "build"),
    workspaceCommand("penghuni-lint", "@granada-kost/penghuni", "lint"),
    workspaceCommand(
      "penghuni-typecheck",
      "@granada-kost/penghuni",
      "typecheck",
    ),
    workspaceCommand("penghuni-build", "@granada-kost/penghuni", "build"),
    { id: "git-diff-check", command: "git", args: ["diff", "--check"] },
  ];
}

export function hashSanitizedOutput(output: string): string {
  return sha256(sanitizeEvidenceText(output));
}

// Real child-process runner. stdin is ignored, stdout/stderr are captured and
// reduced to a sanitized hash. A spawn error settles the promise as a failed
// result instead of hanging (close never fires on ENOENT-style failures).
export function spawnRunner(command: GateCommand): Promise<GateResult> {
  const startedAt = Date.now();
  return new Promise((resolveResult) => {
    let settled = false;
    let output = "";
    const settle = (result: GateResult): void => {
      if (!settled) {
        settled = true;
        resolveResult(result);
      }
    };
    const child = spawn(command.command, command.args, {
      cwd: repositoryRoot(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", (error: Error) => {
      settle({
        id: command.id,
        status: "failed",
        exit_code: null,
        duration_ms: Date.now() - startedAt,
        output_sha256: hashSanitizedOutput(output + safeErrorMessage(error)),
      });
    });
    child.on("close", (exitCode) => {
      settle({
        id: command.id,
        status: exitCode === 0 ? "passed" : "failed",
        exit_code: exitCode,
        duration_ms: Date.now() - startedAt,
        output_sha256: hashSanitizedOutput(output),
      });
    });
  });
}

// Sequential fail-fast execution: after the first failure every remaining
// command is recorded as skipped without being spawned.
export async function executeGate(
  gateCommands: GateCommand[],
  runner: CommandRunner,
): Promise<{ passed: boolean; results: GateResult[] }> {
  const results: GateResult[] = [];
  let failed = false;
  for (const command of gateCommands) {
    if (failed) {
      results.push({
        id: command.id,
        status: "skipped",
        exit_code: null,
        duration_ms: 0,
      });
      continue;
    }
    const result = await runner(command);
    results.push(result);
    failed = result.status !== "passed";
  }
  return { passed: !failed, results };
}

let executions = 0;

export function gateExecutionCount(): number {
  return executions;
}

export async function main(): Promise<void> {
  executions += 1;
  const { passed, results } = await executeGate(commands(), spawnRunner);
  for (const result of results) {
    console.log(
      `${result.status.toUpperCase()}: ${result.id} (${result.duration_ms}ms)`,
    );
  }
  const reportPath = await writeSanitizedEvidence(recoveryEvidencePath(), {
    schema_version: SCHEMA_VERSION,
    gate: GATE_NAME,
    generated_at: new Date().toISOString(),
    passed,
    command_results: results,
  });
  console.log(`Sanitized M8 read-only recovery evidence: ${reportPath}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(
      `M8 read-only recovery gate failed: ${safeErrorMessage(error)}`,
    );
    process.exitCode = 1;
  });
}
