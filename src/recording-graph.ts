/** Gaps are based on UI callback arrival times, not hardware timestamps. */
export const SENSOR_GAP_MS = 250;

export interface TravelSample { time: number; z: number; x: number }

/** Split before reducing the data, so rendering never bridges a detected gap. */
export function splitTravelSamples(samples: readonly TravelSample[], gapMs = SENSOR_GAP_MS): TravelSample[][] {
  const segments: TravelSample[][] = [];
  for (const sample of samples) {
    const lastSegment = segments[segments.length - 1];
    const previous = lastSegment?.[lastSegment.length - 1];
    if (!lastSegment || !previous || sample.time - previous.time > gapMs || sample.time < previous.time) {
      segments.push([sample]);
    } else {
      lastSegment.push(sample);
    }
  }
  return segments;
}

/** Keep bucket endpoints and both keys' extrema, in their original order. */
export function reduceTravelSegment(samples: readonly TravelSample[], bucketSize: number): TravelSample[] {
  const output: TravelSample[] = [];
  const size = Math.max(1, Math.floor(bucketSize));
  for (let start = 0; start < samples.length; start += size) {
    const end = Math.min(samples.length, start + size);
    const indices = new Set([start, end - 1]);
    for (const key of ["z", "x"] as const) {
      let min = start, max = start;
      for (let i = start + 1; i < end; i++) {
        if (samples[i]![key] < samples[min]![key]) min = i;
        if (samples[i]![key] > samples[max]![key]) max = i;
      }
      indices.add(min); indices.add(max);
    }
    for (const i of [...indices].sort((a, b) => a - b)) output.push(samples[i]!);
  }
  return output;
}
