import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/sensor-stream.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createSensorStreamController } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("leaving while the stream starts queues a stop and ignores stale completion", async () => {
  const calls = [], settled = [], pending = [];
  let finishStart;
  const controller = createSensorStreamController((enabled) => {
    calls.push(enabled);
    return enabled ? new Promise((resolve) => { finishStart = resolve; }) : Promise.resolve();
  }, (value) => pending.push(value), (...args) => settled.push(args));
  const start = controller.request(true);
  await Promise.resolve();
  const stop = controller.request(false);
  finishStart();
  await Promise.all([start, stop]);
  assert.deepEqual(calls, [true, false]);
  assert.deepEqual(settled, [[false, null]]);
  assert.deepEqual(pending, [true, true, false]);
});

test("a failed start does not prevent a later stop", async () => {
  const calls = [], settled = [];
  const controller = createSensorStreamController(async (enabled) => {
    calls.push(enabled);
    if (enabled) throw new Error("disconnected");
  }, () => {}, (...args) => settled.push(args));
  assert.equal(await controller.request(true), false);
  assert.equal(await controller.request(false), true);
  assert.deepEqual(calls, [true, false]);
  assert.equal(settled[0][0], false);
  assert.match(settled[0][1].message, /disconnected/);
  assert.deepEqual(settled[1], [false, null]);
});

test("a failed stop is reported to callers so a light recording can refuse to start", async () => {
  const controller = createSensorStreamController(async () => { throw new Error("stop failed"); }, () => {}, () => {});
  assert.equal(await controller.request(false), false);
});

test("closing during startup stops the stream without updating the unmounted UI", async () => {
  const calls = [], settled = [], pending = [];
  let finishStart;
  const controller = createSensorStreamController((enabled) => {
    calls.push(enabled);
    return enabled ? new Promise((resolve) => { finishStart = resolve; }) : Promise.resolve();
  }, (value) => pending.push(value), (...args) => settled.push(args));
  controller.request(true);
  await Promise.resolve();
  const closed = controller.close();
  finishStart();
  await closed;
  assert.deepEqual(calls, [true, false]);
  assert.deepEqual(settled, []);
  assert.deepEqual(pending, [true]);
});

test("a failed stop after a successful start preserves the active state", async () => {
  const settled = [];
  const controller = createSensorStreamController(async (enabled) => {
    if (!enabled) throw new Error("stop failed");
  }, () => {}, (...args) => settled.push(args));
  assert.equal(await controller.request(true), true);
  assert.equal(await controller.request(false), false);
  assert.deepEqual(settled[0], [true, null]);
  assert.equal(settled[1][0], true);
  assert.match(settled[1][1].message, /stop failed/);
});
