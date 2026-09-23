import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/creditAssessment.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { calculateCreditAssessment } = await import(
  "data:text/javascript;base64," + Buffer.from(outputText).toString("base64")
);

test("healthy low-risk income receives the minimum 10 percent down payment", () => {
  const result = calculateCreditAssessment({
    price: 1000,
    months: 6,
    risk: "low",
    salary: 1000,
    obligations: 200,
  });
  assert.equal(result.downPayment, 100);
  assert.equal(result.principal, 900);
  assert.equal(result.monthlyPayment, 150);
  assert.equal(result.maxMonthlyPayment, 320);
  assert.equal(result.autoAdjusted, false);
});

test("down payment is raised until the monthly payment meets the 40 percent DSR limit", () => {
  const result = calculateCreditAssessment({
    price: 1000,
    months: 3,
    risk: "med",
    salary: 1000,
    obligations: 700,
  });
  assert.equal(result.downPayment, 640);
  assert.equal(result.principal, 360);
  assert.equal(result.monthlyPayment, 120);
  assert.equal(result.autoAdjusted, true);
  assert.equal(result.obligationWarning, true);
});

test("manual down payment is respected unless the DSR limit requires more", () => {
  const result = calculateCreditAssessment({
    price: 1000,
    months: 3,
    risk: "low",
    salary: 1000,
    obligations: 700,
    manualDownPayment: 100,
  });
  assert.equal(result.downPayment, 640);
  assert.equal(result.autoAdjusted, true);
});

test("extra income participates in income ratio and monthly limit", () => {
  const withoutExtra = calculateCreditAssessment({
    price: 1200,
    months: 6,
    risk: "med",
    salary: 600,
    obligations: 300,
  });
  const withExtra = calculateCreditAssessment({
    price: 1200,
    months: 6,
    risk: "med",
    salary: 600,
    obligations: 300,
    extraIncome: 400,
  });
  assert.ok(withExtra.maxMonthlyPayment > withoutExtra.maxMonthlyPayment);
  assert.ok(withExtra.downPayment < withoutExtra.downPayment);
});

test("equal-payment schedule reaches a zero balance", () => {
  const result = calculateCreditAssessment({
    price: 900,
    months: 9,
    risk: "high",
    salary: 1500,
    obligations: 100,
  });
  assert.equal(result.schedule.length, 9);
  assert.equal(result.schedule.at(-1).remaining, 0);
  assert.ok(result.schedule.every((row) => row.payment === result.monthlyPayment));
});
