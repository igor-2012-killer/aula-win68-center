import { useEffect, useMemo, useState } from "preact/hooks";
import { STRINGS, type Lang } from "../../i18n";
import { api } from "../../ipc";
import type { KeyMode, KeyboardState } from "../../types";
import { Button, Panel, Slider } from "../ui";

interface Props {
  state: KeyboardState;
  lang: Lang;
  selection: number[];
  run: (task: () => Promise<unknown>) => Promise<boolean>;
}

export function ActuationTab({ state, lang, selection, run }: Props) {
  const t = STRINGS[lang];
  const offline = !state.connected;
  const none = selection.length === 0;
  const [confirmResetAll, setConfirmResetAll] = useState(false);

  useEffect(() => {
    setConfirmResetAll(false);
  }, [offline, state.profile]);

  const ids = useMemo(() => [...selection], [selection]);
  const allIds = useMemo(
    () => state.presets.find(([name]) => name === "all")?.[1] ?? [],
    [state.presets],
  );
  const labelById = useMemo(() => {
    const map = new Map<number, string>();
    for (const def of state.layout) map.set(def.id, def.label);
    return map;
  }, [state.layout]);

  const first = none ? undefined : state.keys[selection[0]!];
  const mixed = useMemo(() => {
    if (selection.length < 2 || !first) return false;
    return selection.some((id) => state.keys[id]?.mode !== first.mode);
  }, [selection, first, state.keys]);

  const modeText = (mode: KeyMode) =>
    mode === "rapidtrigger" ? t.modeRapid : mode === "single" ? t.modeSingle : t.modeGlobal;

  const selectedActuation =
    first?.mode === "single" ? first.actuation : state.global_actuation;
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
          unit={t.unitMm}
          disabled={offline}
          onCommit={(value) => run(() => api.setGlobalActuation(value))}
        />
        <p class="note">
          {t.keyboardRangeNote(
            state.min_travel.toFixed(2),
            state.max_travel.toFixed(2),
            state.step.toFixed(2),
          )}
        </p>
        <div class="btn-row">
          {confirmResetAll ? (
            <>
              <Button
                variant="danger"
                disabled={offline || allIds.length === 0}
                onClick={() => {
                  setConfirmResetAll(false);
                  void run(() => api.resetKeys(allIds));
                }}
              >
                {t.confirmResetAll}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmResetAll(false)}>
                {t.cancel}
              </Button>
            </>
          ) : (
            <Button
              variant="danger"
              disabled={offline || allIds.length === 0}
              onClick={() => setConfirmResetAll(true)}
            >
              {t.resetAll}
            </Button>
          )}
        </div>
      </Panel>

      <Panel
        title={t.selectedKeysTitle}
        description={
          none
            ? t.noKeysSelected
            : selection
                .map((id) => labelById.get(id) ?? String(id))
                .slice(0, 8)
                .join(", ") + (selection.length > 8 ? ` +${selection.length - 8}` : "")
        }
      >
        <div class={`mode-pill mode-${mixed ? "mixed" : (first?.mode ?? "global")}`}>
          {mixed ? t.modeMixed : modeText(first?.mode ?? "global")}
        </div>

        <Slider
          label={t.selectedActuation}
          value={selectedActuation}
          min={state.min_travel}
          max={state.max_travel}
          step={state.step}
          unit={t.unitMm}
          disabled={offline || none}
          onCommit={(value) => run(() => api.setKeysActuation(ids, value))}
        />

        <div class="btn-row">
          <Button
            variant="danger"
            disabled={offline || none}
            onClick={() => void run(() => api.resetKeys(ids))}
          >
            {t.resetSelected}
          </Button>
        </div>

        {none ? (
          <p class="empty">{t.noKeysSelected}</p>
        ) : (
          <ul class="keylist">
            {selection.slice(0, 14).map((id) => {
              const settings = state.keys[id];
              const mode = settings?.mode ?? "global";
              const value =
                mode === "rapidtrigger"
                  ? `${settings!.rt_press.toFixed(2)} / ${settings!.rt_release.toFixed(2)} ${t.unitMm}`
                  : `${(mode === "single" ? settings!.actuation : state.global_actuation).toFixed(2)} ${t.unitMm}`;
              return (
                <li class="keylist__row" key={id}>
                  <span class="keylist__cap">{labelById.get(id) ?? id}</span>
                  <span class={`tag mode-${mode}`}>{modeText(mode)}</span>
                  <span class="keylist__value">{value}</span>
                </li>
              );
            })}
          </ul>
        )}
        {selection.length > 14 ? <p class="muted">+{selection.length - 14}</p> : null}
      </Panel>

      <Panel title={t.deadzone} description={t.deadzoneHint} wide>
        <Slider
          label={t.pressDeadzone}
          value={deadzonePress}
          min={0}
          max={0.5}
          step={0.01}
          unit={t.unitMm}
          disabled={offline || none}
          accent="emerald"
          onCommit={(value) => run(() => api.setKeysDeadzone(ids, value, deadzoneRelease))}
        />
        <Slider
          label={t.releaseDeadzone}
          value={deadzoneRelease}
          min={0}
          max={0.5}
          step={0.01}
          unit={t.unitMm}
          disabled={offline || none}
          accent="emerald"
          onCommit={(value) => run(() => api.setKeysDeadzone(ids, deadzonePress, value))}
        />
        <p class="note">{t.deadzoneNote}</p>
      </Panel>
    </div>
  );
}
