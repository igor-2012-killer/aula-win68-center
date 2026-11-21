import type { TosuSnapshot } from "./tosu-data";

/** Arrival time relative to the browser-side start request, not a game timestamp. */
export interface TosuFrame { receivedMs: number; data: TosuSnapshot }

export function summarizeTosuFrames(frames: readonly TosuFrame[]) {
  let maxGapMs = 0;
  let backwards = 0;
  let lastPlay: TosuFrame | null = null;
  const maps = new Set<string>();
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    const previous = frames[i - 1];
    if (previous) {
      maxGapMs = Math.max(maxGapMs, frame.receivedMs - previous.receivedMs);
      const a = previous.data, b = frame.data;
      if (a.state === "play" && b.state === "play" && a.mapChecksum !== null &&
          a.mapChecksum === b.mapChecksum && a.mapTimeMs !== null && b.mapTimeMs !== null &&
          b.mapTimeMs < a.mapTimeMs) backwards++;
    }
    if (frame.data.state === "play") {
      if (frame.data.mapChecksum) maps.add(frame.data.mapChecksum);
      if (frame.data.hasJudgements) lastPlay = frame;
    }
  }
  return { count: frames.length, maxGapMs, backwards, distinctMaps: maps.size, lastPlay };
}
