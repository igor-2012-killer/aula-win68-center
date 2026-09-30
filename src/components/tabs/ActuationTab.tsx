import { useMemo } from "preact/hooks";
import { PRESET_LABELS, STRINGS, type Lang } from "../../i18n";
import { api } from "../../ipc";
import { MODE_LABEL, type KeyboardState } from "../../types";
import { Button, Chip, Panel, Slider } from "../ui";

interface Props {
  state: KeyboardState;
  lang: Lang;
  selection: number[];
  notify: (text: string, tone?: "ok" | "error") => void;
  run: (label: string, task: () => Promise<unknown>) => Promise<void>;
  selectMany: (ids: number[]) => void;
  clearSelection: () => void;
}

export function ActuationTab({
  state,
  lang,
  selection,
  run,
  selectMany,
  clearSelection,
}: Props) {
  const t = STRINGS[lang];
  const offline = !state.connected;
  const none = selection.length === 0;

  const ids = useMemo(() => [...selection], [selection]);
  const allIds = useMemo(
    () => state.presets.find(([name]) => name === "all")?.[1] ?? [],
    [state.presets],
  );

  const first = none ? undefined : state.keys[selection[0]!];
  const mixed = useMemo(() => {
    if (selection.length < 2 || !first) return false;
    return selection.some((id) => state.keys[id]?.mode !== first.mode);
  }, [selection, first, state.keys]);

  const deadzonePress = first?.press_deadzone ?? state.global_press_deadzone;
  const deadzoneRelease = first?.release_deadzone ?? state.global_release_deadzone;

  return (
    <div class="columns">
      <Panel title={t.globalActuation} description={t.globalActuationHint}>
        <Slider
          label={t.globalActuation}
          value={state.global_actuation}
          min={state.min_travel}
          max={state.max_travel}
          step={state.step}
          disabled={offline}
          onCommit={(value) => void run(t.saved, () => api.setGlobalActuation(value))}
        />
        <p class="note">
          {lang === "ru"
            ? `Диапазон клавиатуры: ${state.min_travel.toFixed(2)} – ${state.max_travel.toFixed(2)} мм, шаг ${state.step.toFixed(2)} мм`
            : `Keyboard range: ${state.min_travel.toFixed(2)} – ${state.max_travel.toFixed(2)} mm, step ${state.step.toFixed(2)} mm`}
        </p>
      </Panel>

      <Panel
        title={t.selection}
        description={`${ids.length} ${t.selected}`}
        actions={
          <Button variant="ghost" disabled={none} onClick={clearSelection}>
            {t.selectNone}
          </Button>
        }
      >
        <div class="chips">
          {state.presets.map(([name, preset]) => (
            <Chip key={name} onClick={() => selectMany(preset)}>
              {PRESET_LABELS[name]?.[lang === "ru" ? 0 : 1] ?? name}
            </Chip>
          ))}
        </div>

        {none ? (
          <p class="empty">{lang === "ru" ? "Клавиши не выбраны" : "No keys selected"}</p>
        ) : (
          <ul class="keylist">
            {selection.slice(0, 14).map((id) => {
              const settings = state.keys[id];
              const key = state.layout.find((k) => k.id === id);
              const value =
                settings?.mode === "rapidtrigger"
                  ? `${settings.rt_press.toFixed(2)} / ${settings.rt_release.toFixed(2)}`
                  : `${settings?.actuation.toFixed(2) ?? "—"} mm`;
              return (
                <li class="keylist__row" key={id}>
                  <span class="keylist__cap">{key?.label ?? id}</span>
                  <span class={`tag mode-${settings?.mode ?? "global"}`}>
                    {MODE_LABEL[settings?.mode ?? "global"]}
                  </span>
                  <span class="keylist__value">{value}</span>
                </li>
              );
            })}
          </ul>
        )}
        {selection.length > 14 ? (
          <p class="muted">+{selection.length - 14}</p>
        ) : null}
      </Panel>

      <Panel title={t.mode} description={none ? undefined : ids.join(", ")}>
        <div class={`mode-pill mode-${mixed ? "mixed" : (first?.mode ?? "global")}`}>
          {mixed ? "—" : MODE_LABEL[first?.mode ?? "global"]}
        </div>

        <Slider
          label={t.selectedActuation}
          value={first?.actuation ?? state.global_actuation}
          min={state.min_travel}
          max={state.max_travel}
          step={state.step}
          disabled={offline || none}
          onCommit={(value) => void run(t.saved, () => api.setKeysActuation(ids, value))}
        />

        <div class="btn-row">
          <Button
            variant="danger"
            disabled={offline || none}
            onClick={() => void run(t.saved, () => api.resetKeys(ids))}
          >
            {t.resetSelected}
          </Button>
          <Button
            variant="danger"
            disabled={offline || allIds.length === 0}
            onClick={() => {
              if (confirm(t.resetAllConfirm)) void run(t.saved, () => api.resetKeys(allIds));
            }}
          >
            {t.resetAll}
          </Button>
        </div>
      </Panel>

      <Panel title={t.deadzone} description={t.deadzoneHint} wide>
        <Slider
          label={t.pressDeadzone}
          value={deadzonePress}
          min={0}
          max={0.5}
          step={0.01}
          disabled={offline || none}
          accent="emerald"
          onCommit={(value) =>
            void run(t.saved, () => api.setKeysDeadzone(ids, value, deadzoneRelease))
          }
        />
        <Slider
          label={t.releaseDeadzone}
          value={deadzoneRelease}
          min={0}
          max={0.5}
          step={0.01}
          disabled={offline || none}
          accent="emerald"
          onCommit={(value) =>
            void run(t.saved, () => api.setKeysDeadzone(ids, deadzonePress, value))
          }
        />
        <p class="note">{t.deadzoneNote}</p>
      </Panel>
    </div>
  );
}
