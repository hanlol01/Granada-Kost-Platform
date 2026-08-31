import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canReadActivityLog, getActivityLog, parseActivityLogPage } from "./admin-activity-log";

const propertyId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";
const residentId = "44444444-4444-4444-8444-444444444444";

function response() {
  return {
    data: [
      {
        id: eventId,
        event_type: "billing.payment_verified",
        action_label: "Pembayaran diverifikasi",
        category: "payment",
        result: "succeeded",
        occurred_at: "2026-08-29T03:00:00.000Z",
        actor: { id: actorId, type: "admin", display_name: "Diki Karya Permana" },
        target: {
          property_id: propertyId,
          resource_type: "payment",
          resource_id: eventId,
          resident: { id: residentId, display_name: "FARHAN" },
          room: null,
          lease: null,
          payment: null,
          invoice: null,
        },
        change_summary: [
          { field: "payment_status", before: "pending_confirmation", after: "verified" },
        ],
        reason: "Transfer diterima",
        evidence_references: [{ kind: "receipt_id", reference: eventId }],
        correlation_id: "correlation-safe",
      },
    ],
    meta: {
      limit: 25,
      offset: 0,
      total: 1,
      timezone: "Asia/Jakarta",
      default_range_days: 30,
    },
  };
}

test("M9 activity parser accepts only the redacted exact contract", () => {
  const parsed = parseActivityLogPage(response());
  assert.equal(parsed.data[0]?.actor.display_name, "Diki Karya Permana");
  assert.equal(parsed.data[0]?.target.resident?.id, residentId);
  const unsafe = response() as ReturnType<typeof response> & { raw_payload?: unknown };
  unsafe.raw_payload = { bank_account: "unsafe" };
  assert.throws(() => parseActivityLogPage(unsafe), /tidak valid/i);
  const unsafeItem = response();
  Object.assign(unsafeItem.data[0], { payment_proof: "unsafe" });
  assert.throws(() => parseActivityLogPage(unsafeItem), /tidak valid/i);
  const authorisedSource = response();
  authorisedSource.data[0].actor = {
    id: actorId,
    type: "source",
    display_name: "Sumber terotorisasi",
  };
  assert.equal(parseActivityLogPage(authorisedSource).data[0]?.actor.type, "source");
});

test("M9 Log Aktivitas access is Admin-only with explicit capability", () => {
  assert.equal(canReadActivityLog({ roles: ["admin"], permissions: ["activity_log.read"] }), true);
  assert.equal(
    canReadActivityLog({ roles: ["manager"], permissions: ["activity_log.read"] }),
    false,
  );
  assert.equal(
    canReadActivityLog({ roles: ["property_owner"], permissions: ["activity_log.read"] }),
    false,
  );
  assert.equal(canReadActivityLog({ roles: ["admin"], permissions: [] }), false);
});

test("M9 requester sends all filters to the server with property scope", async () => {
  const calls: Array<{ path: string; options?: unknown }> = [];
  const requester = {
    async get(path: string, options?: unknown) {
      calls.push({ path, options });
      return response();
    },
  };
  await getActivityLog(
    {
      propertyId,
      from: "2026-08-01",
      to: "2026-08-29",
      actorType: "system",
      category: "payment",
      result: "succeeded",
      target: "FARHAN",
      reference: "PAY-001",
      limit: 25,
      offset: 50,
    },
    undefined,
    requester as never,
  );
  assert.equal(calls[0]?.path, "/admin/activity-logs");
  assert.deepEqual((calls[0]?.options as { query: unknown }).query, {
    property_id: propertyId,
    from: "2026-08-01",
    to: "2026-08-29",
    actor_id: undefined,
    actor_type: "system",
    category: "payment",
    action: undefined,
    result: "succeeded",
    target: "FARHAN",
    reference: "PAY-001",
    limit: 25,
    offset: 50,
  });
});

test("M9 page is read-only, filterable, and registered in the Admin navigation authority", () => {
  const page = readFileSync(new URL("../routes/activity-logs.tsx", import.meta.url), "utf8");
  const registry = readFileSync(new URL("./admin-route-registry.ts", import.meta.url), "utf8");
  assert.match(page, /Audit read-only dan property-scoped/);
  assert.match(page, /Filter aktor/);
  assert.match(page, /Filter modul aktivitas/);
  assert.match(page, /Ringkasan perubahan/);
  assert.match(page, /formatRupiah/);
  assert.match(page, /resourceTypeLabel/);
  assert.match(page, /<Button size="sm" onClick=\{\(\) => onDetail\(item\.id\)\}>/);
  assert.doesNotMatch(page, /break-all text-xs text-muted-foreground">\{item\.event_type\}/);
  assert.doesNotMatch(page, /useMutation|raw_payload|bank_account|storage_path/);
  assert.doesNotMatch(page, /item\.target\.payment_proof/);
  assert.match(registry, /id: "activity-logs"/);
  assert.match(registry, /readCapabilities: \["activity_log\.read"\]/);
  assert.match(registry, /roles: \["admin"\]/);
});
