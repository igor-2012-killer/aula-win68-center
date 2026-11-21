/** Sampled game-side counters, not individual hit events or hardware timestamps. */
export interface PreciseKey { count: number; pressed: boolean }
export interface PreciseSample { receivedMs: number; k1: PreciseKey; k2: PreciseKey }
export type PreciseStatus = "not_requested" | "connecting" | "connected" | "unavailable" | "disconnected";
export interface PreciseRecording {
  status: PreciseStatus;
  updates: number;
  invalid: number;
  maxGapMs: number;
  truncated: boolean;
  samples: PreciseSample[];
}

const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
function parseKey(value: unknown): PreciseKey | null {
  const key = object(value);
  return key && Number.isSafeInteger(key.count) && (key.count as number) >= 0 && typeof key.isPressed === "boolean"
    ? { count: key.count as number, pressed: key.isPressed } : null;
}
export function parsePrecise(value: unknown): { k1: PreciseKey; k2: PreciseKey } | null {
  const keys = object(object(value)?.keys);
  const k1 = parseKey(keys?.k1), k2 = parseKey(keys?.k2);
  return k1 && k2 ? { k1, k2 } : null;
}

/** Keep only changes plus endpoints; count all arrivals to expose transport gaps. */
export function createPreciseCollector(limit = 25_000) {
  let status: PreciseStatus = "connecting", updates = 0, invalid = 0, maxGapMs = 0, truncated = false;
  let last: PreciseSample | null = null;
  const samples: PreciseSample[] = [];
  const receive = (value: unknown, receivedMs: number) => {
    const keys = parsePrecise(value);
    if (!keys || !Number.isFinite(receivedMs) || receivedMs < 0 || (last !== null && receivedMs < last.receivedMs)) { invalid++; return; }
    const next = { receivedMs, ...keys };
    if (last) maxGapMs = Math.max(maxGapMs, receivedMs - last.receivedMs);
    updates++;
    const changed = !last || last.k1.count !== next.k1.count || last.k2.count !== next.k2.count || last.k1.pressed !== next.k1.pressed || last.k2.pressed !== next.k2.pressed;
    if (changed) {
      if (samples.length < limit) samples.push(next); else truncated = true;
    }
    last = next;
  };
  const setStatus = (value: PreciseStatus) => { status = value; };
  const finish = (): PreciseRecording => {
    const saved = [...samples];
    if (last && saved.at(-1) !== last) {
      if (saved.length < limit) saved.push(last); else truncated = true;
    }
    return { status, updates, invalid, maxGapMs, truncated, samples: saved };
  };
  return { receive, setStatus, finish };
}

/** Sum observed positive counter changes; a reset is visible but its cause is unknown. */
export function summarizePrecise(data: PreciseRecording) {
  const total = { k1: 0, k2: 0 }, resets = { k1: 0, k2: 0 };
  for (let i = 1; i < data.samples.length; i++) {
    for (const key of ["k1", "k2"] as const) {
      const diff = data.samples[i]![key].count - data.samples[i - 1]![key].count;
      if (diff < 0) resets[key]++; else total[key] += diff;
    }
  }
  return { total, resets, first: data.samples[0] ?? null, last: data.samples.at(-1) ?? null };
}
