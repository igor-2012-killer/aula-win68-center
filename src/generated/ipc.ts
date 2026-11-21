// Generated from the Rust IPC surface. Do not edit.
// Regenerate: UPDATE_IPC_BINDINGS=1 cargo test --manifest-path src-tauri/Cargo.toml --lib ipc_bindings_are_fresh

/**
 * High nibble of a key's mode.
 */
export type KeyMode = "global" | "single" | "rapidtrigger";

export type KeySettings = { mode: KeyMode, 
/**
 * Actuation point in millimetres.
 */
actuation: number, rt_press: number, rt_release: number, press_deadzone: number, release_deadzone: number, };

export type Lighting = { enabled: boolean, effect: number, brightness: number, speed: number, reversed: boolean, super_response: boolean, sleep_minutes: number, static_effect: number, 
/**
 * Seven `#rrggbb` colours, in wire order.
 */
colors: [string, string, string, string, string, string, string], };

/**
 * A configured Snap Tap pair.
 *
 * Snap Tap binds two keys so that the resolver decides which one outputs
 * while both are held. The firmware stores it as an "advanced key" pair
 * addressed by the **first** key, which is why reading it needs a sweep —
 * see `docs/VENDOR-DRIVER.md` §6.
 *
 * The wire record also carries resolver-threshold fields (`value_a`,
 * `value_b`) and the payload-7 byte, but every frame captured from the
 * vendor's own driver sends them as zero, so they are deliberately not part
 * of this model. An earlier build exposed the thresholds as sliders and two
 * written configurations made keys inert — the vendor's zeros are what
 * works.
 */
export type SnapTap = { 
/**
 * First key of the pair, by HID id. This is the read address.
 */
key_a: number, 
/**
 * Second key of the pair.
 */
key_b: number, 
/**
 * Resolver mode: 0 = last key pressed wins ("Back cover"), 1 = the first
 * key wins, 2 = the second key wins, 3 = neutral (both held → neither).
 * Confirmed by capture; see `protocol::socd_mode`.
 */
mode: number, 
/**
 * Dynamic delay in milliseconds. The vendor's own UI sends 0.
 */
delay_ms: number, };

/**
 * A configured Mod-Tap assignment on one key.
 *
 * The key emits `hold_key` when held past the threshold and `tap_key` on a
 * short press. Both are HID usage ids, and the threshold comes from the
 * firmware in 10 ms units. Semantics confirmed against the vendor driver and
 * on the board — see `docs/VENDOR-DRIVER.md` §6.
 */
export type ModTapAssignment = { 
/**
 * The key the assignment lives on, by HID id. Also the read address.
 */
key_id: number, 
/**
 * Emitted on hold (the vendor's `messages.hold` slot).
 */
hold_key: number, 
/**
 * Emitted on a short press (the vendor's `messages.click` slot).
 */
tap_key: number, 
/**
 * Hold threshold in milliseconds.
 */
delay_ms: number, };

export type KeyDef = { id: number, row: number, col: number, label: string, x: number, y: number, w: number, };

/**
 * Everything the UI needs in one payload.
 */
export type KeyboardState = { connected: boolean, 
/**
 * Set while the device is re-enumerating after a polling-rate change.
 */
reconnecting: boolean, last_error: string | null, device_name: string, firmware: string, 
/**
 * Device-reported travel limits in millimetres.
 */
min_travel: number, max_travel: number, 
/**
 * Smallest adjustable increment in millimetres.
 */
step: number, polling_rate: number, profile: number, mac_layout: boolean, global_actuation: number, global_press_deadzone: number, global_release_deadzone: number, lighting: Lighting, 
/**
 * Configured Snap Tap pair, or `None` when Snap Tap is off.
 */
snap_tap: SnapTap | null, 
/**
 * Keys with a Mod-Tap assignment. Only keys known to the cache appear
 * here; the Mod-Tap tab can sweep the whole board to discover the rest.
 */
mod_tap: Array<ModTapAssignment>, keys: { [key in number]?: KeySettings }, layout: Array<KeyDef>, presets: Array<[string, Array<number>]>, };

export type KeyEvent = { elapsed_us: number, key: "Z" | "X", down: boolean, };

export type Recording = { duration_us: number, events: Array<KeyEvent>, repeats: number, truncated: boolean, };

export interface IpcCommands {
  get_state: {
    args: undefined;
    result: KeyboardState;
  };
  refresh: {
    args: undefined;
    result: null;
  };
  reconnect: {
    args: undefined;
    result: null;
  };
  set_global_actuation: {
    args: {
      mm: number;
    };
    result: null;
  };
  set_keys_actuation: {
    args: {
      keyIds: Array<number>;
      mm: number;
    };
    result: null;
  };
  set_keys_rapid_trigger: {
    args: {
      keyIds: Array<number>;
      on: boolean;
      pressMm: number;
      releaseMm: number;
    };
    result: null;
  };
  set_keys_deadzone: {
    args: {
      keyIds: Array<number>;
      pressMm: number;
      releaseMm: number;
    };
    result: null;
  };
  reset_keys: {
    args: {
      keyIds: Array<number>;
    };
    result: null;
  };
  set_snap_tap: {
    args: {
      pair: SnapTap;
    };
    result: null;
  };
  clear_snap_tap: {
    args: undefined;
    result: null;
  };
  scan_mod_tap: {
    args: {
      keyIds: Array<number>;
    };
    result: null;
  };
  set_mod_tap: {
    args: {
      assignment: ModTapAssignment;
    };
    result: null;
  };
  clear_mod_tap: {
    args: {
      keyId: number;
    };
    result: null;
  };
  set_lighting: {
    args: {
      config: Lighting;
    };
    result: null;
  };
  set_polling_rate: {
    args: {
      index: number;
    };
    result: null;
  };
  set_profile: {
    args: {
      index: number;
    };
    result: null;
  };
  set_os_mode: {
    args: {
      mac: boolean;
    };
    result: null;
  };
  set_streaming: {
    args: {
      on: boolean;
    };
    result: null;
  };
  start_key_recording: {
    args: undefined;
    result: null;
  };
  stop_key_recording: {
    args: undefined;
    result: Recording;
  };
}

export const EVENT_STATE = "kb://state" as const;
export const EVENT_TRAVEL = "kb://travel" as const;
export const EVENT_STATUS = "kb://status" as const;

export interface IpcEvents {
  "kb://state": KeyboardState;
  "kb://travel": Array<number>;
  "kb://status": [string, string | null];
}
