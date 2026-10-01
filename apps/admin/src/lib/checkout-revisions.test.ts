import assert from "node:assert/strict";
import test from "node:test";
import { checkoutActionLabel, type CheckoutActionContext } from "./admin-ux-lease-helpers";
import { checkoutEvidenceGroups, CHECKOUT_EVIDENCE_LABELS } from "./checkout-history";
import { parseResidentAttention, RESIDENT_ATTENTION } from "./admin-resident-attention";
import type { CheckoutRecordedEvidence } from "./admin-ux-lease-types";

const closed: CheckoutActionContext = {
  state: "completed",
  decisionStatus: "closed",
  refundStatus: null,
  amountDue: 0,
  currentAmountDue: 0,
};

test("settled or waived refunds open the full history without rewriting the original decision", () => {
  for (const refundStatus of ["settled", "waived"] as const) {
    assert.equal(
      checkoutActionLabel("ended", { ...closed, decisionStatus: "refund_pending", refundStatus }),
      "Lihat riwayat check-out",
    );
  }
  for (const refundStatus of ["pending", "reversed"] as const) {
    assert.equal(
      checkoutActionLabel("ended", { ...closed, decisionStatus: "refund_pending", refundStatus }),
      "Lihat penyelesaian check-out",
    );
  }
});

test("paid final invoices use current balance; incomplete or legacy balances remain actionable", () => {
  const owing = { ...closed, decisionStatus: "amount_due" as const, amountDue: 1560000 };
  assert.equal(checkoutActionLabel("ended", owing), "Lihat riwayat check-out");
  assert.equal(
    checkoutActionLabel("ended", { ...owing, currentAmountDue: 100000 }),
    "Lihat penyelesaian check-out",
  );
  assert.equal(
    checkoutActionLabel("ended", { ...owing, currentAmountDue: undefined }),
    "Lihat penyelesaian check-out",
  );
  assert.equal(
    checkoutActionLabel("active", { ...closed, state: "scheduled" }),
    "Lanjutkan proses check-out",
  );
});

function entry(id: string, fileId: string | null): CheckoutRecordedEvidence {
  return {
    id,
    category: "inventory",
    metadata: { confirmed: true, items: [{ name: "Kursi", returnedQuantity: 1 }] },
    recordedAt: "2026-09-24T09:00:00Z",
    recordedBy: "Pengelola",
    fileUnavailable: false,
    file: fileId
      ? {
          id: fileId,
          originalFilename: "inventaris.jpg",
          sanitizedFilename: "inventaris.jpg",
          mimeType: "image/jpeg",
          fileSizeBytes: 1200,
        }
      : null,
  };
}

test("history groups attachments without repeating metadata, and never loses unavailable-file records", () => {
  const records = [
    entry("1", "a"),
    entry("2", "b"),
    entry("3", "a"),
    { ...entry("4", null), fileUnavailable: true },
  ];
  const groups = checkoutEvidenceGroups(records, 3);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].files.map((file) => file.id),
    ["a", "b"],
  );
  assert.equal(groups[0].unavailable, true);
  assert.equal(checkoutEvidenceGroups(records, 5).length, 0);
  assert.equal(
    checkoutEvidenceGroups([{ ...entry("5", null), category: "unknown_future_category" }], 3)
      .length,
    0,
  );
});

test("all recorded evidence categories map to the correct historical stage", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(CHECKOUT_EVIDENCE_LABELS).map(([key, value]) => [key, value.stage]),
    ),
    {
      notice_exception: 1,
      short_notice_waiver: 2,
      keys_access: 3,
      inventory: 3,
      parking: 3,
      utilities: 3,
      inspection: 4,
      damage: 5,
      deposit_offset: 5,
      settlement: 5,
      refund: 5,
    },
  );
});

test("property-wide counts reject cross-property, missing, negative and fractional summaries", () => {
  const counts = Object.fromEntries(Object.keys(RESIDENT_ATTENTION).map((key) => [key, 0]));
  assert.equal(
    parseResidentAttention({ data: { property_id: "property-a", counts } }, "property-a").counts
      .amount_due,
    0,
  );
  assert.throws(() =>
    parseResidentAttention({ data: { property_id: "property-b", counts } }, "property-a"),
  );
  for (const value of [-1, 0.5, "2", Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() =>
      parseResidentAttention(
        { data: { property_id: "property-a", counts: { ...counts, amount_due: value } } },
        "property-a",
      ),
    );
  }
  assert.throws(() =>
    parseResidentAttention({ data: { property_id: "property-a", counts: {} } }, "property-a"),
  );
});
