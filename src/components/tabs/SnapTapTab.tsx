import { STRINGS, type Lang } from "../../i18n";
import { api } from "../../ipc";
import type { KeyboardState } from "../../types";
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

/**
 * Whether enabling Snap Tap is offered at all.
 *
 * Storage is verified: the frame writes, reads back and the firmware keeps it.
 * Behaviour is not. Two written configurations left the keys inert — one made
 * them emit a non-printable HID code, the other was stored and ignored. The
 * `mode` and `type` fields are not understood, so enabling stays off rather than
 * shipping a control that writes a plausible-looking no-op.
 *
 * Flip to `true` once the resolver semantics are known. See
 * `docs/RESEARCH-NOTES.md`.
 */
export const CAN_ENABLE_SNAP_TAP = false;

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

  // Nothing configured yet.
  if (!configured) {
    const pairFromSelection = selection.length === 2 ? selection : null;
    const keyA = pairFromSelection?.[0] ?? selection[0] ?? 4;
    const keyB = pairFromSelection?.[1] ?? selection[1] ?? 7;
    const valid = keyA !== keyB;

    return (
      <div class="columns">
        <Panel title={t.snapTapTitle} description={t.snapTapHint}>
          <Toggle
            label={t.snapTapOff}
            hint={valid ? `${label(keyA)} / ${label(keyB)}` : t.snapTapNeedsTwoKeys}
            checked={false}
            disabled
            onChange={() => {}}
          />
          <p class="note">{t.snapTapUnavailable}</p>
        </Panel>

        <Panel title={t.snapTapStatus}>
          <p class="note">{t.snapTapUnavailableDetail}</p>
        </Panel>
      </div>
    );
  }

  // Configured. Reading and clearing work and are kept, because clearing is the
  // recovery path for anyone who wrote a pair with an older build.
  //
  // The per-field editors stay disabled: `mode` and `type` are not understood,
  // and a written value is very likely what stopped the keys working.
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
        <p class="note">{t.snapTapUnavailableDetail}</p>
        <Button variant="danger" disabled={offline} onClick={() => void run(t.saved, () => api.clearSnapTap())}>
          {t.snapTapDisable}
        </Button>
      </Panel>

      <Panel title={t.snapTapStatus}>
        <Row label={t.snapTapResolverMode}>
          <Segmented
            options={RESOLVER_MODES}
            value={configured.mode}
            disabled
            onChange={() => {}}
          />
        </Row>
        <Slider
          label={`${t.snapTapThreshold} A`}
          value={configured.value_a}
          min={0}
          max={MAX_RAW}
          step={1}
          accent="amber"
          disabled
          onCommit={() => {}}
        />
        <Slider
          label={`${t.snapTapThreshold} B`}
          value={configured.value_b}
          min={0}
          max={MAX_RAW}
          step={1}
          accent="amber"
          disabled
          onCommit={() => {}}
        />
        <Slider
          label={`${t.snapTapDelay}, ms`}
          value={configured.delay_ms}
          min={0}
          max={MAX_DELAY_MS}
          step={1}
          accent="amber"
          disabled
          onCommit={() => {}}
        />
      </Panel>
    </div>
  );
}
