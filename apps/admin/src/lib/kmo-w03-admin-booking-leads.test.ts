import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  parseAdminBookingLeadPage,
  requestAdminBookingLeadPage,
  type BookingLeadRecord,
} from "./admin-booking-lead";

const PROPERTY_ID = "11111111-1111-4111-8111-111111111111";
const LEAD_ID = "22222222-2222-4222-8222-222222222222";

const lead: BookingLeadRecord = {
  id: LEAD_ID,
  propertyId: PROPERTY_ID,
  roomId: null,
  roomNumber: null,
  category: "rukost",
  gender: "female",
  buildingCode: null,
  floorCode: null,
  publicGroupKey: "rukost-female",
  visitorName: "Calon Penyewa",
  visitorPhone: "6281111111111",
  visitorAddress: null,
  visitorUniversity: "Universitas Demo",
  visitorMessage: null,
  preferredMoveInDate: "2026-08-10",
  status: "new",
  source: "public_kamar",
  createdAt: "2026-07-31T01:00:00.000Z",
  updatedAt: "2026-07-31T01:00:00.000Z",
};

const source = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");

test("V2 booking lead page parser preserves exact authoritative metadata", () => {
  const page = parseAdminBookingLeadPage({
    data: [lead],
    meta: { limit: 20, offset: 0, total: 41 },
  });
  assert.deepEqual(page, { data: [lead], meta: { limit: 20, offset: 0, total: 41 } });
  assert.throws(() => parseAdminBookingLeadPage([lead]));
  assert.throws(() =>
    parseAdminBookingLeadPage({
      data: [lead],
      meta: { limit: 20, offset: 0, total: 41, extra: true },
    }),
  );
});

test("V2 list requester binds property, filters, and server pagination", async () => {
  let captured: unknown;
  const page = await requestAdminBookingLeadPage(
    async (path, options) => {
      captured = { path, options };
      return { data: [lead], meta: { limit: 20, offset: 20, total: 41 } };
    },
    PROPERTY_ID,
    { category: "rukost", search: "calon", limit: 20, offset: 20 },
  );
  assert.equal(page.meta.total, 41);
  assert.deepEqual(captured, {
    path: "/booking-leads",
    options: {
      query: {
        property_id: PROPERTY_ID,
        status: undefined,
        category: "rukost",
        gender: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        search: "calon",
        limit: 20,
        offset: 20,
      },
    },
  });
});

test("workspace uses canonical queue vocabulary and removes obsolete survey conversion actions", () => {
  const page = source("routes/booking-leads.tsx");
  for (const heading of [
    "No",
    "Calon Penyewa",
    "Kategori Kost",
    "Jenis Kelamin",
    "Universitas/Pendidikan",
    "Sumber",
    "Kamar/Target",
    "Rencana Masuk",
    "Status",
    "Aksi",
  ]) {
    assert.match(page, new RegExp(`>${heading}<`));
  }
  assert.doesNotMatch(page, />Pengunjung<|Tanggal Pindah|Jadwal Survey|Dikonversi/);
  assert.match(page, /Belum dipilih/);
  assert.match(page, /min-h-11/);
});

test("status mutation keeps property scope and one stable key per logical action", () => {
  const page = source("routes/booking-leads.tsx");
  const mutations = source("hooks/useBookingLeadMutations.ts");
  const contract = source("lib/admin-booking-lead.ts");
  assert.match(page, /idempotencyKey:\s*newIdempotencyKey\(\)/);
  assert.match(mutations, /input\.propertyId !== currentPropertyId/);
  assert.match(contract, /property_id:\s*input\.propertyId/);
  assert.match(mutations, /idempotencyKey:\s*input\.idempotencyKey/);
  assert.doesNotMatch(mutations, /newIdempotencyKey\(\)/);
});
