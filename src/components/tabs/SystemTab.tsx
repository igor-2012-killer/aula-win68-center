import { useState } from "preact/hooks";
import { STRINGS, type Lang } from "../../i18n";
import { api } from "../../ipc";
import { POLLING_RATES, PROFILE_COUNT, type KeyboardState } from "../../types";
import { Button, Panel, Row, Segmented, Stat } from "../ui";

interface Props {
  state: KeyboardState;
  lang: Lang;
  run: (label: string, task: () => Promise<unknown>) => Promise<void>;
}

export function SystemTab({ state, lang, run }: Props) {
  const t = STRINGS[lang];
  const offline = !state.connected;
  const [pendingRate, setPendingRate] = useState(false);

  const rateLabel = POLLING_RATES.find(([index]) => index === state.polling_rate)?.[1] ?? 0;

  return (
    <div class="columns">
      <Panel title={t.pollingRate} description={t.pollingHint}>
        <div class="rate-grid">
          {POLLING_RATES.map(([index, hz]) => (
            <button
              key={index}
              type="button"
              class={`rate${index === state.polling_rate ? " is-active" : ""}`}
              disabled={offline || pendingRate}
              onClick={() => {
                setPendingRate(true);
                void run(t.saved, () => api.setPollingRate(index)).finally(() =>
                  setTimeout(() => setPendingRate(false), 1600),
                );
              }}
            >
              <span class="rate__hz">{hz >= 1000 ? `${hz / 1000}k` : hz}</span>
              <span class="rate__unit">Hz</span>
              <span class="rate__delay">
                {(1000 / hz).toFixed(3)} ms
              </span>
            </button>
          ))}
        </div>
        {pendingRate ? <p class="note note--warn">{t.reconnecting}</p> : null}
      </Panel>

      <Panel title={t.profile} description={t.profileHint}>
        <div class="rate-grid rate-grid--profiles">
          {Array.from({ length: PROFILE_COUNT }, (_, index) => (
            <button
              key={index}
              type="button"
              class={`rate${index === state.profile ? " is-active" : ""}`}
              disabled={offline}
              onClick={() => void run(t.saved, () => api.setProfile(index))}
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
            onChange={(mode) => void run(t.saved, () => api.setOsMode(mode === "mac"))}
          />
        </Row>
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
          <Button disabled={offline} onClick={() => void run(t.saved, () => api.refresh())}>
            {t.reload}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
