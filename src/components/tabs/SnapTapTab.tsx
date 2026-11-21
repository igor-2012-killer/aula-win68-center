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
}

/**
 * Upper bound for the dynamic delay, in milliseconds. The wire field is
 * 16-bit; `MAX_SNAP_TAP_DELAY_MS` in `src-tauri/src/lib.rs` must match. The
 * vendor's own UI sends 0.
 */
const MAX_DELAY_MS = 500;

export function SnapTapTab({ state, lang, selection, run }: Props) {
  const t = STRINGS[lang];
  const offline = !state.connected;
  const configured = state.snap_tap;

  // Two keys selected on the diagram start or replace a pair; otherwise edit
  // the currently configured pair.
  const pair = useMemo<[number, number] | null>(() => {
    if (selection.length >= 2) return [selection[0]!, selection[1]!];
    if (configured) return [configured.key_a, configured.key_b];
    return null;
  }, [configured, selection]);

  const [mode, setMode] = useState(configured?.mode ?? 0);
  const [delay, setDelay] = useState(configured?.delay_ms ?? 0);

  useEffect(() => {
    setMode(configured?.mode ?? 0);
    setDelay(configured?.delay_ms ?? 0);
  }, [configured?.key_a, configured?.key_b, configured?.mode, configured?.delay_ms]);

  const label = (id: number) => {
    const def = state.layout.find((k) => k.id === id);
    return def ? `${def.label} (${def.id})` : String(id);
  };

  const modeOptions = useMemo(
    () =>
      [
        [0, t.snapTapModeLastWon],
        [1, t.snapTapModeFirst],
        [2, t.snapTapModeSecond],
        [3, t.snapTapModeNeutral],
      ] as const,
    [t],
  );

  const valid = pair != null && pair[0] !== pair[1];

  return (
    <div class="columns">
      <Panel title={t.snapTapTitle} description={t.snapTapHint}>
        {pair == null ? (
          <p class="empty">{t.snapTapNeedsTwoKeys}</p>
        ) : (
          <>
            <Row label={t.snapTapFirstKey}>{label(pair[0])}</Row>
            <Row label={t.snapTapSecondKey}>{label(pair[1])}</Row>
            <Row label={t.snapTapResolverMode}>
              <Select
                value={mode}
                options={modeOptions}
                disabled={offline}
                onChange={setMode}
              />
            </Row>
            <Slider
              label={t.snapTapDelay}
              value={delay}
              min={0}
              max={MAX_DELAY_MS}
              step={10}
              unit={t.unitMs}
              digits={0}
              accent="amber"
              disabled={offline}
              onCommit={setDelay}
            />
            <div class="btn-row">
              <Button
                variant="primary"
                disabled={offline || !valid}
                onClick={() =>
                  void run(() =>
                    api.setSnapTap({
                      key_a: pair[0],
                      key_b: pair[1],
                      mode,
                      delay_ms: delay,
                    }),
                  )
                }
              >
                {t.snapTapSave}
              </Button>
              {configured ? (
                <Button
                  variant="danger"
                  disabled={offline}
                  onClick={() => void run(() => api.clearSnapTap())}
                >
                  {t.snapTapDisable}
                </Button>
              ) : null}
            </div>
            {!valid ? <p class="note">{t.snapTapNeedsTwoKeys}</p> : null}
            <p class="note">{t.snapTapReplaceHint}</p>
            <p class="note">{t.snapTapModeWarning}</p>
          </>
        )}
      </Panel>

      <Panel
        title={t.snapTapStatusTitle}
        description={configured ? t.snapTapActive : undefined}
      >
        {configured ? (
          <>
            <Row label={t.snapTapFirstKey}>{label(configured.key_a)}</Row>
            <Row label={t.snapTapSecondKey}>{label(configured.key_b)}</Row>
            <Row label={t.snapTapResolverMode}>
              {modeOptions.find(([value]) => value === configured.mode)?.[1] ??
                `#${configured.mode}`}
            </Row>
            <Row label={t.snapTapDelay}>
              {configured.delay_ms} {t.unitMs}
            </Row>
          </>
        ) : (
          <p class="empty">{t.snapTapOff}</p>
        )}
        <p class="note">{t.snapTapNote}</p>
      </Panel>
    </div>
  );
}
