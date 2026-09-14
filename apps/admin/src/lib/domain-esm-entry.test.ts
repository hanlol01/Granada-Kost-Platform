import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ADMIN_SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOMAIN_INDEX = resolve(ADMIN_SRC, "../../../packages/domain/src/index.ts");

test("domain entry pins lifecycle exports to the TypeScript ESM source", () => {
  const source = readFileSync(DOMAIN_INDEX, "utf8");

  // A generated kmo-lifecycle.js can be present beside the source during
  // development. Keep the extension explicit so Vite SSR never evaluates
  // that CommonJS artifact as an ES module.
  assert.match(source, /export \* from ["']\.\/kmo-lifecycle\.ts["']/);
});
