import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/syncTiming.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const syncTiming = await import(
  "data:text/javascript;base64," + Buffer.from(outputText).toString("base64")
);

test("ordinary workspace changes are sent after a short debounce", () => {
  assert.equal(syncTiming.remoteWriteDelayMs({ cashDirty: false, queuedAt: 1000, now: 1000 }), 120);
});

test("cash changes use the fastest write delay", () => {
  assert.equal(syncTiming.remoteWriteDelayMs({ cashDirty: true, queuedAt: 1000, now: 1000 }), 40);
});

test("continuous editing cannot postpone a write beyond 350 milliseconds", () => {
  assert.equal(syncTiming.remoteWriteDelayMs({ cashDirty: false, queuedAt: 1000, now: 1300 }), 50);
  assert.equal(syncTiming.remoteWriteDelayMs({ cashDirty: false, queuedAt: 1000, now: 1400 }), 0);
});
