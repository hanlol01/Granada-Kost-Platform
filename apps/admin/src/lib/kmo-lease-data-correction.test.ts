import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL(
  "../components/leases/LeaseDataCorrectionDialog.tsx",
  import.meta.url,
);
const detailPath = new URL("../components/residents/ResidentDetailWorkspace.tsx", import.meta.url);
const apiPath = new URL("./admin-ux-lease-api.ts", import.meta.url);

test("lease correction uses the shared date and Rupiah controls with semantic button colors", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /HeroUiDatePicker/);
  assert.match(source, /CurrencyInput/);
  assert.match(source, /variant="info"/);
  assert.match(source, /variant="warning"/);
  assert.match(source, /variant="success"/);
  assert.match(source, /variant="destructive"/);
  assert.match(source, /text-destructive/);
  assert.match(source, /pricingVarianceAcknowledged/);
  assert.match(source, /Saya sudah memeriksa selisih tarif/);
});

test("resident detail exposes correction history and identifies historical check-in dates", async () => {
  const source = await readFile(detailPath, "utf8");
  assert.match(source, /Koreksi data penyewaan/);
  assert.match(source, /Tanggal check-in historis/);
  assert.match(source, /Tanggal check-in hasil koreksi/);
  assert.match(source, /LeaseDataCorrectionDialog/);
});

test("Admin client binds preview, list, and idempotent commit endpoints", async () => {
  const source = await readFile(apiPath, "utf8");
  assert.match(source, /\/data-correction\/preview/);
  assert.match(source, /\/data-corrections/);
  assert.match(source, /\/data-correction"/);
  assert.match(source, /commitDataCorrection[\s\S]*?idempotencyKey/);
});
