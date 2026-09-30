import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { STRINGS, type Lang } from "../../i18n";
import { api } from "../../ipc";
import { SENSOR_COLS, type KeyboardState } from "../../types";
import { Panel, Toggle } from "../ui";

interface Props {
  state: KeyboardState;
  lang: Lang;
  sensors: number[];
}

export function SensorsTab({ state, lang, sensors }: Props) {
  const t = STRINGS[lang];
  const [live, setLive] = useState(false);
  const [pending, setPending] = useState(false);
  const peaks = useRef(new Map<number, number>());

  useEffect(() => {
    if (live) void api.setStreaming(true).catch(() => setLive(false));
    else void api.setStreaming(false).catch(() => undefined);
    return () => {
      void api.setStreaming(false).catch(() => undefined);
    };
  }, [live]);

  // Decay peaks so a single deep press does not pin the bar forever.
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      peaks.current.forEach((value, key) => {
        const current = sensors[key] ?? 0;
        if (value > current) peaks.current.set(key, Math.max(current, value - 20));
      });
    }, 90);
    return () => clearInterval(timer);
  }, [live, sensors]);

  const cells = useMemo(
    () =>
      state.layout
        .map((key) => {
          const index = key.row * SENSOR_COLS + key.col;
          const um = sensors[index] ?? 0;
          return { key, index, um, peak: Math.max(peaks.current.get(index) ?? 0, um) };
        })
        .sort((a, b) => a.key.y - b.key.y || a.key.x - b.key.x),
    [state.layout, sensors],
  );

  const maxTravel = state.max_travel || 3.4;
  const active = cells.filter((cell) => cell.um > 50).length;
  const channels = cells.length;

  return (
    <div class="columns columns--wide">
      <Panel
        title={t.sensors}
        description={t.sensorsHint}
        actions={
          <span class="tag tag--live">{live ? `${t.streaming}: ON` : `${t.streaming}: OFF`}</span>
        }
      >
        <Toggle
          label={t.streaming}
          hint={t.streamingHint}
          checked={live}
          disabled={!state.connected || pending}
          onChange={(next) => {
            setPending(true);
            setLive(next);
            setTimeout(() => setPending(false), 400);
          }}
        />
        <p class="note">
          {live
            ? `${active} ${t.activeSensors} · ${channels} ${t.channels}`
            : t.sensorsIdle}
        </p>

        <div class="meters">
          {cells.map(({ key, um, peak }) => {
            const mm = um / 1000;
            const pct = Math.min(100, (mm / maxTravel) * 100);
            const peakPct = Math.min(100, (peak / 1000 / maxTravel) * 100);
            return (
              <div class="meter" key={key.id}>
                <span class="meter__label">{key.label}</span>
                <span class="meter__track">
                  <span class="meter__fill" style={{ height: `${pct}%` }} />
                  <span class="meter__peak" style={{ bottom: `${peakPct}%` }} />
                </span>
                <span class={`meter__value${mm > 0.05 ? " is-live" : ""}`}>{mm.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
