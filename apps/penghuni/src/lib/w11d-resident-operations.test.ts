import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

test("W11D vehicle UI uses resident-scoped backend authority", () => {
  const hook = read("hooks/usePenghuniVehicles.ts");
  const route = read("routes/_app/vehicles.tsx");
  assert.match(hook, /\/my\/vehicles/);
  assert.match(hook, /idempotencyKey/);
  assert.match(route, /Persetujuan dan slot parkir tetap\s+ditentukan pengelola/);
  assert.doesNotMatch(route, /propertyId|residentId/);
});

test("W11D does not expose technician work-order mutation to residents", () => {
  const controller = read(
    resolve(
      root,
      "../../../backend/api/src/modules/maintenance/controllers/my-work-order.controller.ts",
    ),
  );
  assert.match(controller, /RequireRoles\('technician'\)/);
  assert.match(controller, /maintenance\.manage/);
});

test("W11D property information uses resident context without technical placeholder copy", () => {
  const info = read("routes/_app/info.tsx");
  const hook = read("hooks/usePenghuniInfo.ts");
  assert.match(info, /usePenghuniProfile/);
  assert.match(info, /Properti & hunian Anda/);
  assert.doesNotMatch(`${info}\n${hook}`, /Phase 1|milestone berikutnya|Endpoint pengumuman/);
});
