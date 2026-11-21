import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/tosu-precise.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parsePrecise, createPreciseCollector, summarizePrecise } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const snapshot = (k1, k2, pressed = false) => ({ keys: { k1: { count: k1, isPressed: pressed }, k2: { count: k2, isPressed: false }, m1: { count: 999, isPressed: true } }, hitErrors: [0, 20] });

test("reads only valid K1/K2 snapshots", () => {
  assert.deepEqual(parsePrecise(snapshot(3, 7, true)), { k1: { count: 3, pressed: true }, k2: { count: 7, pressed: false } });
  assert.equal(parsePrecise({ keys: { k1: { count: -1, isPressed: false } } }), null);
  assert.equal(parsePrecise(snapshot(1.5, 0)), null);
  assert.equal(parsePrecise(null), null);
});

test("tracks all updates and gaps, retains changes and the last sample", () => {
  const collector = createPreciseCollector();
  collector.setStatus("connected");
  collector.receive(snapshot(10, 20), 5);
  collector.receive(snapshot(10, 20), 15);
  collector.receive(snapshot(11, 22, true), 35);
  collector.receive(snapshot(11, 22, true), 45);
  const recording = collector.finish(), summary = summarizePrecise(recording);
  assert.equal(recording.updates, 4);
  assert.equal(recording.maxGapMs, 20);
  assert.deepEqual(recording.samples.map((v) => v.receivedMs), [5, 35, 45]);
  assert.deepEqual(summary.total, { k1: 1, k2: 2 });
  assert.deepEqual(summary.resets, { k1: 0, k2: 0 });
  assert.equal(summary.first.k1.count, 10);
  assert.equal(summary.last.k1.count, 11);
});

test("reports resets and invalid messages without inventing missing presses", () => {
  const c = createPreciseCollector();
  c.receive(snapshot(100, 10), 0);
  c.receive(snapshot(103, 11), 10);
  c.receive(null, 11);
  c.receive(snapshot(1, 0), 20);
  c.receive(snapshot(3, 1), 30);
  c.receive(snapshot(4, 2), 29);
  const recording = c.finish(), summary = summarizePrecise(recording);
  assert.equal(recording.invalid, 2);
  assert.deepEqual(summary.total, { k1: 5, k2: 2 });
  assert.deepEqual(summary.resets, { k1: 1, k2: 1 });
});

test("signals a limit rather than silently claiming complete coverage", () => {
  const c = createPreciseCollector(2);
  c.receive(snapshot(0, 0), 0);
  c.receive(snapshot(1, 0), 10);
  c.receive(snapshot(2, 0), 20);
  const data = c.finish();
  assert.equal(data.truncated, true);
  assert.equal(data.updates, 3);
  assert.equal(data.samples.length, 2);
});

test("preserves partial data and disconnected status without inventing a final value", () => {
  const c = createPreciseCollector();
  c.setStatus("connected");
  c.receive(snapshot(4, 2), 50);
  c.setStatus("disconnected");
  const result = c.finish();
  assert.equal(result.status, "disconnected");
  assert.equal(result.updates, 1);
  assert.equal(summarizePrecise(result).total.k1, 0);
  assert.equal(summarizePrecise(result).last.receivedMs, 50);
});
