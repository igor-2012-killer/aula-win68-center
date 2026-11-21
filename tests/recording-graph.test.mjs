import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Execute the same TypeScript module on Node versions without native TS support.
const source = await readFile(new URL("../src/recording-graph.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { splitTravelSamples, reduceTravelSegment } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const sample = (time, z = 0, x = 0) => ({ time, z, x });

test("splits original samples at gaps before any reduction", () => {
  const input = [sample(0), sample(30), sample(280), sample(531), sample(560)];
  const segments = splitTravelSamples(input);
  assert.deepEqual(segments.map((part) => part.map((item) => item.time)), [[0, 30, 280], [531, 560]]);
  assert.deepEqual(splitTravelSamples([]), []);
  assert.deepEqual(splitTravelSamples([sample(1), sample(0)]).map((part) => part.length), [1, 1]);
});

test("reduction keeps both keys' extrema and segment endpoints in time order", () => {
  const input = [sample(0, 4, 4), sample(1, 0, 4), sample(2, 4, 10), sample(3, 10, 4), sample(4, 4, 0), sample(5, 4, 4)];
  assert.deepEqual(reduceTravelSegment(input, 6).map((item) => item.time), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(reduceTravelSegment([sample(10)], 100).map((item) => item.time), [10]);
});
