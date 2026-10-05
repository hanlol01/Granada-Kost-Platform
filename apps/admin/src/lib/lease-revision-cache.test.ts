import assert from "node:assert/strict";
import test from "node:test";
import { refreshLeaseRevisionProjections } from "./lease-revision-cache.ts";

const scope = { propertyId: "property-a", leaseId: "lease-a", residentId: "resident-a" };

test("refresh covers nested property query keys and lease/resident history, not other properties", async () => {
  const matched: boolean[] = [];
  const refreshed = await refreshLeaseRevisionProjections({
    invalidateQueries: async ({ predicate }) => {
      for (const queryKey of [
        ["rooms", "list", { propertyId: "property-a" }],
        ["reports", { filters: { propertyId: "property-a" } }],
        ["resident-correction-history", "resident-a"],
        ["lease-service-period-history", "lease-a"],
        ["rooms", "property-b"],
      ]) matched.push(predicate({ queryKey }));
    },
  }, scope);
  assert.equal(refreshed, true);
  assert.deepEqual(matched, [true, true, true, true, false]);
});

test("refresh failure never converts a confirmed save into an uncertain commit", async () => {
  for (const invalidateQueries of [
    () => { throw new Error("synchronous refresh failure"); },
    async () => { throw new Error("asynchronous refresh failure"); },
  ]) {
    assert.equal(await refreshLeaseRevisionProjections({ invalidateQueries }, scope), false);
  }
});

test("confirmed cancellation/restoration refreshes records without refetching the consumed command review", async () => {
  const matched: boolean[] = [];
  await refreshLeaseRevisionProjections({
    invalidateQueries: async ({ predicate }) => {
      for (const queryKey of [
        ["lease-cancellation-preview", scope.propertyId, scope.leaseId],
        ["lease-archive-restoration-preview", scope.propertyId, "archive-a"],
        ["lease-archive-detail", scope.propertyId, "archive-a"],
        ["lease-revision-context", scope.propertyId, scope.leaseId],
        ["resident-billing", scope.propertyId, scope.residentId],
      ]) matched.push(predicate({ queryKey }));
    },
  }, scope);
  assert.deepEqual(matched, [false, false, true, true, true]);
});

test("a purge cancels and evicts only selected evidence previews before refreshing projections", async () => {
  const order: string[]=[];
  const matching: boolean[]=[];
  const refreshed = await refreshLeaseRevisionProjections({
    cancelQueries: async ({ predicate }) => {
      order.push("cancel");
      for (const queryKey of [["file","preview","file-a"],["file","preview","file-b"],
        ["file","metadata","file-a"],["other","preview","file-a"]]) matching.push(predicate({ queryKey }));
    },
    removeQueries: ({ predicate }) => {
      order.push("remove");
      assert.equal(predicate({ queryKey:["file","preview","file-a"] }),true);
    },
    invalidateQueries: async () => { order.push("refresh"); },
  },scope,["file-a"]);
  assert.equal(refreshed,true);
  assert.deepEqual(matching,[true,false,false,false]);
  assert.deepEqual(order,["cancel","remove","refresh"]);
});

test("a preview-cache failure still refreshes billing and does not undo confirmed purge", async () => {
  let refreshed=false;
  assert.equal(await refreshLeaseRevisionProjections({
    cancelQueries:async()=>{ throw new Error("cache unavailable"); },
    removeQueries:()=>assert.fail("in-flight preview was not cancelled"),
    invalidateQueries:async()=>{ refreshed=true; },
  },scope,["file-a"]),false);
  assert.equal(refreshed,true);
});
