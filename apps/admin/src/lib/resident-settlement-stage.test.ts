import assert from "node:assert/strict";
import test from "node:test";
import { resolveResidentSettlementStage } from "./admin-resident";

test("a previously paid contract becomes outstanding after a correction adds rent", () => {
  assert.equal(resolveResidentSettlementStage({
    contractSettlementStage: "paid_in_full",
    contractSettlementRemainingAmount: 1_800_000,
  }), "outstanding");
});

test("paying the additional contract rent restores the paid stage", () => {
  assert.equal(resolveResidentSettlementStage({
    contractSettlementStage: "paid_in_full",
    contractSettlementRemainingAmount: 0,
  }), "paid_in_full");
});

test("unpaid checkpoint and operational stages retain their existing meaning", () => {
  for (const stage of [
    "awaiting_activation", "checkpoint_one_pending", "checkpoint_one_met",
    "checkpoint_two_pending", "checkpoint_two_met", "final_settlement_due",
    "overdue", "overdue_grace", "extended", "termination_pending",
    "preactivation_cancelled", "admin_action_required", "none",
  ] as const) {
    assert.equal(resolveResidentSettlementStage({
      contractSettlementStage: stage,
      contractSettlementRemainingAmount: 1_800_000,
    }), stage);
  }
});
