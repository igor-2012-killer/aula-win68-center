/** IPC structs generated from Rust. UI constants below are not on the wire. */

import type { KeyMode } from "./generated/ipc";

export type {
  KeyDef,
  KeyMode,
  KeySettings,
  KeyboardState,
  Lighting,
  ModTapAssignment,
  SnapTap,
} from "./generated/ipc";

export const SENSOR_COLS = 21;
export const SENSOR_COUNT = 21 * 6;

export const POLLING_RATES: [number, number][] = [
  [0, 8000],
  [1, 4000],
  [2, 2000],
  [3, 1000],
  [4, 500],
];

export const PROFILE_COUNT = 4;

export const MODE_LABEL: Record<KeyMode, string> = {
  global: "GLOBAL",
  single: "ACT",
  rapidtrigger: "RT",
};

/** Lighting effects supported by firmware 9.1. */
export const LIGHT_EFFECTS: [number, string][] = [
  [0, "Static"],
  [1, "Rainbow"],
  [2, "Breathing"],
  [3, "Reactive"],
  [4, "Wave"],
  [5, "Ripple"],
  [6, "Spectrum"],
  [7, "Marquee"],
  [8, "Rainbow Wave"],
  [9, "Ambient"],
  [10, "Spark"],
  [11, "Starlight"],
  [12, "Gradient"],
  [13, "Pulse"],
  [14, "Cycle"],
  [15, "Search"],
  [16, "Undertow"],
  [17, "Frost"],
  [18, "Fire"],
  [19, "Aurora"],
  [20, "Ocean"],
];

export const SLEEP_OPTIONS: [number, string][] = [
  [0, "Never"],
  [1, "1 min"],
  [3, "3 min"],
  [5, "5 min"],
  [10, "10 min"],
  [15, "15 min"],
  [30, "30 min"],
  [60, "60 min"],
];
