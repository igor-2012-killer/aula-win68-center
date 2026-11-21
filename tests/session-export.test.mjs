import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/session-export.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createSessionExport } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("exports the same session data with distinct time origins and no invented stop bound", () => {
  const input = { keyStartWindowMs: 40, stopRequestMs: 1000, stopResponseMs: 1030, settings: "Z / X", sensor: { durationMs: 960, maxTravelMm: 3.4, interrupted: false, samples: [{ time: 5, z: 200, x: 0 }] }, keyboard: { duration_us: 980000, events: [{ elapsed_us: 100, key: "Z", down: true }], repeats: 0, truncated: false }, tosu: { truncated: false, frames: [{ receivedMs: 120, data: { state: "play", mapTimeMs: 42000 } }] } };
  const result = createSessionExport(input);
  assert.deepEqual(result.clock.keyStartWindowMs, [0, 40]);
  assert.equal(result.clock.sensorOriginMs, 40);
  assert.equal(result.clock.stopRequestMs, 1000);
  assert.equal(result.clock.stopResponseMs, 1030);
  assert.equal("keyStopWindowMs" in result.clock, false);
  assert.deepEqual(result.tosu.frames, input.tosu.frames);
  assert.deepEqual(result.keyboard.events, input.keyboard.events);
  assert.deepEqual(result.sensor.samples, input.sensor.samples);
});

test("keeps the same recording identifier and settings snapshot in exported data", () => {
  const input = { recordingId: "recording-1", settingsDetail: { keys: { Z: { rt_release: 0.12 }, X: { rt_release: 0.2 } } }, keyStartWindowMs: 0, stopRequestMs: 100, stopResponseMs: 110, settings: "Z / X", sensor: { durationMs: 100, maxTravelMm: 3.4, interrupted: false, samples: [] }, keyboard: { duration_us: 100000, events: [], repeats: 0, truncated: false }, tosu: { truncated: false, frames: [] }, precise: { status: "connected", updates: 2, invalid: 0, maxGapMs: 10, truncated: false, samples: [{ receivedMs: 5, k1: { count: 0, pressed: false }, k2: { count: 2, pressed: true } }] } };
  const exported = JSON.parse(JSON.stringify(createSessionExport(input)));
  assert.equal(exported.recordingId, input.recordingId);
  assert.deepEqual(exported.settingsDetail, input.settingsDetail);
  assert.deepEqual(exported.precise, input.precise);
});
