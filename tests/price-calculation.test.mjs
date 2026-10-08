import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/priceCalculation.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const imported = await import(
  "data:text/javascript;base64," + Buffer.from(outputText).toString("base64")
);

test("customer card splits the zero-percent period into 3 and 6 months", () => {
  const result = imported.calculatePricePlanFromSalePrice(2000, 500);
  const options = imported.customerCreditPaymentOptions(result);

  assert.deepEqual(options.map((option) => option.months), [3, 6, 9, 12, 15, 18, 24]);
  assert.equal(options[0].monthly, 500);
  assert.equal(options[1].monthly, 250);
  assert.equal(options[2].monthly, 176.67);
});

test("customer share text contains product, down payment, and every monthly option", () => {
  const result = imported.calculatePricePlanFromSalePrice(2000, 500);
  const text = imported.buildCustomerCreditShareText("18 Pro 256GB Burgundy", 500, result);

  assert.match(text, /^18 Pro 256GB Burgundy\n/);
  assert.match(text, /İlkin ödəniş: 500 AZN/);
  assert.match(text, /3 ay — aylıq 500 AZN/);
  assert.match(text, /6 ay — aylıq 250 AZN/);
  assert.match(text, /9 ay — aylıq 176,67 AZN/);
  assert.match(text, /24 ay — aylıq 75,63 AZN/);
});

test("WhatsApp Web URL contains the complete encoded customer offer", () => {
  const result = imported.calculatePricePlanFromSalePrice(2000, 500);
  const text = imported.buildCustomerCreditShareText("18 Pro 256GB Burgundy", 500, result);
  const url = imported.buildWhatsAppWebShareUrl(text);

  assert.ok(url.startsWith("https://web.whatsapp.com/send?text="));
  assert.equal(decodeURIComponent(url.split("?text=")[1]), text);
});
