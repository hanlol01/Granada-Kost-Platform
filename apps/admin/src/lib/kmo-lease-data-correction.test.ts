import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL(
  "../components/leases/LeaseDataCorrectionDialog.tsx",
  import.meta.url,
);
const detailPath = new URL("../components/residents/ResidentDetailWorkspace.tsx", import.meta.url);
const apiPath = new URL("./admin-ux-lease-api.ts", import.meta.url);
const contractPath = new URL("./lease-revision-contract.ts", import.meta.url);
const correctionRoutePath = new URL("../routes/tenants/correction/$leaseId.tsx", import.meta.url);
const tenantsRoutePath = new URL("../routes/tenants.tsx", import.meta.url);
const registryPath = new URL("./admin-route-registry.ts", import.meta.url);

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
  assert.match(source, /to="\/tenants\/correction\/\$leaseId"/);
  assert.match(source, /params=\{\{ leaseId: currentTenancy\.leaseId \}\}/);
  assert.doesNotMatch(source, /<LeaseDataCorrectionDialog/);
});

test("Admin client binds preview, list, and idempotent commit endpoints", async () => {
  const source = await readFile(apiPath, "utf8");
  const contract = await readFile(contractPath, "utf8");
  assert.match(source, /createLeaseRevisionClient/);
  assert.match(contract, /\/data-correction\/preview/);
  assert.match(source, /\/data-corrections/);
  assert.match(contract, /\/data-correction`/);
  assert.match(contract, /commitDataCorrection[\s\S]*?idempotencyKey/);
});

test("dedicated correction route renders through the tenant parent and has Admin-only metadata", async () => {
  const route = await readFile(correctionRoutePath, "utf8");
  const parent = await readFile(tenantsRoutePath, "utf8");
  const registry = await readFile(registryPath, "utf8");
  assert.match(route, /createFileRoute\("\/tenants\/correction\/\$leaseId"\)/);
  assert.match(route, /<LeaseDataCorrectionPage leaseId=\{leaseId\}/);
  assert.match(parent, /match\.routeId === "\/tenants\/correction\/\$leaseId"/);
  assert.match(
    registry,
    /id: "lease-correction"[\s\S]*?roles: \["admin"\][\s\S]*?readCapabilities: \["lease\.manage"\]/,
  );
});
