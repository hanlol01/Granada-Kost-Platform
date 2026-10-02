import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { OwnerAccountSettings } from "@/components/property-owner-portal/OwnerAccountSettings";

test("Owner settings render separate accessible credential forms, without editable operational identity", () => {
  const html = renderToStaticMarkup(
    createElement(OwnerAccountSettings, { accountEmail: "owner@example.test" }),
  );
  assert.equal((html.match(/<form\b/g) ?? []).length, 2);
  assert.match(html, /value="owner@example.test"/);
  for (const id of [
    "owner-email",
    "owner-email-password",
    "owner-password-current",
    "owner-password-new",
    "owner-password-confirm",
  ]) {
    assert.match(html, new RegExp(`for="${id}"`));
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.equal((html.match(/type="password"/g) ?? []).length, 4);
  assert.equal((html.match(/minLength="12"/g) ?? []).length, 2);
  assert.match(html, /Simpan email/);
  assert.match(html, /Simpan password/);
  assert.match(html, /aria-label="Tampilkan password lama"/);
  assert.match(html, /seluruh sesi keluar/);
  assert.doesNotMatch(html, /name="(?:ownerId|userId|displayName|bankAccount)"/);
});

test("an account without email shows an empty required email field, never a generated identity", () => {
  const html = renderToStaticMarkup(createElement(OwnerAccountSettings, { accountEmail: null }));
  assert.match(html, /type="email"[^>]*required=""[^>]*value=""/);
});
