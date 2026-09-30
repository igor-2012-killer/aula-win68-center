/** Mirrors `src-tauri/src/state.rs`. Keep both in sync. */

export type KeyMode = "global" | "single" | "rapidtrigger";

export interface KeySettings {
  mode: KeyMode;
  /** Actuation point, millimetres. */
  actuation: number;
  /** Rapid trigger press sensitivity, millimetres. */
  rt_press: number;
  /** Rapid trigger release sensitivity, millimetres. */
  rt_release: number;
  press_deadzone: number;
  release_deadzone: number;
}

export interface SnapTap {
  key_a: number;
  key_b: number;
  value_a: number;
  value_b: number;
  mode: number;
  key_type: number;
  delay_ms: number;
}

export interface Lighting {
  enabled: boolean;
  effect: number;
  /** 0..4 */
  brightness: number;
  /** 0..4 */
  speed: number;
  reversed: boolean;
  super_response: boolean;
  /** Minutes; 0 = never. */
  sleep_minutes: number;
  static_effect: number;
  /** Seven `#rrggbb` strings in wire order. */
  colors: [string, string, string, string, string, string, string];
}


export interface KeyDef {
  id: number;
  row: number;
  col: number;
  label: string;
  x: number;
  y: number;
  w: number;
}

export interface KeyboardState {
  connected: boolean;
  reconnecting: boolean;
  last_error: string | null;
  device_name: string;
  firmware: string;
  min_travel: number;
  max_travel: number;
  step: number;
  polling_rate: number;
  profile: number;
  mac_layout: boolean;
  global_actuation: number;
  global_press_deadzone: number;
  global_release_deadzone: number;
  lighting: Lighting;
  /**
   * Configured Snap Tap pair, or `null` when Snap Tap is off.
   *
   * `value_a` / `value_b` are raw firmware units — the vendor calls them
   * `DKSV[0]` / `DKSV[1]` and their unit has not been measured, so the UI does
   * not present them as millimetres.
   */
  snap_tap: SnapTap | null;
  keys: Record<number, KeySettings>;
  layout: KeyDef[];
  presets: [string, number[]][];
  /** Micrometres, indexed by `row * 21 + col`. */
  sensors: number[];
}

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
