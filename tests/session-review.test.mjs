import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/session-review.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { reviewSession, comparisonIdentity } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const frame = (at, state, time, modsChecksum = "nomod") => ({ receivedMs: at, data: { state, mapTimeMs: time, mapChecksum: "map1", map: "track", client: "stable", mode: 0, rate: 1, modsChecksum, modsName: "", accuracy: 97, misses: 3, hasJudgements: true } });
const session = () => ({ schema: "aula-osu-session-v1", settings: "RT 0.12", keyboard: { duration_us: 1_000_000, truncated: false, events: [{ elapsed_us: 100_000, key: "Z", down: true }, { elapsed_us: 200_000, key: "Z", down: false }, { elapsed_us: 250_000, key: "X", down: true }, { elapsed_us: 400_000, key: "X", down: false }, { elapsed_us: 600_000, key: "Z", down: true }] }, sensor: { interrupted: false }, tosu: { truncated: false, frames: [frame(50, "play", 5000), frame(150, "play", 5100), frame(250, "play", 100), frame(300, "selectPlay", 0)] } });

test("summarizes complete and unfinished presses without guessing", () => {
  const result = reviewSession(session());
  assert.deepEqual(result.keys.Z, { presses: 2, releases: 1, paired: 1, medianHoldMs: 100, incomplete: 1 });
  assert.deepEqual(result.keys.X, { presses: 1, releases: 1, paired: 1, medianHoldMs: 150, incomplete: 0 });
  assert.equal(result.score.rewinds, 1);
  assert.equal(result.score.accuracy, 97);
  assert.equal(result.score.misses, 3);
});

test("a recording without sensor polling can still be reviewed", () => {
  const input = session();
  input.sensor = { enabled: false, interrupted: false, samples: [] };
  const review = reviewSession(input);
  assert.equal(review.keys.Z.presses, 2);
  assert.equal(review.score.accuracy, 97);
  assert.equal(review.score.truncated, false);
});

test("ignores a pre-judgement time reset observed on entering play, but counts later rewinds", () => {
  const entry = session();
  const stale = frame(50, "play", 38169); stale.data.hasJudgements = false;
  const reset = frame(150, "play", 0); reset.data.hasJudgements = false;
  const judged = frame(250, "play", 2500);
  entry.tosu.frames = [stale, reset, judged];
  let result = reviewSession(entry);
  assert.equal(result.score.firstMapTimeMs, 0);
  assert.equal(result.score.lastMapTimeMs, 2500);
  assert.equal(result.score.rewinds, 0);
  entry.tosu.frames.push(frame(300, "play", 0));
  result = reviewSession(entry);
  assert.equal(result.score.rewinds, 1);
});

test("requires all identity fields and detects mismatched mods", () => {
  const first = reviewSession(session());
  const same = reviewSession(session());
  assert.equal(comparisonIdentity(first, same), "same");
  const different = session(); different.tosu.frames.forEach((item) => { item.data.modsChecksum = "different"; });
  assert.equal(comparisonIdentity(first, reviewSession(different)), "different");
  const old = session(); old.tosu.frames.forEach((item) => { delete item.data.modsChecksum; delete item.data.mode; });
  assert.equal(comparisonIdentity(first, reviewSession(old)), "unknown");
  const mixed = session(); mixed.tosu.frames[1].data.modsChecksum = "different";
  assert.equal(comparisonIdentity(first, reviewSession(mixed)), "unknown");
  const missing = session(); delete missing.tosu.frames[0].data.mapChecksum;
  assert.equal(comparisonIdentity(first, reviewSession(missing)), "unknown");
});

test("rejects malformed, unsorted and unsupported files", () => {
  assert.throws(() => reviewSession({ schema: "other" }));
  const invalid = session(); invalid.keyboard.events[1].elapsed_us = 10;
  assert.throws(() => reviewSession(invalid));
  const otherKey = session(); otherKey.keyboard.events[0].key = "A";
  assert.throws(() => reviewSession(otherKey));
});
