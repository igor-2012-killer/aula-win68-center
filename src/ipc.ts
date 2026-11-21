import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  EVENT_STATE,
  EVENT_STATUS,
  EVENT_TRAVEL,
  type IpcCommands,
  type IpcEvents,
} from "./generated/ipc";

export type { KeyEvent as RecordedKeyEvent, Recording as KeyRecording } from "./generated/ipc";

export const EVT_STATE = EVENT_STATE;
export const EVT_TRAVEL = EVENT_TRAVEL;
export const EVT_STATUS = EVENT_STATUS;

/** Backend rejects work after this long; fail fast so the UI never hangs. */
const TIMEOUT_MS = 8000;

type CommandArgs<K extends keyof IpcCommands> = IpcCommands[K]["args"];

function call<K extends keyof IpcCommands>(
  command: K,
  ...rest: CommandArgs<K> extends undefined ? [] : [args: CommandArgs<K>]
): Promise<IpcCommands[K]["result"]> {
  const args = rest[0] as Record<string, unknown> | undefined;
  return new Promise((resolve, reject) => {
    // The timer must be cleared when invoke settles, otherwise every call
    // leaves a pending 8 s rejection behind it.
    const timer = setTimeout(
      () => reject(new Error(`${command}: timed out`)),
      TIMEOUT_MS,
    );
    invoke<IpcCommands[K]["result"]>(command, args).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

const commands = {
  get_state: () => call("get_state"),
  refresh: () => call("refresh"),
  reconnect: () => call("reconnect"),
  set_global_actuation: (mm: number) => call("set_global_actuation", { mm }),
  set_keys_actuation: (keyIds: number[], mm: number) =>
    call("set_keys_actuation", { keyIds, mm }),
  set_keys_rapid_trigger: (
    keyIds: number[],
    on: boolean,
    pressMm: number,
    releaseMm: number,
  ) => call("set_keys_rapid_trigger", { keyIds, on, pressMm, releaseMm }),
  set_keys_deadzone: (keyIds: number[], pressMm: number, releaseMm: number) =>
    call("set_keys_deadzone", { keyIds, pressMm, releaseMm }),
  reset_keys: (keyIds: number[]) => call("reset_keys", { keyIds }),
  set_snap_tap: (pair: CommandArgs<"set_snap_tap">["pair"]) => call("set_snap_tap", { pair }),
  clear_snap_tap: () => call("clear_snap_tap"),
  scan_mod_tap: (keyIds: number[]) => call("scan_mod_tap", { keyIds }),
  set_mod_tap: (assignment: CommandArgs<"set_mod_tap">["assignment"]) =>
    call("set_mod_tap", { assignment }),
  clear_mod_tap: (keyId: number) => call("clear_mod_tap", { keyId }),
  set_lighting: (config: CommandArgs<"set_lighting">["config"]) => call("set_lighting", { config }),
  set_polling_rate: (index: number) => call("set_polling_rate", { index }),
  set_profile: (index: number) => call("set_profile", { index }),
  set_os_mode: (mac: boolean) => call("set_os_mode", { mac }),
  set_streaming: (on: boolean) => call("set_streaming", { on }),
  start_key_recording: () => call("start_key_recording"),
  stop_key_recording: () => call("stop_key_recording"),
} satisfies { [K in keyof IpcCommands]: unknown };

export const api = {
  getState: commands.get_state,
  refresh: commands.refresh,
  reconnect: commands.reconnect,
  setGlobalActuation: commands.set_global_actuation,
  setKeysActuation: commands.set_keys_actuation,
  setKeysRapidTrigger: commands.set_keys_rapid_trigger,
  setKeysDeadzone: commands.set_keys_deadzone,
  resetKeys: commands.reset_keys,
  setSnapTap: commands.set_snap_tap,
  clearSnapTap: commands.clear_snap_tap,
  scanModTap: commands.scan_mod_tap,
  setModTap: commands.set_mod_tap,
  clearModTap: commands.clear_mod_tap,
  setLighting: commands.set_lighting,
  setPollingRate: commands.set_polling_rate,
  setProfile: commands.set_profile,
  setOsMode: commands.set_os_mode,
  setStreaming: commands.set_streaming,
  startKeyRecording: commands.start_key_recording,
  stopKeyRecording: commands.stop_key_recording,
};

export function onState(cb: (state: IpcEvents[typeof EVENT_STATE]) => void): Promise<UnlistenFn> {
  return listen<IpcEvents[typeof EVENT_STATE]>(EVENT_STATE, (event) => cb(event.payload));
}

export function onTravel(cb: (microns: IpcEvents[typeof EVENT_TRAVEL]) => void): Promise<UnlistenFn> {
  return listen<IpcEvents[typeof EVENT_TRAVEL]>(EVENT_TRAVEL, (event) => cb(event.payload));
}

export function onStatus(
  cb: (kind: IpcEvents[typeof EVENT_STATUS][0], detail: IpcEvents[typeof EVENT_STATUS][1]) => void,
): Promise<UnlistenFn> {
  return listen<IpcEvents[typeof EVENT_STATUS]>(EVENT_STATUS, (event) => {
    cb(event.payload[0], event.payload[1]);
  });
}
