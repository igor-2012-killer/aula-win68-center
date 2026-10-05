import { useEffect, useMemo, useState } from "preact/hooks";
import { STRINGS, type Lang } from "../../i18n";
import { api } from "../../ipc";
import type { KeyboardState } from "../../types";
import { Button, Panel, Row, Select, Slider } from "../ui";

interface Props {
  state: KeyboardState;
  lang: Lang;
  selection: number[];
  run: (task: () => Promise<unknown>) => Promise<boolean>;
  notify: (text: string, tone?: "ok" | "error") => void;
}

/**
 * Upper bound for the hold threshold, in milliseconds. The wire field is one
 * byte in 10 ms units. `MAX_MOD_TAP_DELAY_MS` in `src-tauri/src/lib.rs` must
 * match, otherwise the slider and the backend disagree.
 */
const MAX_DELAY_MS = 2550;
/** The vendor driver's own default. */
const DEFAULT_DELAY_MS = 200;

export function ModTapTab({ state, lang, selection, run }: Props) {
  const t = STRINGS[lang];
  const offline = !state.connected;

  const keyId = selection[0] ?? null;
  const assignment = useMemo(
    () => state.mod_tap.find((a) => a.key_id === keyId) ?? null,
    [state.mod_tap, keyId],
  );

  const [holdKey, setHoldKey] = useState(0);
  const [tapKey, setTapKey] = useState(0);
  const [delay, setDelay] = useState(DEFAULT_DELAY_MS);

  // Follow the assignment of the selected key; keep the draft when the user is
  // editing a key that has none yet.
  useEffect(() => {
    setHoldKey(assignment?.hold_key ?? 0);
    setTapKey(assignment?.tap_key ?? 0);
    setDelay(assignment?.delay_ms ?? DEFAULT_DELAY_MS);
  }, [assignment, keyId]);

  const keyOptions = useMemo(() => {
    const options: (readonly [number, string])[] = [[0, t.modTapNoOutput]];
    for (const def of state.layout) options.push([def.id, `${def.label} (${def.id})`]);
    return options;
  }, [state.layout, t]);

  const label = (id: number) => {
    const def = state.layout.find((k) => k.id === id);
    return def ? `${def.label} (${def.id})` : String(id);
  };

  const assignable = keyId != null && (holdKey !== 0 || tapKey !== 0);

  return (
    <div class="columns">
      <Panel title={t.modTapTitle} description={t.modTapHint}>
        {keyId == null ? (
          <p class="empty">{t.modTapNoneSelected}</p>
        ) : (
          <>
            <Row label={t.key}>
              <span class="tag mode-single">{label(keyId)}</span>
            </Row>
            <Row label={t.modTapHold}>
              <Select value={holdKey} options={keyOptions} disabled={offline} onChange={setHoldKey} />
            </Row>
            <Row label={t.modTapTap}>
              <Select value={tapKey} options={keyOptions} disabled={offline} onChange={setTapKey} />
            </Row>
            <Slider
              label={t.modTapDelay}
              value={delay}
              min={10}
              max={MAX_DELAY_MS}
              step={10}
              unit="ms"
              digits={0}
              accent="amber"
              disabled={offline}
              onCommit={setDelay}
            />
            <div class="btn-row">
              <Button
                variant="primary"
                disabled={offline || !assignable}
                onClick={() =>
                  void run(() =>
                    api.setModTap({ key_id: keyId, hold_key: holdKey, tap_key: tapKey, delay_ms: delay }),
                  )
                }
              >
                {t.modTapApply}
              </Button>
              <Button
                variant="danger"
                disabled={offline}
                onClick={() => void run(() => api.clearModTap(keyId))}
              >
                {t.modTapClear}
              </Button>
            </div>
            <p class="note">
              {assignment ? "" : `${t.modTapNotAssigned}. `}
              {t.modTapNote}
            </p>
            <p class="note">{t.modTapClearNote}</p>
          </>
        )}
      </Panel>

      <Panel
        title={t.modTapAssigned}
        description={`${state.mod_tap.length}`}
        actions={
          <Button variant="ghost" disabled={offline} onClick={() => void run(() => api.scanModTap([]))}>
            {t.modTapScan}
          </Button>
        }
      >
        {state.mod_tap.length === 0 ? (
          <p class="empty">{t.modTapNotAssigned}</p>
        ) : (
          <ul class="keylist">
            {state.mod_tap.map((a) => (
              <li class="keylist__row" key={a.key_id}>
                <span class="keylist__cap">{label(a.key_id)}</span>
                <span class="keylist__value">
                  {t.modTapHold}: {a.hold_key ? label(a.hold_key) : t.modTapNoOutput} ·{" "}
                  {t.modTapTap}: {a.tap_key ? label(a.tap_key) : t.modTapNoOutput} ·{" "}
                  {a.delay_ms} ms
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
