import { useEffect, useMemo, useState } from "preact/hooks";
import { STRINGS, type Lang } from "../../i18n";
import { api } from "../../ipc";
import type { KeyboardState } from "../../types";
import { Button, Panel, Slider, Toggle } from "../ui";

interface Props {
  state: KeyboardState;
  lang: Lang;
  selection: number[];
  run: (task: () => Promise<unknown>) => Promise<boolean>;
}

export function RapidTab({ state, lang, selection, run }: Props) {
  const t = STRINGS[lang];
  const offline = !state.connected;
  const none = selection.length === 0;
  const ids = useMemo(() => [...selection], [selection]);

  const labelById = useMemo(() => {
    const map = new Map<number, string>();
    for (const def of state.layout) map.set(def.id, def.label);
    return map;
  }, [state.layout]);

  const selectionSummary = useMemo(() => {
    if (none) return undefined;
    const names = selection
      .slice(0, 8)
      .map((id) => labelById.get(id) ?? String(id))
      .join(", ");
    return selection.length > 8 ? `${names} +${selection.length - 8}` : names;
  }, [none, selection, labelById]);

  const first = none ? undefined : state.keys[selection[0]!];
  const signature = `${selection.join(",")}|${first?.rt_press ?? ""}/${first?.rt_release ?? ""}`;
  const [press, setPress] = useState(first?.rt_press ?? 0.2);
  const [release, setRelease] = useState(first?.rt_release ?? 0.2);

  useEffect(() => {
    setPress(first?.rt_press ?? 0.2);
    setRelease(first?.rt_release ?? 0.2);
  }, [signature]);

  const enabledCount = useMemo(
    () => selection.filter((id) => state.keys[id]?.mode === "rapidtrigger").length,
    [selection, state.keys],
  );
  const allEnabled = !none && enabledCount === selection.length;
  const someEnabled = enabledCount > 0 && enabledCount < selection.length;

  const apply = (on: boolean, pressMm: number, releaseMm: number) =>
    run(() => api.setKeysRapidTrigger(ids, on, pressMm, releaseMm));

  return (
    <div class="columns">
      <Panel title={t.rapidTrigger} description={t.rapidHint}>
        <Toggle
          label={
            allEnabled
              ? t.enabledForSelection
              : someEnabled
                ? t.mixedForSelection
                : t.disabledForSelection
          }
          hint={none ? undefined : `${ids.length} ${t.selected}`}
          checked={allEnabled}
          disabled={offline || none}
          onChange={(next) => void apply(next, press, release)}
        />
        <p class="note">{t.rapidNote}</p>
        {enabledCount > 0 ? (
          <div class="btn-row">
            <Button
              variant="danger"
              disabled={offline || none}
              onClick={() => void apply(false, press, release)}
            >
              {t.disableOnSelected}
            </Button>
          </div>
        ) : null}
      </Panel>

      <Panel title={t.sensitivity} description={selectionSummary}>
        <Slider
          label={t.pressSensitivity}
          value={press}
          min={0.01}
          max={2.5}
          step={0.01}
          unit={t.unitMm}
          accent="rose"
          disabled={offline || none}
          onCommit={async (value) => {
            const ok = await apply(true, value, release);
            if (ok) setPress(value);
            return ok;
          }}
        />
        <Slider
          label={t.releaseSensitivity}
          value={release}
          min={0.01}
          max={2.5}
          step={0.01}
          unit={t.unitMm}
          accent="rose"
          disabled={offline || none}
          onCommit={async (value) => {
            const ok = await apply(true, press, value);
            if (ok) setRelease(value);
            return ok;
          }}
        />
        <p class="note">{t.rapidSliderNote}</p>
      </Panel>

      <Panel title={t.quickPresets} description={t.quickPresetsHint} wide>
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
                void apply(true, preset.press, preset.release).then((ok) => {
                  if (ok) {
                    setPress(preset.press);
                    setRelease(preset.release);
                  }
                });
              }}
            >
              <span class="presets-grid__name">{preset.label}</span>
              <span class="presets-grid__values">
                {preset.press.toFixed(2)} / {preset.release.toFixed(2)} {t.unitMm}
              </span>
            </Button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
