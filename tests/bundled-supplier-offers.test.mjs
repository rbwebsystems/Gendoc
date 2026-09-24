import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const equipmentSource = await readFile(new URL("../src/lib/bakfonEquipment.ts", import.meta.url), "utf8");
const { outputText: equipmentOutput } = ts.transpileModule(equipmentSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const equipment = await import(
  "data:text/javascript;base64," + Buffer.from(equipmentOutput).toString("base64")
);
const source = (await readFile(new URL("../src/lib/bundledSupplierOffers.ts", import.meta.url), "utf8"))
  .replace(
    'import { BAKFON_EQUIPMENT } from "./bakfonEquipment";',
    `const BAKFON_EQUIPMENT = ${JSON.stringify(equipment.BAKFON_EQUIPMENT)};`,
  );
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
  assert.equal(result.supplierOffers[0].rows.length, 110);
  assert.equal(result.supplierOffers[0].rows.filter((row) => row.purchasePrice > 0).length, 31);
  assert.equal(result.supplierOffers[0].rows.filter((row) => row.purchasePrice === 0).length, 79);
  assert.ok(result.supplierOffers[0].rows.every((row) => row.supplierName === "TELCON MMC"));
  assert.equal(result.supplierOffers[0].rows.find((row) => row.name === "Mouse and Keyboard").unit, "set");
  assert.ok(result.supplierOffers[0].rows.find((row) => row.name === "Access card").replacementName.includes("Hikvision"));
  assert.equal(result.suppliers[0].name, "TELCON MMC");
  assert.equal(result.folders[0].supplierId, result.suppliers[0].id);
});

test("matched PDF prices keep their unit conversions and subtotal", () => {
  assert.equal(imported.telconBakfonPricedRowCount(), 31);
  assert.ok(Math.abs(imported.telconBakfonImportedPurchaseTotal() - 430295.73) < 0.001);
  const result = imported.applyBundledSupplierOfferImports(workspace());
  const connectors = result.supplierOffers[0].rows.find((row) => row.name === "RJ45 + Rezin CAT6");
  const sfp = result.supplierOffers[0].rows.find((row) => row.name === "SFP Single Mode 1KM (A+B)");
  assert.equal(connectors.purchasePrice * connectors.qty, 213.6);
  assert.equal(sfp.purchasePrice * sfp.qty, 128.84);
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

test("upgrades the previous short offer instead of adding a duplicate", () => {
  const source = workspace();
  source.supplierOffers = [{
    id: imported.TELCON_BAKFON_OFFER_ID,
    companyId: "bakfon-id",
    offerDate: "2026-09-24",
    rows: [{ id: "old", supplierName: "TELCON MMC", name: "Old", purchasePrice: 1, qty: 1, salePrice: 0 }],
    note: "TLC-2209/26",
    createdAt: 1,
    updatedAt: 1,
  }];
  const result = imported.applyBundledSupplierOfferImports(source);
  assert.equal(result.supplierOffers.length, 1);
  assert.equal(result.supplierOffers[0].rows.length, 110);
  assert.equal(result.supplierOffers[0].createdAt, 1);
});
