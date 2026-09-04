import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadSource(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));
}
const { rebaseCashReport } = await loadSource("../src/lib/cashSync.ts");
const { pruneCashSlotEdits } = await loadSource("../src/lib/cashReport.ts");
const row = (id, values = [], updatedAt = 1) => ({
  id, name: id, slots: Array.from({ length: 8 }, (_, i) => values[i] ?? 0),
  createdAt: 1, updatedAt,
});
const state = (...rows) => ({ rows, history: [] });

test("remote snapshots preserve active negative/decimal input", () => {
  const drafts = { "a:1": "-", "a:2": "0.", "a:3": "15", "deleted:0": "99" };
  assert.deepEqual(pruneCashSlotEdits([row("a", [0, 0, 0, 15])], drafts),
    { "a:1": "-", "a:2": "0.", "a:3": "15" });
});
test("two devices editing different cells retain both amounts", () => {
  const base = state(row("a", [100]));
  const local = state(row("a", [100, 25], 2));
  const remote = state(row("a", [100, 0, 50], 3), row("b", [75]));
  const result = rebaseCashReport(base, local, remote);
  assert.deepEqual(result.rows[0].slots, [100, 25, 50, 0, 0, 0, 0, 0]);
  assert.equal(result.rows[1].slots[0], 75);
  assert.equal(remote.rows[0].slots[1], 0, "input is not mutated");
});
test("stale device saving another module does not overwrite cash", () => {
  const base = state(row("a", [100]));
  const remote = state(row("a", [500], 2));
  assert.equal(rebaseCashReport(base, base, remote).rows[0].slots[0], 500);
});
test("intentional clearing and sum operation preserve zeroes", () => {
  const base = state(row("a", [100, 25]));
  const local = state(row("a", [125, 0], 2));
  assert.deepEqual(rebaseCashReport(base, local, base).rows[0].slots, local.rows[0].slots);
});
test("new edits made during a write are rebased on the saved result", () => {
  const sent = state(row("a", [100, 25], 2));
  const current = state(row("a", [100, 30], 3));
  const saved = state(row("a", [100, 25, 80], 4));
  assert.deepEqual(rebaseCashReport(sent, current, saved).rows[0].slots, [100, 30, 80, 0, 0, 0, 0, 0]);
});
test("row deletions are preserved, but concurrent edits are not discarded", () => {
  const base = state(row("a", [100]));
  assert.equal(rebaseCashReport(base, state(), base).rows.length, 0);
  assert.equal(rebaseCashReport(base, base, state()).rows.length, 0);
  assert.equal(rebaseCashReport(base, state(), state(row("a", [200], 2))).rows[0].slots[0], 200);
});
test("same-cell concurrent writes use the last writer only for that cell", () => {
  const base = state(row("a", [100]));
  const local = state(row("a", [200], 2));
  const remote = state(row("a", [300, 50], 3));
  assert.deepEqual(rebaseCashReport(base, local, remote).rows[0].slots, [200, 50, 0, 0, 0, 0, 0, 0]);
});
test("new rows and both histories survive a transaction retry", () => {
  const local = { ...state(row("new", [42])), history: [{ id: "l", savedAt: 1 }] };
  const remote = { ...state(row("remote", [12])), history: [{ id: "r", savedAt: 2 }] };
  const first = rebaseCashReport(state(), local, remote);
  assert.deepEqual(rebaseCashReport(state(), local, first), first);
  assert.equal(first.rows.length, 2);
  assert.deepEqual(first.history.map((x) => x.id), ["r", "l"]);
});
