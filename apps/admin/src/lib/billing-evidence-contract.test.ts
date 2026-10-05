import assert from "node:assert/strict";
import test from "node:test";
import { parseBillingEvidence, billingEvidenceUnavailableCopy } from "./billing-evidence-contract.ts";

const id = "77777777-7777-4777-8777-777777777777";
const base = { id, original_filename:"transfer.pdf", mime_type:"application/pdf", file_size_bytes:512,
  content_path:`/files/${id}/content` };
test("old canonical billing evidence remains readable, not arbitrary external links", () => {
  assert.equal(parseBillingEvidence(base).availability,"available");
  assert.throws(()=>parseBillingEvidence({ ...base,content_path:"https://unsafe.invalid/file" }));
});
test("purged evidence has a verified timestamp, honest text and no link", () => {
  const value=parseBillingEvidence({ ...base,content_path:null,availability:"purged",purged_at:"2026-10-04T10:00:00.000Z" });
  assert.equal(value.content_path,null);
  assert.match(billingEvidenceUnavailableCopy(value).description,/tidak dapat.*dipulihkan/);
});
test("uncertain purge and legacy unavailable state never pretend physical absence", () => {
  for (const availability of ["purge_pending","unavailable"]) {
    const value=parseBillingEvidence({ ...base,content_path:null,availability,purged_at:null });
    assert.equal(value.content_path,null);
    assert.match(billingEvidenceUnavailableCopy(value).description,/Belum dapat dipastikan|bukan konfirmasi/);
  }
});
test("unknown, contradictory, incomplete or private evidence contracts are rejected", () => {
  for (const changed of [
    { availability:"purged",purged_at:null,content_path:null },
    { availability:"purged",purged_at:"2026-02-30T10:00:00.000Z",content_path:null },
    { availability:"purged",purged_at:"2026-10-04T10:00:00.000Z" },
    { availability:"purge_pending",purged_at:"2026-10-04T10:00:00.000Z",content_path:null },
    { availability:"unavailable",purged_at:null },
    { availability:"unsupported",purged_at:null,content_path:null },
    { availability:"available" },
    { content_path:null },
    { storage_path:"private" },
    { file_size_bytes:-1 },
  ]) assert.throws(()=>parseBillingEvidence({ ...base,...changed }),/bukti pembayaran tidak valid/);
});
