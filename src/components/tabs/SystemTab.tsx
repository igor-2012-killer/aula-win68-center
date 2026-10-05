import { useRef, useState } from "preact/hooks";
import { STRINGS, type Lang } from "../../i18n";
import { api } from "../../ipc";
import { POLLING_RATES, PROFILE_COUNT, type KeyMode, type KeyboardState } from "../../types";
import { Button, Panel, Row, Segmented, Stat } from "../ui";

interface Props {
  state: KeyboardState;
  lang: Lang;
  run: (task: () => Promise<unknown>) => Promise<boolean>;
  notify: (text: string, tone?: "ok" | "error") => void;
}

/** Bumped whenever the export shape changes. */
const CONFIG_VERSION = 1;

interface ExportedConfig {
  app: "aula-win68-center";
  version: number;
  exported: string;
  global_actuation: number;
  keys: Record<
    string,
    {
      actuation: number;
      rt_press: number;
      rt_release: number;
      press_deadzone: number;
      release_deadzone: number;
      mode: KeyMode;
    }
  >;
  lighting: KeyboardState["lighting"];
  polling_rate: number;
  profile: number;
  mac_layout: boolean;
}

function buildConfig(state: KeyboardState): ExportedConfig {
  const keys: ExportedConfig["keys"] = {};
  for (const [id, settings] of Object.entries(state.keys)) {
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
    URL.revokeObjectURL(url);
  };

  const importConfig = async (file: File) => {
    setImporting(true);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const config = parsed as Partial<ExportedConfig> | null;
      if (
        !config ||
        config.app !== "aula-win68-center" ||
        typeof config.version !== "number" ||
        !config.lighting ||
        !config.keys
      ) {
        notify(t.importInvalid, "error");
        return;
      }

      // Serialised by the backend's job queue; each write is validated and
      // clamped there.
      if (typeof config.global_actuation === "number") {
        await api.setGlobalActuation(config.global_actuation);
      }
      await api.setLighting(config.lighting);
      if (typeof config.polling_rate === "number") {
        await api.setPollingRate(config.polling_rate).catch(() => undefined);
      }
      if (typeof config.profile === "number") {
        await api.setProfile(config.profile).catch(() => undefined);
      }
      if (typeof config.mac_layout === "boolean") {
        await api.setOsMode(config.mac_layout);
      }

      const ids = Object.keys(config.keys)
        .map(Number)
        .filter((id) => state.keys[id] != null);
      const byMode = (mode: string) => ids.filter((id) => config.keys![id]?.mode === mode);

      const singles = byMode("single");
      for (const id of singles) {
        await api.setKeysActuation([id], config.keys![id]!.actuation);
      }
      const rapid = byMode("rapidtrigger");
      if (rapid.length > 0) {
        await api.setKeysRapidTrigger(
          rapid,
          true,
          config.keys![rapid[0]!]!.rt_press,
          config.keys![rapid[0]!]!.rt_release,
        );
        for (const id of rapid.slice(1)) {
          await api.setKeysRapidTrigger(
            [id],
            true,
            config.keys![id]!.rt_press,
            config.keys![id]!.rt_release,
          );
        }
      }
      const deadzones = ids.filter(
        (id) =>
          config.keys![id]!.press_deadzone !== state.keys[id]?.press_deadzone ||
          config.keys![id]!.release_deadzone !== state.keys[id]?.release_deadzone,
      );
      for (const id of deadzones) {
        await api.setKeysDeadzone([id], config.keys![id]!.press_deadzone, config.keys![id]!.release_deadzone);
      }

      await api.refresh();
      notify(t.importDone);
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), "error");
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
                {(1000 / hz).toFixed(3)} ms
              </span>
            </button>
          ))}
        </div>
        {state.reconnecting ? <p class="note note--warn">{t.reconnecting}</p> : null}
      </Panel>

      <Panel title={t.profile} description={t.profileHint}>
        <div class="rate-grid rate-grid--profiles">
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
            value={`${state.min_travel.toFixed(2)} – ${state.max_travel.toFixed(2)} mm`}
          />
          <Stat label={t.step} value={`${state.step.toFixed(2)} mm`} />
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
