import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relativePath: string): string =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const backendSource = (relativePath: string): string =>
  readFileSync(new URL(`../../../../backend/api/src/${relativePath}`, import.meta.url), "utf8");

test("W09A Admin vehicle workspace exposes property-safe resident and room deep links", () => {
  const page = source("routes/vehicles.tsx");
  assert.match(page, /to="\/tenants\/\$residentId"/);
  assert.match(page, /to="\/rooms\/\$roomNumber"/);
  assert.match(page, /Lihat penghuni/);
  assert.match(page, /Lihat kamar/);
  assert.match(page, /currentRoomNumber/);
  assert.match(page, /Reset filter/);
  assert.match(page, /Lihat riwayat/);
  assert.match(page, /Daftar Kendaraan/);
});

test("W09A vehicle registration supports searchable residents and creatable vehicle types", () => {
  const dialog = source("components/forms/CreateVehicleDialog.tsx");
  const repository = backendSource("modules/vehicle/repositories/vehicle.repository.ts");
  const createDto = backendSource("modules/vehicle/dto/create-vehicle.dto.ts");
  const migration = backendSource("infrastructure/database/migrations/075_vehicle_custom_type.sql");
  assert.match(dialog, /Cari nama, kamar, atau bangunan/);
  assert.match(dialog, /Tambahkan jenis kendaraan/);
  assert.match(dialog, /customVehicleType/);
  assert.doesNotMatch(dialog, /Nomor polisi \*/);
  assert.doesNotMatch(dialog, /Merek \*/);
  assert.doesNotMatch(dialog, /Warna \*/);
  assert.match(repository, /lease_status IN \('awaiting_activation', 'active'\)/);
  assert.match(createDto, /custom_vehicle_type/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS custom_vehicle_type/);
});

test("W09A resident and room details consume linked operational records", () => {
  const residentDetail = source("components/residents/ResidentDetailWorkspace.tsx");
  const residentOperations = source("components/residents/ResidentOperationalCards.tsx");
  const roomDetailService = backendSource(
    "modules/admin-ux-master/admin-ux-room-detail.service.ts",
  );

  assert.match(residentDetail, /ResidentOperationalCards residentId=\{resident\.id\}/);
  assert.match(residentOperations, /useVehicles\(\{[\s\S]*residentId/);
  assert.match(residentOperations, /useComplaints\(\{[\s\S]*residentId/);
  assert.match(residentOperations, /useResidentReminderHistory/);
  assert.doesNotMatch(residentDetail, /Belum ada data yang dihubungkan/);
  assert.match(roomDetailService, /\[propertyId, billingResidentId\]/);
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
