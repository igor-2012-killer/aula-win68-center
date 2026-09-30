import { STRINGS, type Lang } from "../../i18n";
import { api } from "../../ipc";
import type { KeyboardState, SnapTap } from "../../types";
import { Button, Panel, Row, Segmented, Slider, Toggle } from "../ui";

interface Props {
  state: KeyboardState;
  lang: Lang;
  selection: number[];
  run: (label: string, task: () => Promise<unknown>) => Promise<void>;
}

/**
 * Resolver modes offered by the vendor's Snap Tap page.
 *
 * The driver indexes a mode list with this value, so the real count is not known
 * from the bundle. These three are what the UI can offer without guessing; `0` is
 * excluded because it means "off".
 */
const RESOLVER_MODES = [
  [1, "1"],
  [2, "2"],
  [3, "3"],
] as const;

/** The resolver thresholds and the delay are 16-bit fields on the wire. */
const MAX_RAW = 0xffff;
const MAX_DELAY_MS = 500;

export function SnapTapTab({ state, lang, selection, run }: Props) {
  const t = STRINGS[lang];
  const offline = !state.connected;
  const configured = state.snap_tap;

  const label = (id: number) => {
    const def = state.layout.find((k) => k.id === id);
    return def ? `${def.label} (${def.id})` : String(id);
  };

  // Nothing configured yet: offer to create a pair from the current selection.
  if (!configured) {
    const pairFromSelection = selection.length === 2 ? selection : null;
    const keyA = pairFromSelection?.[0] ?? selection[0] ?? 4;
    const keyB = pairFromSelection?.[1] ?? selection[1] ?? 7;
    const valid = keyA !== keyB;

    const enable = (mode: number) =>
      run(t.saved, () =>
        api.setSnapTap({
          key_a: keyA,
          key_b: keyB,
          value_a: 2,
          value_b: 2,
          mode,
          key_type: 0,
          delay_ms: 10,
        }),
      );

    return (
      <div class="columns">
        <Panel title={t.snapTapTitle} description={t.snapTapHint}>
          <Toggle
            label={t.snapTapOff}
            hint={valid ? `${label(keyA)} / ${label(keyB)}` : t.snapTapNeedsTwoKeys}
            checked={false}
            disabled={offline || !valid}
            onChange={() => void enable(1)}
          />
          <Row label={t.snapTapFirstKey}>{label(keyA)}</Row>
          <Row label={t.snapTapSecondKey}>{label(keyB)}</Row>
          <p class="note">{t.snapTapModeWarning}</p>
        </Panel>

        <Panel title={t.snapTapResolverMode}>
          <Row label={t.snapTapResolverMode}>
            <Segmented options={RESOLVER_MODES} value={1} onChange={() => {}} disabled />
          </Row>
          <p class="note">
            {valid ? t.snapTapNote : t.snapTapNeedsTwoKeys}
          </p>
        </Panel>
      </div>
    );
  }

  // Configured. Every control writes through immediately, the same way the Rapid
  // Trigger tab does, so there is no separate "save" button that could apply a
  // different key pair than the one shown.
  const update = (patch: Partial<SnapTap>) =>
    run(t.saved, () => api.setSnapTap({ ...configured, ...patch }));

  return (
    <div class="columns">
      <Panel title={t.snapTapTitle} description={t.snapTapActive}>
        <Toggle
          label={t.snapTapActive}
          hint={`${label(configured.key_a)} / ${label(configured.key_b)}`}
          checked
          disabled={offline}
          onChange={() => void run(t.saved, () => api.clearSnapTap())}
        />
        <Row label={t.snapTapFirstKey}>{label(configured.key_a)}</Row>
        <Row label={t.snapTapSecondKey}>{label(configured.key_b)}</Row>
        <p class="note">{t.snapTapModeWarning}</p>
        <Button variant="danger" disabled={offline} onClick={() => void run(t.saved, () => api.clearSnapTap())}>
          {t.snapTapDisable}
        </Button>
      </Panel>

      <Panel title={t.snapTapResolverMode}>
        <Row label={t.snapTapResolverMode}>
          <Segmented
            options={RESOLVER_MODES}
            value={configured.mode}
            disabled={offline}
            onChange={(next) => void update({ mode: Number(next) })}
          />
        </Row>
        <Slider
          label={`${t.snapTapThreshold} A`}
          value={configured.value_a}
          min={0}
          max={MAX_RAW}
          step={1}
          accent="amber"
          disabled={offline}
          onCommit={(next) => void update({ value_a: next })}
        />
        <Slider
          label={`${t.snapTapThreshold} B`}
          value={configured.value_b}
          min={0}
          max={MAX_RAW}
          step={1}
          accent="amber"
          disabled={offline}
          onCommit={(next) => void update({ value_b: next })}
        />
        <Slider
          label={`${t.snapTapDelay}, ms`}
          value={configured.delay_ms}
          min={0}
          max={MAX_DELAY_MS}
          step={1}
          accent="amber"
          disabled={offline}
          onCommit={(next) => void update({ delay_ms: next })}
        />
        <p class="note">{t.snapTapNote}</p>
      </Panel>
    </div>
  );
}
