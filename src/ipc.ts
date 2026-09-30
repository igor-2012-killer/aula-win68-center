import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { KeyboardState, Lighting } from "./types";

export const EVT_STATE = "kb://state";
export const EVT_TRAVEL = "kb://travel";
export const EVT_STATUS = "kb://status";

/** Backend rejects work after this long; fail fast so the UI never hangs. */
const TIMEOUT_MS = 8000;

function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return Promise.race([
    invoke<T>(command, args),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${command}: timed out`)), TIMEOUT_MS),
    ),
  ]);
}

export const api = {
  getState: () => call<KeyboardState>("get_state"),
  refresh: () => call<void>("refresh"),
  reconnect: () => call<void>("reconnect"),

  setGlobalActuation: (mm: number) => call<void>("set_global_actuation", { mm }),
  setKeysActuation: (keyIds: number[], mm: number) =>
    call<void>("set_keys_actuation", { keyIds, mm }),
  setKeysRapidTrigger: (keyIds: number[], on: boolean, pressMm: number, releaseMm: number) =>
    call<void>("set_keys_rapid_trigger", { keyIds, on, pressMm, releaseMm }),
  setKeysDeadzone: (keyIds: number[], pressMm: number, releaseMm: number) =>
    call<void>("set_keys_deadzone", { keyIds, pressMm, releaseMm }),
  resetKeys: (keyIds: number[]) => call<void>("reset_keys", { keyIds }),

  setLighting: (config: Lighting) => call<void>("set_lighting", { config }),

  setPollingRate: (index: number) => call<void>("set_polling_rate", { index }),
  setProfile: (index: number) => call<void>("set_profile", { index }),
  setOsMode: (mac: boolean) => call<void>("set_os_mode", { mac }),
  setStreaming: (on: boolean) => call<void>("set_streaming", { on }),
};

export function onState(cb: (state: KeyboardState) => void): Promise<UnlistenFn> {
  return listen<KeyboardState>(EVT_STATE, (event) => cb(event.payload));
}

export function onTravel(cb: (microns: number[]) => void): Promise<UnlistenFn> {
  return listen<number[]>(EVT_TRAVEL, (event) => cb(event.payload));
}

export function onStatus(cb: (kind: string, detail: string | null) => void): Promise<UnlistenFn> {
  return listen<[string, string | null]>(EVT_STATUS, (event) => cb(event.payload[0], event.payload[1]));
}
