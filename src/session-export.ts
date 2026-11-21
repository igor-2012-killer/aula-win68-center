import type { TosuFrame } from "./capture-analysis";
import type { KeyRecording } from "./ipc";
import type { TravelSample } from "./recording-graph";
import type { TuningSnapshot } from "./tuning";
import type { PreciseRecording } from "./tosu-precise";

export interface SessionExportInput {
  keyStartWindowMs: number;
  stopRequestMs: number;
  stopResponseMs: number;
  settings: string;
  settingsDetail?: TuningSnapshot;
  recordingId?: string;
  sensor: { durationMs: number; maxTravelMm: number; interrupted: boolean; samples: TravelSample[]; enabled?: boolean };
  keyboard: KeyRecording;
  tosu: { truncated: boolean; frames: TosuFrame[] };
  precise?: PreciseRecording;
}

/** Times are observations, not a validated mapping to hardware or game time. */
export function createSessionExport(input: SessionExportInput) {
  return {
    schema: "aula-osu-session-v1",
    clock: {
      origin: "browser_start_request",
      keyStartWindowMs: [0, input.keyStartWindowMs],
      stopRequestMs: input.stopRequestMs,
      stopResponseMs: input.stopResponseMs,
      sensorOriginMs: input.keyStartWindowMs,
      warning: "Game and transport latency unknown; clock rates and judgement correspondence are not validated. Stop request and response are observations, not bounds on termination.",
    },
    settings: input.settings,
    settingsDetail: input.settingsDetail,
    recordingId: input.recordingId,
    sensor: input.sensor,
    keyboard: input.keyboard,
    tosu: input.tosu,
    precise: input.precise,
  };
}
