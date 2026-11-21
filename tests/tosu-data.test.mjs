import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/tosu-data.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parseTosuSnapshot, retainLastPlay } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("retain last valid gameplay observation across menu reset and empty play", () => {
  const frame = (state, hits, accuracy) => parseTosuSnapshot({ state: { name: state }, client: "stable", beatmap: { artist: "Artist", title: "Track", version: "Hard" }, play: { accuracy, hits } });
  const gameplay = frame("play", { 0: 2, 50: 1, 100: 2, 300: 50 }, 96.2);
  const empty = frame("play", { 0: 0, 50: 0, 100: 0, 300: 0 }, 100);
  const menu = frame("selectPlay", { 0: 0, 50: 0, 100: 0, 300: 0 }, 100);
  const last = retainLastPlay(null, gameplay);
  assert.equal(last.misses, 2);
  assert.equal(last.accuracy, 96.2);
  assert.equal(last.map, "Artist — Track [Hard]");
  assert.equal(retainLastPlay(last, menu), last);
  assert.equal(retainLastPlay(last, empty), last);
});

test("reject invalid snapshots and never invent missing results", () => {
  assert.equal(parseTosuSnapshot(null), null);
  assert.equal(parseTosuSnapshot({ state: {} }), null);
  const partial = parseTosuSnapshot({ state: { name: "play" }, play: { accuracy: 102, hits: { 0: 0, 300: 10 } } });
  assert.equal(partial.accuracy, null);
  assert.equal(partial.hasJudgements, false);
  assert.equal(retainLastPlay(null, partial), null);
});
