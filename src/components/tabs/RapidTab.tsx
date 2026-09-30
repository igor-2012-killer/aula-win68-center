import { useMemo, useState } from "preact/hooks";
import { STRINGS, type Lang } from "../../i18n";
import { api } from "../../ipc";
import type { KeyboardState } from "../../types";
import { Button, Panel, Slider, Toggle } from "../ui";

interface Props {
  state: KeyboardState;
  lang: Lang;
  selection: number[];
  run: (label: string, task: () => Promise<unknown>) => Promise<void>;
}

export function RapidTab({ state, lang, selection, run }: Props) {
  const t = STRINGS[lang];
  const offline = !state.connected;
  const none = selection.length === 0;
  const ids = useMemo(() => [...selection], [selection]);

  const first = none ? undefined : state.keys[selection[0]!];

  // Adopt the leading selected key's sensitivities whenever the selection
  // changes, including the very first render after a state refresh.
  const signature = selection.join(",");
  const [adopted, setAdopted] = useState(signature);
  const [press, setPress] = useState(first?.rt_press ?? 0.2);
  const [release, setRelease] = useState(first?.rt_release ?? 0.2);
  if (signature !== adopted) {
    setAdopted(signature);
    setPress(first?.rt_press ?? 0.2);
    setRelease(first?.rt_release ?? 0.2);
  }

  const enabled = first?.mode === "rapidtrigger";

  const apply = (on: boolean, pressMm: number, releaseMm: number) =>
    run(t.saved, () => api.setKeysRapidTrigger(ids, on, pressMm, releaseMm));

  return (
    <div class="columns">
      <Panel title={t.rapidTrigger} description={t.rapidHint}>
        <Toggle
          label={enabled ? t.enabledForSelection : t.disabledForSelection}
          hint={none ? undefined : `${ids.length} ${t.selected}`}
          checked={enabled}
          disabled={offline || none}
          onChange={(next) => void apply(next, press, release)}
        />
        <p class="note">{t.rapidNote}</p>
      </Panel>

      <Panel title={t.sensitivity} description={none ? undefined : ids.join(", ")}>
        <Slider
          label={t.pressSensitivity}
          value={press}
          min={0.01}
          max={2.5}
          step={0.01}
          accent="rose"
          disabled={offline || none}
          onCommit={(value) => {
            setPress(value);
            void apply(true, value, release);
          }}
        />
        <Slider
          label={t.releaseSensitivity}
          value={release}
          min={0.01}
          max={2.5}
          step={0.01}
          accent="rose"
          disabled={offline || none}
          onCommit={(value) => {
            setRelease(value);
            void apply(true, press, value);
          }}
        />
      </Panel>

      <Panel title={t.quickPresets} description={t.quickPresetsHint}>
        <div class="presets-grid">
          {[
            { label: "Valorant", press: 0.2, release: 0.1 },
            { label: "CS2", press: 0.3, release: 0.1 },
            { label: "Apex", press: 0.15, release: 0.15 },
            { label: "Ultra", press: 0.1, release: 0.05 },
          ].map((preset) => (
            <Button
              key={preset.label}
              disabled={offline || none}
              onClick={() => {
                setPress(preset.press);
                setRelease(preset.release);
                void apply(true, preset.press, preset.release);
              }}
            >
              <span class="presets-grid__name">{preset.label}</span>
              <span class="presets-grid__values">
                {preset.press.toFixed(2)} / {preset.release.toFixed(2)}
              </span>
            </Button>
          ))}
        </div>
        <Button
          variant="danger"
          disabled={offline || none}
          onClick={() => void apply(false, press, release)}
        >
          {t.disableOnSelected}
        </Button>
      </Panel>
    </div>
  );
}
