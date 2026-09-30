import { STRINGS, type Lang } from "../../i18n";
import { api } from "../../ipc";
import { LIGHT_EFFECTS, SLEEP_OPTIONS, type KeyboardState, type Lighting } from "../../types";
import { Panel, Row, Segmented, Slider, Toggle } from "../ui";

interface Props {
  state: KeyboardState;
  lang: Lang;
  run: (label: string, task: () => Promise<unknown>) => Promise<void>;
}

const SWATCHES = [
  "#ff2d55",
  "#ff6b00",
  "#ffd60a",
  "#32d74b",
  "#00c7be",
  "#0a84ff",
  "#5e5ce6",
  "#bf5af2",
  "#ff375f",
  "#ffffff",
];

export function LightingTab({ state, lang, run }: Props) {
  const t = STRINGS[lang];
  const offline = !state.connected;
  const lighting = state.lighting;

  const apply = (patch: Partial<Lighting>) =>
    run(t.saved, () => api.setLighting({ ...lighting, ...patch }));

  const setColor = (index: number, color: string) => {
    const colors = [...lighting.colors] as Lighting["colors"];
    colors[index] = color;
    void apply({ colors });
  };

  const preview = lighting.colors[0] ?? "#ff0000";

  return (
    <div class="columns">
      <Panel
        title={t.lighting}
        description={t.powered}
        actions={
          <span class="swatch-preview" style={{ background: lighting.enabled ? preview : "#1b2231" }} />
        }
      >
        <Toggle
          label={t.powered}
          checked={lighting.enabled}
          disabled={offline}
          onChange={(enabled) => void apply({ enabled })}
        />

        <Row label={t.effect}>
          <Segmented
            value={lighting.static_effect}
            options={[[0, lang === "ru" ? "Обычный" : "Normal"], [1, lang === "ru" ? "Заливка" : "Fill"]] as const}
            disabled={offline}
            onChange={(static_effect) => void apply({ static_effect })}
          />
        </Row>

        <Row label={t.effectName}>
          <div class="select">
            <select
              value={lighting.effect}
              disabled={offline}
              onChange={(e) => void apply({ effect: Number((e.currentTarget as HTMLSelectElement).value) })}
            >
              {LIGHT_EFFECTS.map(([value, name]) => (
                <option key={value} value={value}>
                  {value}. {name}
                </option>
              ))}
            </select>
            <span class="select__chevron" aria-hidden="true" />
          </div>
        </Row>

        <Slider
          label={t.brightness}
          value={lighting.brightness}
          min={0}
          max={4}
          step={1}
          unit=""
          digits={0}
          disabled={offline}
          onCommit={(brightness) => void apply({ brightness })}
        />
        <Slider
          label={t.speed}
          value={lighting.speed}
          min={0}
          max={4}
          step={1}
          unit=""
          digits={0}
          disabled={offline}
          onCommit={(speed) => void apply({ speed })}
        />
        <Row label={t.direction}>
          <Segmented
            value={lighting.reversed ? 1 : 0}
            options={[
              [0, t.directionLeft],
              [1, t.directionRight],
            ]}
            disabled={offline}
            onChange={(direction) => void apply({ reversed: direction === 1 })}
          />
        </Row>
        <Row label={t.sleepTimer}>
          <div class="select">
            <select
              value={lighting.sleep_minutes}
              disabled={offline}
              onChange={(e) =>
                void apply({ sleep_minutes: Number((e.currentTarget as HTMLSelectElement).value) })
              }
            >
              {SLEEP_OPTIONS.map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
            <span class="select__chevron" aria-hidden="true" />
          </div>
        </Row>
        <Toggle
          label={t.superResponse}
          hint={t.superResponseHint}
          checked={lighting.super_response}
          disabled={offline}
          onChange={(super_response) => void apply({ super_response })}
        />
      </Panel>

      <Panel title={t.palette} description={t.paletteHint}>
        <div class="palette">
          {lighting.colors.map((color, index) => (
            <div class="palette__slot" key={index}>
              <span class="palette__index">{index + 1}</span>
              <div class="palette__swatches">
                {SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    class={`palette__dot${color.toLowerCase() === swatch ? " is-active" : ""}`}
                    style={{ background: swatch }}
                    disabled={offline}
                    title={swatch}
                    onClick={() => setColor(index, swatch)}
                  />
                ))}
              </div>
              <input
                type="color"
                class="palette__picker"
                value={color}
                disabled={offline}
                onChange={(e) => setColor(index, (e.currentTarget as HTMLInputElement).value)}
              />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
