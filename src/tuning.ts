import type { KeyboardState, KeySettings, ModTapAssignment, SnapTap } from "./types";
import type { SessionReview } from "./session-review";

export type TuningKey = "Z" | "X";
export type TuningParameter = "rt_press" | "rt_release";
export interface TuningSnapshot {
  keys: Record<TuningKey, KeySettings>;
  profile: number;
  pollingRate: number;
  macLayout: boolean;
  globalActuation: number;
  globalPressDeadzone: number;
  globalReleaseDeadzone: number;
  superResponse: boolean;
  firmware: string;
  deviceName: string;
  snapTap: SnapTap | null;
  modTap: ModTapAssignment[];
}
export interface TuningAttempt {
  id: string;
  settings: TuningSnapshot;
  review: SessionReview;
  comfort: number;
  extra: "yes" | "no" | "unknown";
  missing: "yes" | "no" | "unknown";
}
export type TuningIssue =
  | "no_settings"
  | "invalid_session"
  | "no_game"
  | "interrupted"
  | "range"
  | "identity"
  | "settings"
  | "unchanged"
  | "multiple"
  | "duplicate";

/** Validate snapshots read from JSON before using them in the guide. */
export function isTuningSnapshot(input: unknown): input is TuningSnapshot {
  if (!input || typeof input !== "object") return false;
  const snapshot = input as TuningSnapshot;
  const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
  const validKey = (value: KeySettings | undefined) => !!value && ["global", "single", "rapidtrigger"].includes(value.mode) && [value.actuation, value.rt_press, value.rt_release, value.press_deadzone, value.release_deadzone].every(finite);
  const snap = snapshot.snapTap;
  return !!snapshot.keys && validKey(snapshot.keys.Z) && validKey(snapshot.keys.X)
    && [snapshot.profile, snapshot.pollingRate, snapshot.globalActuation, snapshot.globalPressDeadzone, snapshot.globalReleaseDeadzone].every(finite)
    && typeof snapshot.macLayout === "boolean" && typeof snapshot.superResponse === "boolean"
    && typeof snapshot.firmware === "string" && typeof snapshot.deviceName === "string"
    && (snap === null || (!!snap && [snap.key_a, snap.key_b, snap.mode, snap.delay_ms].every(finite)))
    && Array.isArray(snapshot.modTap) && snapshot.modTap.every((entry) => !!entry && [entry.key_id, entry.hold_key, entry.tap_key, entry.delay_ms].every(finite));
}

export function tuningSnapshot(state: KeyboardState): TuningSnapshot | null {
  if (!state.keys[29] || !state.keys[27]) return null;
  return {
    keys: { Z: { ...state.keys[29] }, X: { ...state.keys[27] } },
    profile: state.profile, pollingRate: state.polling_rate, macLayout: state.mac_layout,
    globalActuation: state.global_actuation, globalPressDeadzone: state.global_press_deadzone,
    globalReleaseDeadzone: state.global_release_deadzone, superResponse: state.lighting.super_response,
    firmware: state.firmware, deviceName: state.device_name, snapTap: state.snap_tap ? { ...state.snap_tap } : null,
    modTap: state.mod_tap.map((assignment) => ({ ...assignment })),
  };
}

function sameKeySettings(a: KeySettings, b: KeySettings, ignored?: TuningParameter): boolean {
  return (
    a.mode === b.mode &&
    a.actuation === b.actuation &&
    (ignored === "rt_press" || a.rt_press === b.rt_press) &&
    (ignored === "rt_release" || a.rt_release === b.rt_release) &&
    a.press_deadzone === b.press_deadzone &&
    a.release_deadzone === b.release_deadzone
  );
}

function sameSnapTap(a: SnapTap | null, b: SnapTap | null): boolean {
  if (a === null || b === null) return a === b;
  return a.key_a === b.key_a && a.key_b === b.key_b && a.mode === b.mode && a.delay_ms === b.delay_ms;
}

function sameModTapList(a: readonly ModTapAssignment[], b: readonly ModTapAssignment[]): boolean {
  if (a.length !== b.length) return false;
  const sort = (list: readonly ModTapAssignment[]) =>
    [...list].sort((x, y) => x.key_id - y.key_id || x.hold_key - y.hold_key || x.tap_key - y.tap_key || x.delay_ms - y.delay_ms);
  const left = sort(a);
  const right = sort(b);
  return left.every((entry, i) => {
    const other = right[i]!;
    return (
      entry.key_id === other.key_id &&
      entry.hold_key === other.hold_key &&
      entry.tap_key === other.tap_key &&
      entry.delay_ms === other.delay_ms
    );
  });
}

/** Comparison is restricted to known snapshots. No hardware is accessed. */
export function settingsRelation(a: TuningSnapshot, b: TuningSnapshot, key: TuningKey, parameter: TuningParameter): "same" | "one" | "multiple" {
  const otherKey: TuningKey = key === "Z" ? "X" : "Z";
  const sameGlobals =
    a.profile === b.profile &&
    a.pollingRate === b.pollingRate &&
    a.macLayout === b.macLayout &&
    a.globalActuation === b.globalActuation &&
    a.globalPressDeadzone === b.globalPressDeadzone &&
    a.globalReleaseDeadzone === b.globalReleaseDeadzone &&
    a.superResponse === b.superResponse &&
    a.firmware === b.firmware &&
    a.deviceName === b.deviceName &&
    sameSnapTap(a.snapTap, b.snapTap) &&
    sameModTapList(a.modTap, b.modTap);
  if (
    !sameGlobals ||
    !sameKeySettings(a.keys[otherKey], b.keys[otherKey]) ||
    !sameKeySettings(a.keys[key], b.keys[key], parameter)
  ) {
    return "multiple";
  }
  return a.keys[key][parameter] !== b.keys[key][parameter] ? "one" : "same";
}

/** An eligibility check, not proof that play conditions or timings were identical. */
export function attemptIssue(attempt: TuningAttempt, prior: TuningAttempt[], group: "baseline" | "variant", key: TuningKey, parameter: TuningParameter): TuningIssue | null {
  if (prior.some((item) => item.id === attempt.id)) return "duplicate";
  if (!isTuningSnapshot(attempt.settings)) return "no_settings";
  const score = attempt.review.score;
  if (!score || !score.checksum || score.mode === null || !score.modsChecksum || score.rate === null || !score.client || score.accuracy === null || score.misses === null) return "no_game";
  if (score.truncated || score.playPeriods !== 1 || score.rewinds !== 0) return "interrupted";
  if (score.firstMapTimeMs === null || score.lastMapTimeMs === null || score.lastMapTimeMs - score.firstMapTimeMs < 10000 || attempt.review.keys.Z.presses + attempt.review.keys.X.presses === 0) return "range";
  if (attempt.settings.keys[key].mode !== "rapidtrigger") return "settings";
  const reference = prior[0];
  if (!reference) return group === "variant" ? "settings" : null;
  const initial = reference.review.score!;
  if (initial.checksum !== score.checksum || initial.mode !== score.mode || initial.modsChecksum !== score.modsChecksum || initial.rate !== score.rate || initial.client !== score.client) return "identity";
  if (initial.firstMapTimeMs === null || initial.lastMapTimeMs === null || Math.abs(initial.firstMapTimeMs - score.firstMapTimeMs) > 3000 || Math.abs(initial.lastMapTimeMs - score.lastMapTimeMs) > 3000) return "range";
  const relation = settingsRelation(reference.settings, attempt.settings, key, parameter);
  if (group === "baseline") return relation === "same" ? null : "settings";
  if (reference.settings.keys[key].mode !== "rapidtrigger") return "settings";
  if (relation === "same") return "unchanged";
  if (relation === "multiple") return "multiple";
  const variant = prior.find((item) => settingsRelation(reference.settings, item.settings, key, parameter) === "one");
  if (variant && settingsRelation(variant.settings, attempt.settings, key, parameter) !== "same") return "settings";
  return null;
}
