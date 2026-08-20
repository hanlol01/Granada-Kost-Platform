import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relativePath: string): string =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("W09A Admin vehicle workspace exposes property-safe resident and room deep links", () => {
  const page = source("routes/vehicles.tsx");
  assert.match(page, /to="\/tenants\/\$residentId"/);
  assert.match(page, /to="\/rooms\/\$roomNumber"/);
  assert.match(page, /Lihat riwayat/);
  assert.match(page, /Daftar Kendaraan/);
});

test("W09A Admin parking workspace exposes zone and slot setup actions", () => {
  const page = source("routes/parking.tsx");
  assert.match(page, /Tambah zona/);
  assert.match(page, /Tambah slot/);
  assert.match(page, /Lihat riwayat/);
  assert.doesNotMatch(page, /Pembuatan zona parkir belum tersedia/);
});

test("W09A mutation hooks always send idempotency keys", () => {
  const parking = source("hooks/useParkingMutations.ts");
  const vehicles = source("hooks/useVehicleMutations.ts");
  assert.equal((parking.match(/idempotencyKey: newIdempotencyKey\(\)/g) ?? []).length >= 4, true);
  assert.match(vehicles, /idempotencyKey: newIdempotencyKey\(\)/);
});
