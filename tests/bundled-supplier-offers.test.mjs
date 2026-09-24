import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/bundledSupplierOffers.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const imported = await import(
  "data:text/javascript;base64," + Buffer.from(outputText).toString("base64")
);

const workspace = (companyName = "Bakfon") => ({
  version: 3,
  settings: { seller: {} },
  companies: [{ id: "bakfon-id", profile: { name: companyName }, createdAt: 1, updatedAt: 1 }],
  projects: [],
  folders: [],
  suppliers: [],
  supplierOffers: [],
});

test("imports the TELCON PDF as one distinct Bakfon supplier offer", () => {
  const result = imported.applyBundledSupplierOfferImports(workspace());
  assert.equal(result.supplierOffers.length, 1);
  assert.equal(result.supplierOffers[0].id, imported.TELCON_BAKFON_OFFER_ID);
  assert.equal(result.supplierOffers[0].companyId, "bakfon-id");
  assert.equal(result.supplierOffers[0].offerDate, "2026-09-24");
  assert.equal(result.supplierOffers[0].rows.length, 33);
  assert.ok(result.supplierOffers[0].rows.every((row) => row.supplierName === "TELCON MMC"));
  assert.ok(result.supplierOffers[0].rows.every((row) => !row.replacementName));
  assert.equal(result.suppliers[0].name, "TELCON MMC");
  assert.equal(result.folders[0].supplierId, result.suppliers[0].id);
});

test("PDF line totals match the stated VAT-exclusive total", () => {
  assert.ok(Math.abs(imported.telconBakfonImportedPurchaseTotal() - 435888.05) < 0.001);
});

test("import is idempotent and does not duplicate the offer", () => {
  const once = imported.applyBundledSupplierOfferImports(workspace("BAKFON MMC"));
  const twice = imported.applyBundledSupplierOfferImports(once);
  assert.strictEqual(twice, once);
  assert.equal(twice.supplierOffers.length, 1);
});

test("creates a distinct Bakfon company when no matching company exists", () => {
  const result = imported.applyBundledSupplierOfferImports(workspace("Başqa şirkət"));
  const bakfon = result.companies.find((company) => company.profile.name === "Bakfon");
  assert.ok(bakfon);
  assert.equal(result.supplierOffers[0].companyId, bakfon.id);
  assert.equal(result.companies.length, 2);
});
