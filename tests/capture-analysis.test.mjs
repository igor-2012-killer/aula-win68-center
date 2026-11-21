import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/capture-analysis.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { summarizeTosuFrames } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const frame = (receivedMs, state, mapChecksum, mapTimeMs, hasJudgements = false) => ({ receivedMs, data: { state, mapChecksum, mapTimeMs, hasJudgements, accuracy: 97, misses: 2 } });

test("keeps observations within the supplied recording and reports timing discontinuities", () => {
  const frames = [frame(100, "selectPlay", "a", 0), frame(200, "play", "a", 100, true), frame(300, "play", "a", 250, true), frame(1300, "play", "a", 10, true), frame(1400, "play", "b", 1, false), frame(1500, "selectPlay", "b", 0)];
  const result = summarizeTosuFrames(frames);
  assert.equal(result.count, 6);
  assert.equal(result.maxGapMs, 1000);
  assert.equal(result.backwards, 1);
  assert.equal(result.distinctMaps, 2);
  assert.equal(result.lastPlay, frames[3]);
});

test("empty recordings and game updates without judgements don't invent a result", () => {
  const empty = summarizeTosuFrames([]);
  assert.equal(empty.count, 0);
  assert.equal(empty.lastPlay, null);
  assert.equal(summarizeTosuFrames([frame(1, "play", null, null)]).lastPlay, null);
});
