import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  GATE_NAME,
  SCHEMA_VERSION,
  commands,
  executeGate,
  gateExecutionCount,
  hashSanitizedOutput,
  npmCommand,
  recoveryEvidencePath,
  type GateCommand,
  type GateResult,
} from "./verify-read-only-recovery";
import {
  sanitizeEvidenceText,
  sha256,
} from "../../../backend/api/src/infrastructure/database/scripts/admin-ux-m1/sanitized-evidence";

// M8 read-only recovery gate contract. Locks the exact 12-command inventory,
// its ordering and workspace targets, the read-only safety envelope (no
// mutating tokens, no legacy M1 gate), fail-fast semantics, and sanitized
// evidence hashing — without spawning any child process (injectable runner).

const QA_PACKAGE = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
) as { scripts: Record<string, string> };
const ROOT_PACKAGE = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "..", "package.json"), "utf8"),
) as { scripts: Record<string, string> };

const WORKSPACE_PACKAGES: Record<string, string> = {
  "@granada-kost/admin-ux-qa": join(__dirname, "..", "package.json"),
  "@granada-kost/admin": join(
    __dirname,
    "..",
    "..",
    "..",
    "apps",
    "admin",
    "package.json",
  ),
  "@granada-kost/penghuni": join(
    __dirname,
    "..",
    "..",
    "..",
    "apps",
    "penghuni",
    "package.json",
  ),
  "@granada-kost/api": join(
    __dirname,
    "..",
    "..",
    "..",
    "backend",
    "api",
    "package.json",
  ),
};

const EXPECTED_IDS = [
  "m8-gate-contract",
  "backend-read-only-contracts",
  "admin-tests",
  "api-lint",
  "api-build",
  "admin-lint",
  "admin-typecheck",
  "admin-build",
  "penghuni-lint",
  "penghuni-typecheck",
  "penghuni-build",
  "git-diff-check",
] as const;

const npmWorkspaceRun = (workspace: string, script: string): string[] => [
  "--workspace",
  workspace,
  "run",
  script,
];

const EXPECTED_COMMANDS: GateCommand[] = [
  {
    id: "m8-gate-contract",
    command: npmCommand(),
    args: npmWorkspaceRun("@granada-kost/admin-ux-qa", "test:read-only-gate"),
  },
  {
    id: "backend-read-only-contracts",
    command: npmCommand(),
    args: npmWorkspaceRun(
      "@granada-kost/admin-ux-qa",
      "test:read-only-contracts",
    ),
  },
  {
    id: "admin-tests",
    command: npmCommand(),
    args: npmWorkspaceRun("@granada-kost/admin", "test"),
  },
  {
    id: "api-lint",
    command: npmCommand(),
    args: npmWorkspaceRun("@granada-kost/api", "lint"),
  },
  {
    id: "api-build",
    command: npmCommand(),
    args: npmWorkspaceRun("@granada-kost/api", "build"),
  },
  {
    id: "admin-lint",
    command: npmCommand(),
    args: npmWorkspaceRun("@granada-kost/admin", "lint"),
  },
  {
    id: "admin-typecheck",
    command: npmCommand(),
    args: npmWorkspaceRun("@granada-kost/admin", "typecheck"),
  },
  {
    id: "admin-build",
    command: npmCommand(),
    args: npmWorkspaceRun("@granada-kost/admin", "build"),
  },
  {
    id: "penghuni-lint",
    command: npmCommand(),
    args: npmWorkspaceRun("@granada-kost/penghuni", "lint"),
  },
  {
    id: "penghuni-typecheck",
    command: npmCommand(),
    args: npmWorkspaceRun("@granada-kost/penghuni", "typecheck"),
  },
  {
    id: "penghuni-build",
    command: npmCommand(),
    args: npmWorkspaceRun("@granada-kost/penghuni", "build"),
  },
  { id: "git-diff-check", command: "git", args: ["diff", "--check"] },
];

// npm scripts a gate command may target, by workspace script name.
const ALLOWED_NPM_SCRIPTS = new Set([
  "test:read-only-gate",
  "test:read-only-contracts",
  "test",
  "lint",
  "typecheck",
  "build",
]);

// Mutating/runtime tokens that must never appear on the gate surface.
const FORBIDDEN_TOKENS: readonly RegExp[] = [
  /\bdb:/iu,
  /migrate/iu,
  /\bseed\b/iu,
  /fixture/iu,
  /--apply/iu,
  /--write/iu,
  /\bdev\b/iu,
  /\bstart\b/iu,
  /preview/iu,
  /\bcurl\b/iu,
  /\bhttps?\b/iu,
  /login/iu,
  /provider/iu,
  /midtrans/iu,
  /webhook/iu,
  /settlement/iu,
  /git\s+add/iu,
  /\bcommit\b/iu,
  /\bpush\b/iu,
];

// The referenced script value for each npm gate command. The backend contract
// inventory value is excluded here because its spec paths legitimately contain
// suite names (e.g. seed contract specs); it is locked by its own positive
// shape test below instead of the token denylist.
const referencedScriptValues = (options: {
  includeContractInventory: boolean;
}): string[] =>
  commands()
    .filter((command) => command.command !== "git")
    .filter(
      (command) =>
        options.includeContractInventory ||
        command.args[3] !== "test:read-only-contracts",
    )
    .map((command) => {
      const workspace = command.args[1];
      const script = command.args[3];
      const packageJson = JSON.parse(
        readFileSync(WORKSPACE_PACKAGES[workspace], "utf8"),
      ) as { scripts: Record<string, string> };
      const value = packageJson.scripts[script];
      assert.ok(
        typeof value === "string" && value.length > 0,
        `workspace ${workspace} is missing script "${script}"`,
      );
      return value;
    });

test("M8: gate identity and exact 12-command inventory in order", () => {
  assert.equal(GATE_NAME, "m8-read-only-recovery");
  assert.equal(SCHEMA_VERSION, 1);
  assert.deepEqual(
    commands().map((command) => command.id),
    [...EXPECTED_IDS],
  );
});

test("M8: exact workspace and script target for every command", () => {
  assert.deepEqual(commands(), EXPECTED_COMMANDS);
});

test("M8: only read-only npm scripts plus git diff --check are allowed", () => {
  for (const command of commands()) {
    if (command.command === "git") {
      assert.deepEqual(command.args, ["diff", "--check"]);
      continue;
    }
    assert.equal(command.command, npmCommand());
    assert.equal(command.args[0], "--workspace");
    assert.match(command.args[1] ?? "", /^@granada-kost\//u);
    assert.equal(command.args[2], "run");
    assert.ok(
      ALLOWED_NPM_SCRIPTS.has(command.args[3] ?? ""),
      `script "${command.args[3]}" is not in the read-only allowlist`,
    );
    assert.equal(command.args.length, 4);
  }
});

test("M8: no mutating tokens on the gate surface or referenced scripts", () => {
  const surface = [
    JSON.stringify(commands()),
    ROOT_PACKAGE.scripts["qa:read-only"] ?? "",
    ...referencedScriptValues({ includeContractInventory: false }),
  ].join("\n");
  for (const pattern of FORBIDDEN_TOKENS) {
    assert.equal(
      pattern.test(surface),
      false,
      `forbidden token ${String(pattern)} found on the gate surface`,
    );
  }
});

test("M8: backend contract inventory covers exactly the read-only suites", () => {
  const value = QA_PACKAGE.scripts["test:read-only-contracts"];
  assert.ok(value, "test:read-only-contracts script is missing");
  const tokens = value.split(/\s+/u);
  assert.deepEqual(tokens.slice(0, 4), [
    "tsx",
    "--tsconfig",
    "../../backend/api/tsconfig.json",
    "--test",
  ]);
  const suites = tokens.slice(4).map((token) => {
    const match = token.match(
      /^\.\.\/\.\.\/backend\/api\/test\/([a-z0-9-]+)\/\*\.spec\.ts$/u,
    );
    assert.ok(match, `unexpected contract test target: ${token}`);
    return match[1];
  });
  assert.deepEqual([...suites].sort(), [
    "admin-ux-m1",
    "admin-ux-m2",
    "admin-ux-m5",
    "admin-ux-m6",
    "admin-ux-m7",
    "database",
  ]);
  assert.equal(new Set(suites).size, suites.length, "duplicate suite targets");
});

test("M8: root command wiring is exact and the legacy M1 gate is never invoked", () => {
  assert.equal(
    ROOT_PACKAGE.scripts["qa:read-only"],
    "npm --workspace @granada-kost/admin-ux-qa run verify:read-only",
  );
  assert.equal(
    QA_PACKAGE.scripts["verify:read-only"],
    "tsx scripts/verify-read-only-recovery.ts",
  );
  const surface = [
    JSON.stringify(commands()),
    ROOT_PACKAGE.scripts["qa:read-only"] ?? "",
    QA_PACKAGE.scripts["verify:read-only"] ?? "",
    ...referencedScriptValues({ includeContractInventory: true }),
  ].join("\n");
  assert.equal(/verify:admin-ux/u.test(surface), false);
  assert.equal(/verify-admin-ux-release/u.test(surface), false);
});

test("M8: fail-fast marks every remaining command as skipped", async () => {
  const executed: string[] = [];
  const failingRunner = (command: GateCommand): Promise<GateResult> => {
    executed.push(command.id);
    const failed = command.id === "admin-tests";
    return Promise.resolve({
      id: command.id,
      status: failed ? "failed" : "passed",
      exit_code: failed ? 1 : 0,
      duration_ms: 1,
      output_sha256: hashSanitizedOutput(""),
    });
  };
  const { passed, results } = await executeGate(commands(), failingRunner);
  assert.equal(passed, false);
  assert.deepEqual(executed, [
    "m8-gate-contract",
    "backend-read-only-contracts",
    "admin-tests",
  ]);
  assert.deepEqual(
    results.map((result) => result.status),
    [
      "passed",
      "passed",
      "failed",
      ...Array.from({ length: 9 }, () => "skipped"),
    ],
  );
  for (const result of results.slice(3)) {
    assert.equal(result.exit_code, null);
    assert.equal(result.duration_ms, 0);
  }

  const passingRunner = (command: GateCommand): Promise<GateResult> =>
    Promise.resolve({
      id: command.id,
      status: "passed",
      exit_code: 0,
      duration_ms: 1,
      output_sha256: hashSanitizedOutput(""),
    });
  const allPass = await executeGate(commands(), passingRunner);
  assert.equal(allPass.passed, true);
  assert.equal(
    allPass.results.filter((result) => result.status === "passed").length,
    12,
  );
});

test("M8: evidence hashing uses sanitized output, never raw output", () => {
  const raw =
    "Bearer super-secret-token password=hunter2 postgresql://user:pass@host/db";
  const sanitized = sanitizeEvidenceText(raw);
  assert.notEqual(sanitized, raw, "sanitizer sample must actually redact");
  assert.equal(hashSanitizedOutput(raw), sha256(sanitized));
  assert.notEqual(hashSanitizedOutput(raw), sha256(raw));
});

test("M8: evidence path is always under the operating-system temporary directory", () => {
  assert.equal(
    recoveryEvidencePath(),
    resolve(tmpdir(), "granada-kost-admin-ux-m8", "m8-read-only-recovery.json"),
  );
});

test("M8: importing the module never executes the gate", () => {
  assert.equal(gateExecutionCount(), 0);
});
