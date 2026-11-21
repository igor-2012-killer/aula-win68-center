import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/tuning.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { tuningSnapshot, settingsRelation, attemptIssue } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

const key = () => ({ mode: "rapidtrigger", actuation: 3.4, rt_press: 0.12, rt_release: 0.12, press_deadzone: 0, release_deadzone: 0 });
const state = () => ({ keys: { 29: key(), 27: key() }, profile: 0, polling_rate: 0, mac_layout: false, global_actuation: 2, global_press_deadzone: 0, global_release_deadzone: 0, lighting: { super_response: false }, firmware: "9.1", device_name: "Aula", snap_tap: null, mod_tap: [] });
const review = () => ({ settings: "RT", keys: { Z: { presses: 100 }, X: { presses: 30 } }, score: { map: "map", checksum: "hash", mode: 0, modsChecksum: "none", rate: 1, client: "stable", accuracy: 95, misses: 3, firstMapTimeMs: 0, lastMapTimeMs: 60000, playPeriods: 1, rewinds: 0, truncated: false } });
const attempt = (id) => ({ id, settings: tuningSnapshot(state()), review: review(), comfort: 4, extra: "unknown", missing: "no" });

test("snapshot is isolated and only the selected parameter may change", () => {
  const original = state();
  const a = tuningSnapshot(original);
  original.keys[29].rt_release = 0.3;
  assert.equal(a.keys.Z.rt_release, 0.12);
  const b = structuredClone(a); b.keys.Z.rt_release = 0.2;
  assert.equal(settingsRelation(a, b, "Z", "rt_release"), "one");
  assert.equal(settingsRelation(a, b, "X", "rt_release"), "multiple");
  b.keys.X.rt_press = 0.2;
  assert.equal(settingsRelation(a, b, "Z", "rt_release"), "multiple");
  b.keys.X.rt_press = 0.12; b.pollingRate = 1;
  assert.equal(settingsRelation(a, b, "Z", "rt_release"), "multiple");
  assert.equal(settingsRelation(a, a, "Z", "rt_release"), "same");
});

test("validates three baseline attempts and requires one consistent variant", () => {
  const a = attempt("a"), b = attempt("b"), c = attempt("c");
  assert.equal(attemptIssue(a, [], "baseline", "Z", "rt_release"), null);
  assert.equal(attemptIssue(b, [a], "baseline", "Z", "rt_release"), null);
  assert.equal(attemptIssue(a, [a], "baseline", "Z", "rt_release"), "duplicate");
  assert.equal(attemptIssue(c, [a, b], "variant", "Z", "rt_release"), "unchanged");
  c.settings.keys.Z.rt_release = 0.2;
  assert.equal(attemptIssue(c, [a, b], "variant", "Z", "rt_release"), null);
  const d = attempt("d"); d.settings.keys.Z.rt_release = 0.21;
  assert.equal(attemptIssue(d, [a, b, c], "variant", "Z", "rt_release"), "settings");
  d.settings.keys.Z.rt_release = 0.2;
  assert.equal(attemptIssue(d, [a, b, c], "variant", "Z", "rt_release"), null);
  d.settings.keys.X.rt_press = 0.14;
  assert.equal(attemptIssue(d, [a, b, c], "variant", "Z", "rt_release"), "multiple");
});

test("a complete six-attempt comparison survives summary serialization", () => {
  const all = [];
  for (let i = 0; i < 6; i++) {
    const entry = attempt(String(i));
    if (i >= 3) entry.settings.keys.Z.rt_release = 0.2;
    assert.equal(attemptIssue(entry, all, i < 3 ? "baseline" : "variant", "Z", "rt_release"), null);
    all.push(entry);
  }
  const restored = JSON.parse(JSON.stringify(all));
  const next = attempt("next"); next.settings.keys.Z.rt_release = 0.2;
  assert.equal(attemptIssue(next, restored, "variant", "Z", "rt_release"), null);
  assert.equal(attemptIssue(restored[0], restored, "baseline", "Z", "rt_release"), "duplicate");
});

test("rejects missing, interrupted, different or nonmatching game passages", () => {
  const a = attempt("a"), b = attempt("b");
  b.review.score.checksum = null;
  assert.equal(attemptIssue(b, [a], "baseline", "Z", "rt_release"), "no_game");
  b.review.score.checksum = "different";
  assert.equal(attemptIssue(b, [a], "baseline", "Z", "rt_release"), "identity");
  b.review.score.checksum = "hash"; b.review.score.rewinds = 1;
  assert.equal(attemptIssue(b, [a], "baseline", "Z", "rt_release"), "interrupted");
  b.review.score.rewinds = 0; b.review.score.firstMapTimeMs = 3001;
  assert.equal(attemptIssue(b, [a], "baseline", "Z", "rt_release"), "range");
  b.review.score.firstMapTimeMs = 3000;
  assert.equal(attemptIssue(b, [a], "baseline", "Z", "rt_release"), null);
  b.review.score.lastMapTimeMs = 10000;
  assert.equal(attemptIssue(b, [a], "baseline", "Z", "rt_release"), "range");
});

test("rejects non-Rapid-Trigger baseline attempts and ignores key order or extra fields", () => {
  const nonRt = attempt("non-rt");
  nonRt.settings.keys.Z.mode = "global";
  assert.equal(attemptIssue(nonRt, [], "baseline", "Z", "rt_release"), "settings");

  const a = attempt("a");
  const reordered = {
    deviceName: a.settings.deviceName,
    firmware: a.settings.firmware,
    extraField: "ignored",
    superResponse: a.settings.superResponse,
    globalReleaseDeadzone: a.settings.globalReleaseDeadzone,
    globalPressDeadzone: a.settings.globalPressDeadzone,
    globalActuation: a.settings.globalActuation,
    macLayout: a.settings.macLayout,
    pollingRate: a.settings.pollingRate,
    profile: a.settings.profile,
    modTap: [{ delay_ms: 200, tap_key: 8, hold_key: 4, key_id: 29, note: "extra" }],
    snapTap: { delay_ms: 0, mode: 0, key_b: 7, key_a: 4, extra: true },
    keys: {
      X: { release_deadzone: 0, press_deadzone: 0, rt_release: 0.12, rt_press: 0.12, actuation: 3.4, mode: "rapidtrigger" },
      Z: { release_deadzone: 0, press_deadzone: 0, rt_release: 0.12, rt_press: 0.12, actuation: 3.4, mode: "rapidtrigger" },
    },
  };
  a.settings.snapTap = { key_a: 4, key_b: 7, mode: 0, delay_ms: 0 };
  a.settings.modTap = [{ key_id: 29, hold_key: 4, tap_key: 8, delay_ms: 200 }];
  assert.equal(settingsRelation(a.settings, reordered, "Z", "rt_release"), "same");
  reordered.keys.Z.rt_release = 0.2;
  assert.equal(settingsRelation(a.settings, reordered, "Z", "rt_release"), "one");
});
