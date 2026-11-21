type Dict = Record<string, unknown>;
const object = (value: unknown): Dict | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Dict : null;
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const text = (value: unknown): string | null => typeof value === "string" && value.length <= 2048 ? value : null;

export interface KeySummary { presses: number; releases: number; paired: number; medianHoldMs: number | null; incomplete: number }
export interface SessionReview {
  settings: string | null;
  durationMs: number;
  keys: Record<"Z" | "X", KeySummary>;
  score: { map: string | null; checksum: string | null; mode: number | null; modsChecksum: string | null; modsName: string | null; rate: number | null; client: string | null; accuracy: number | null; misses: number | null; firstMapTimeMs: number | null; lastMapTimeMs: number | null; playPeriods: number; rewinds: number; truncated: boolean } | null;
}

/** Data-only decoder for exported files; never invokes device commands. */
export function reviewSession(input: unknown): SessionReview {
  const root = object(input);
  const keyboard = object(root?.keyboard);
  const tosu = object(root?.tosu);
  const sensor = object(root?.sensor);
  if (root?.schema !== "aula-osu-session-v1" || !keyboard || !tosu || !Array.isArray(keyboard.events) || !Array.isArray(tosu.frames) || keyboard.events.length > 50_000 || tosu.frames.length > 25_000) {
    throw new Error("invalid session");
  }
  const rawDuration = finite(keyboard.duration_us);
  if (rawDuration === null || rawDuration < 0 || rawDuration > 86_400_000_000) throw new Error("invalid duration");
  const held: Record<"Z" | "X", number | null> = { Z: null, X: null };
  const durations: Record<"Z" | "X", number[]> = { Z: [], X: [] };
  const keys: Record<"Z" | "X", KeySummary> = {
    Z: { presses: 0, releases: 0, paired: 0, medianHoldMs: null, incomplete: 0 },
    X: { presses: 0, releases: 0, paired: 0, medianHoldMs: null, incomplete: 0 },
  };
  let previousEventTime = -1;
  for (const item of keyboard.events) {
    const event = object(item);
    const key = event?.key;
    const time = finite(event?.elapsed_us);
    if ((key !== "Z" && key !== "X") || typeof event?.down !== "boolean" || time === null || time < previousEventTime || time > rawDuration) throw new Error("invalid key event");
    previousEventTime = time;
    if (event.down) {
      keys[key].presses++;
      if (held[key] !== null) keys[key].incomplete++;
      held[key] = time;
    } else {
      keys[key].releases++;
      if (held[key] === null) keys[key].incomplete++;
      else { durations[key].push((time - held[key]!) / 1000); held[key] = null; }
    }
  }
  for (const key of ["Z", "X"] as const) {
    if (held[key] !== null) keys[key].incomplete++;
    const values = durations[key].sort((a, b) => a - b);
    keys[key].paired = values.length;
    const middle = Math.floor(values.length / 2);
    if (values.length) keys[key].medianHoldMs = values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2;
  }

  let lastPlay: Dict | null = null;
  let firstMapTimeMs: number | null = null, lastMapTimeMs: number | null = null, previousMapTime: number | null = null;
  let previousChecksum: string | null = null, playPeriods = 0, rewinds = 0, inPlay = false, previousArrival = -1;
  const hashes = new Set<string | null>();
  const modes = new Set<number | null>();
  const modHashes = new Set<string | null>();
  const rates = new Set<number | null>();
  const clients = new Set<string | null>();
  for (const item of tosu.frames) {
    const frame = object(item), data = object(frame?.data), receivedMs = finite(frame?.receivedMs);
    if (!data || receivedMs === null || receivedMs < previousArrival || receivedMs < 0 || receivedMs > 190_000) throw new Error("invalid tosu frame");
    previousArrival = receivedMs;
    if (data.state !== "play") { inPlay = false; previousMapTime = null; previousChecksum = null; continue; }
    if (!inPlay) { playPeriods++; inPlay = true; }
    const checksum = text(data.mapChecksum), mapTime = finite(data.mapTimeMs);
    const mode = finite(data.mode), rate = finite(data.rate);
    if (mapTime !== null) {
      if (firstMapTimeMs === null) firstMapTimeMs = mapTime;
      if (previousMapTime !== null && checksum !== null && checksum === previousChecksum && mapTime < previousMapTime - 100) {
        if (lastPlay === null && data.hasJudgements !== true) {
          // tosu can expose a stale pre-play time when entering the map. A
          // reset before any judged notes starts the observable play window.
          firstMapTimeMs = mapTime;
          hashes.clear(); modes.clear(); modHashes.clear(); rates.clear(); clients.clear();
        } else rewinds++;
      }
      lastMapTimeMs = mapTime;
    }
    hashes.add(checksum);
    modes.add(mode !== null && Number.isInteger(mode) && mode >= 0 ? mode : null);
    modHashes.add(text(data.modsChecksum));
    rates.add(rate !== null && rate > 0 ? rate : null);
    clients.add(text(data.client));
    previousMapTime = mapTime; previousChecksum = checksum;
    if (data.hasJudgements === true) lastPlay = data;
  }
  let score: SessionReview["score"] = null;
  if (lastPlay) {
    const accuracy = finite(lastPlay.accuracy), misses = finite(lastPlay.misses);
    score = { map: text(lastPlay.map), checksum: hashes.size === 1 ? [...hashes][0] ?? null : null, mode: modes.size === 1 ? [...modes][0] ?? null : null, modsChecksum: modHashes.size === 1 ? [...modHashes][0] ?? null : null, modsName: text(lastPlay.modsName), rate: rates.size === 1 ? [...rates][0] ?? null : null, client: clients.size === 1 ? [...clients][0] ?? null : null, accuracy: accuracy !== null && accuracy >= 0 && accuracy <= 100 ? accuracy : null, misses: misses !== null && Number.isInteger(misses) && misses >= 0 ? misses : null, firstMapTimeMs, lastMapTimeMs, playPeriods, rewinds, truncated: keyboard.truncated === true || tosu.truncated === true || sensor?.interrupted === true };
  }
  return { settings: text(root.settings), durationMs: rawDuration / 1000, keys, score };
}

export function comparisonIdentity(a: SessionReview, b: SessionReview): "same" | "different" | "unknown" {
  const x = a.score, y = b.score;
  if (!x || !y || !x.checksum || !y.checksum || x.mode === null || y.mode === null || !x.modsChecksum || !y.modsChecksum || x.rate === null || y.rate === null || !x.client || !y.client) return "unknown";
  return x.checksum === y.checksum && x.mode === y.mode && x.modsChecksum === y.modsChecksum && x.rate === y.rate && x.client === y.client ? "same" : "different";
}
