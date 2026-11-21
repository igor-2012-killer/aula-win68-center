import { useRef, useState } from "preact/hooks";
import { STRINGS, type Lang } from "../../i18n";
import { api } from "../../ipc";
import { POLLING_RATES, PROFILE_COUNT, type KeyMode, type KeyboardState, type Lighting } from "../../types";
import { Button, Panel, Row, Segmented, Stat } from "../ui";

interface Props {
  state: KeyboardState;
  lang: Lang;
  run: (task: () => Promise<unknown>) => Promise<boolean>;
  notify: (text: string, tone?: "ok" | "error") => void;
}

/** Bumped whenever the export shape changes. */
const CONFIG_VERSION = 1;

interface ExportedKey {
  actuation: number;
  rt_press: number;
  rt_release: number;
  press_deadzone: number;
  release_deadzone: number;
  mode: KeyMode;
}

interface ExportedConfig {
  app: "aula-win68-center";
  version: number;
  exported: string;
  global_actuation: number;
  keys: Record<string, ExportedKey>;
  lighting: Lighting;
  polling_rate: number;
  profile: number;
  mac_layout: boolean;
}

function isValidKeyEntry(value: unknown): value is ExportedKey {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  return (
    (entry.mode === "global" || entry.mode === "single" || entry.mode === "rapidtrigger") &&
    finite(entry.actuation) &&
    finite(entry.rt_press) &&
    finite(entry.rt_release) &&
    finite(entry.press_deadzone) &&
    finite(entry.release_deadzone)
  );
}

function isValidLighting(value: unknown): value is Lighting {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const l = value as Record<string, unknown>;
  return (
    typeof l.enabled === "boolean" &&
    typeof l.effect === "number" &&
    Number.isFinite(l.effect) &&
    typeof l.brightness === "number" &&
    Number.isFinite(l.brightness) &&
    typeof l.speed === "number" &&
    Number.isFinite(l.speed) &&
    typeof l.reversed === "boolean" &&
    typeof l.super_response === "boolean" &&
    typeof l.sleep_minutes === "number" &&
    Number.isFinite(l.sleep_minutes) &&
    typeof l.static_effect === "number" &&
    Number.isFinite(l.static_effect) &&
    Array.isArray(l.colors) &&
    l.colors.length === 7 &&
    l.colors.every((c) => typeof c === "string")
  );
}

function buildConfig(state: KeyboardState): ExportedConfig {
  const keys: ExportedConfig["keys"] = {};
  for (const [id, settings] of Object.entries(state.keys)) {
    if (!settings) continue;
    keys[id] = {
      actuation: settings.actuation,
      rt_press: settings.rt_press,
      rt_release: settings.rt_release,
      press_deadzone: settings.press_deadzone,
      release_deadzone: settings.release_deadzone,
      mode: settings.mode,
    };
  }
  return {
    app: "aula-win68-center",
    version: CONFIG_VERSION,
    exported: new Date().toISOString(),
    global_actuation: state.global_actuation,
    keys,
    lighting: state.lighting,
    polling_rate: state.polling_rate,
    profile: state.profile,
    mac_layout: state.mac_layout,
  };
}

export function SystemTab({ state, lang, run, notify }: Props) {
  const t = STRINGS[lang];
  const offline = !state.connected;
  // The backend reports the re-enumeration window itself; no fake timers.
  const busyRate = offline || state.reconnecting;

  const fileInput = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);

  const rateLabel = POLLING_RATES.find(([index]) => index === state.polling_rate)?.[1] ?? 0;

  const exportConfig = () => {
    const blob = new Blob([JSON.stringify(buildConfig(state), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aula-win68-config-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importConfig = async (file: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      notify(t.importInvalid, "error");
      return;
    }
    const config = parsed as Partial<ExportedConfig> | null;
    if (
      !config ||
      config.app !== "aula-win68-center" ||
      typeof config.version !== "number" ||
      !isValidLighting(config.lighting) ||
      !config.keys ||
      typeof config.keys !== "object" ||
      Array.isArray(config.keys)
    ) {
      notify(t.importInvalid, "error");
      return;
    }

    const keysRecord = config.keys as Record<string, unknown>;
    const validIds = Object.keys(keysRecord)
      .map(Number)
      .filter((id) => state.keys[id] != null && isValidKeyEntry(keysRecord[String(id)]));

    setImporting(true);
    try {
      const ok = await run(async () => {
        if (
          typeof config.profile === "number" &&
          Number.isInteger(config.profile) &&
          config.profile >= 0 &&
          config.profile < PROFILE_COUNT &&
          config.profile !== state.profile
        ) {
          await api.setProfile(config.profile);
        }
        if (typeof config.mac_layout === "boolean") {
          await api.setOsMode(config.mac_layout);
        }
        if (typeof config.global_actuation === "number" && Number.isFinite(config.global_actuation)) {
          await api.setGlobalActuation(config.global_actuation);
        }
        await api.setLighting(config.lighting!);

        const globals = validIds.filter((id) => (keysRecord[String(id)] as ExportedKey).mode === "global");
        if (globals.length > 0) {
          await api.resetKeys(globals);
        }

        const singleGroups = new Map<string, { actuation: number; ids: number[] }>();
        const rapidGroups = new Map<string, { press: number; release: number; ids: number[] }>();
        const deadzoneGroups = new Map<string, { press: number; release: number; ids: number[] }>();

        for (const id of validIds) {
          const entry = keysRecord[String(id)] as ExportedKey;
          if (entry.mode === "single") {
            const key = entry.actuation.toFixed(2);
            const group = singleGroups.get(key) ?? { actuation: entry.actuation, ids: [] };
            group.ids.push(id);
            singleGroups.set(key, group);
          } else if (entry.mode === "rapidtrigger") {
            const key = `${entry.rt_press.toFixed(2)}:${entry.rt_release.toFixed(2)}`;
            const group = rapidGroups.get(key) ?? {
              press: entry.rt_press,
              release: entry.rt_release,
              ids: [],
            };
            group.ids.push(id);
            rapidGroups.set(key, group);
          }

          const dzKey = `${entry.press_deadzone.toFixed(2)}:${entry.release_deadzone.toFixed(2)}`;
          const dzGroup = deadzoneGroups.get(dzKey) ?? {
            press: entry.press_deadzone,
            release: entry.release_deadzone,
            ids: [],
          };
          dzGroup.ids.push(id);
          deadzoneGroups.set(dzKey, dzGroup);
        }

        for (const group of singleGroups.values()) {
          await api.setKeysActuation(group.ids, group.actuation);
        }
        for (const group of rapidGroups.values()) {
          await api.setKeysRapidTrigger(group.ids, true, group.press, group.release);
        }
        for (const group of deadzoneGroups.values()) {
          await api.setKeysDeadzone(group.ids, group.press, group.release);
        }

        const rateChanged =
          typeof config.polling_rate === "number" &&
          POLLING_RATES.some(([idx]) => idx === config.polling_rate) &&
          config.polling_rate !== state.polling_rate;
        if (rateChanged) {
          // Changing polling rate drops the USB handle; the watchdog refreshes once re-enumerated.
          await api.setPollingRate(config.polling_rate!);
        } else {
          await api.refresh();
        }
      });
      if (ok) notify(t.importDone);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div class="columns">
      <Panel title={t.pollingRate} description={t.pollingHint}>
        <div class="rate-grid">
          {POLLING_RATES.map(([index, hz]) => (
            <button
              key={index}
              type="button"
              class={`rate${index === state.polling_rate ? " is-active" : ""}`}
              disabled={busyRate}
              onClick={() => void run(() => api.setPollingRate(index))}
            >
              <span class="rate__hz">{hz >= 1000 ? `${hz / 1000}k` : hz}</span>
              <span class="rate__unit">Hz</span>
              <span class="rate__delay">
                {(1000 / hz).toFixed(3)} {t.unitMs}
              </span>
            </button>
          ))}
        </div>
        {state.reconnecting ? <p class="note note--warn">{t.reconnecting}</p> : null}
      </Panel>

      <Panel title={t.profile} description={t.profileHint}>
        <div class="rate-grid">
          {Array.from({ length: PROFILE_COUNT }, (_, index) => (
            <button
              key={index}
              type="button"
              class={`rate${index === state.profile ? " is-active" : ""}`}
              disabled={offline}
              onClick={() => void run(() => api.setProfile(index))}
            >
              <span class="rate__hz">{index + 1}</span>
              <span class="rate__unit">{t.profileUnit}</span>
            </button>
          ))}
        </div>
        <p class="note">{t.profileNote}</p>
      </Panel>

      <Panel title={t.layout} description={t.layoutHint}>
        <Row label={t.layout}>
          <Segmented
            value={state.mac_layout ? "mac" : "win"}
            options={[
              ["win", "Windows"],
              ["mac", "macOS"],
            ]}
            disabled={offline}
            onChange={(mode) => void run(() => api.setOsMode(mode === "mac"))}
          />
        </Row>
      </Panel>

      <Panel title={t.configTitle} description={t.configHint}>
        <div class="btn-row">
          <Button variant="primary" disabled={offline} onClick={exportConfig}>
            {t.exportConfig}
          </Button>
          <Button
            variant="ghost"
            disabled={offline || importing}
            onClick={() => fileInput.current?.click()}
          >
            {t.importConfig}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = (e.currentTarget as HTMLInputElement).files?.[0];
              if (file) void importConfig(file);
              (e.currentTarget as HTMLInputElement).value = "";
            }}
          />
        </div>
        <p class="note">{t.configNote}</p>
      </Panel>

      <Panel title={t.device} description={state.last_error ?? undefined}>
        <div class="stat-grid">
          <Stat label={t.device} value={state.device_name} />
          <Stat label={t.firmware} value={state.firmware || "—"} />
          <Stat
            label={t.range}
            value={`${state.min_travel.toFixed(2)} – ${state.max_travel.toFixed(2)} ${t.unitMm}`}
          />
          <Stat label={t.step} value={`${state.step.toFixed(2)} ${t.unitMm}`} />
          <Stat label={t.pollingRate} value={rateLabel ? `${rateLabel} Hz` : "—"} tone="primary" />
          <Stat label={t.profile} value={`${state.profile + 1} / ${PROFILE_COUNT}`} tone="primary" />
        </div>
        <div class="btn-row">
          <Button disabled={offline} onClick={() => void run(() => api.refresh())}>
            {t.reload}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
