import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/corporateLocalParse.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const imported = await import(
  "data:text/javascript;base64," + Buffer.from(outputText).toString("base64")
);
const { parseOrderMatrix, parseQuoteMatrix, autoMatchProduct, parseLocalizedNumber } = imported;

const orderItems = [
  { id: "a", name: "Hikvision DS-2CD1043G0-I IP kamera 4MP" },
  { id: "b", name: "A4 kağız Svetocopy 80q/m2" },
  { id: "c", name: "HDMI kabel 3m" },
];

test("order: finds header row below company details and reads lines", () => {
  const matrix = [
    ['"ABC" MMC', null, null, null],
    ["Sifariş №15", null, null, null],
    ["№", "Malın adı", "Ölçü vahidi", "Miqdar"],
    [1, "Hikvision DS-2CD1043G0-I IP kamera 4MP", "ədəd", 12],
    [2, "A4 kağız Svetocopy 80q/m2", "qutu", "5"],
    [null, "Cəmi", null, null],
  ];
  assert.deepEqual(parseOrderMatrix(matrix), [
    { name: "Hikvision DS-2CD1043G0-I IP kamera 4MP", qty: 12, unit: "ədəd", note: "" },
    { name: "A4 kağız Svetocopy 80q/m2", qty: 5, unit: "qutu", note: "" },
  ]);
});

test("order: unit column is not confused with unit price", () => {
  const matrix = [
    ["Məhsul", "Say", "Vahid qiyməti"],
    ["HDMI kabel 3m", "4", "12,50"],
  ];
  assert.deepEqual(parseOrderMatrix(matrix), [{ name: "HDMI kabel 3m", qty: 4, unit: "", note: "" }]);
});

test("order: works without recognisable headers", () => {
  const matrix = [
    ["Hikvision DS-2CD1043G0-I IP kamera 4MP", 12],
    ["A4 kağız Svetocopy 80q/m2", 5],
  ];
  assert.deepEqual(parseOrderMatrix(matrix), [
    { name: "Hikvision DS-2CD1043G0-I IP kamera 4MP", qty: 12, unit: "", note: "" },
    { name: "A4 kağız Svetocopy 80q/m2", qty: 5, unit: "", note: "" },
  ]);
});

test("match: model code wins over wording", () => {
  assert.deepEqual(autoMatchProduct("IP camera DS-2CD1043G0-I", orderItems), { orderItemId: "a", matchType: "exact" });
  assert.deepEqual(autoMatchProduct("a4 kağız svetocopy 80q/m2", orderItems), { orderItemId: "b", matchType: "exact" });
  assert.deepEqual(autoMatchProduct("Kabel HDMI 3 metr", orderItems), { orderItemId: "c", matchType: "uncertain" });
  assert.deepEqual(autoMatchProduct("Printer toneri", orderItems), { orderItemId: null, matchType: "unmatched" });
});

test("quote: alternative product column marks substitutes", () => {
  const matrix = [
    ["Tələb olunan məhsul", "Əvəz məhsul", "Say", "Vahid qiyməti", "Cəmi"],
    ["Hikvision DS-2CD1043G0-I IP kamera 4MP", "Dahua IPC-HFW1430S 4MP", "12", "95,00", "1140,00"],
    ["A4 kağız Svetocopy 80q/m2", "", "5", "11.20", "56"],
    ["Printer toneri", "", "1", "40", "40"],
  ];
  const lines = parseQuoteMatrix(matrix, orderItems);
  assert.equal(lines.length, 3);
  assert.deepEqual(
    lines.map((l) => [l.orderItemId, l.matchType, l.offeredName, l.qty, l.unitPrice, l.totalPrice]),
    [
      ["a", "alternative", "Dahua IPC-HFW1430S 4MP", 12, 95, 1140],
      ["b", "exact", "A4 kağız Svetocopy 80q/m2", 5, 11.2, 56],
      [null, "unmatched", "Printer toneri", 1, 40, 40],
    ],
  );
});

test("quote: derives unit price from total and quantity", () => {
  const matrix = [
    ["Məhsul", "Miqdar", "Məbləğ"],
    ["HDMI kabel 3m", "4", "50"],
  ];
  const [line] = parseQuoteMatrix(matrix, orderItems);
  assert.equal(line.orderItemId, "c");
  assert.equal(line.unitPrice, 12.5);
});

test("numbers: comma and dot separators", () => {
  assert.equal(parseLocalizedNumber("1 234,50"), 1234.5);
  assert.equal(parseLocalizedNumber("1,234.50"), 1234.5);
  assert.equal(parseLocalizedNumber("12,5 AZN"), 12.5);
  assert.equal(parseLocalizedNumber("1.000"), 1000);
  assert.equal(parseLocalizedNumber(""), null);
});
