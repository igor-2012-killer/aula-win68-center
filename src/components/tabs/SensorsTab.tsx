import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { STRINGS, type Lang } from "../../i18n";
import { api } from "../../ipc";
import { SENSOR_COLS, type KeyboardState } from "../../types";
import { Button, Panel, Toggle } from "../ui";

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
  // The decay interval reads the latest frame through a ref: keying the effect
  // on `sensors` re-created the interval ~60 times per second and the 90 ms
  // tick never fired, so peaks never decayed.
  const sensorsRef = useRef(sensors);
  sensorsRef.current = sensors;
  const [decayTick, setDecayTick] = useState(0);

  useEffect(() => {
    if (live) void api.setStreaming(true).catch(() => setLive(false));
    else void api.setStreaming(false).catch(() => undefined);
    return () => {
      void api.setStreaming(false).catch(() => undefined);
    };
  }, [live]);

  // Record peaks as frames arrive…
  useEffect(() => {
    if (!live) return;
    sensors.forEach((um, index) => {
      if (um > (peaks.current.get(index) ?? 0)) peaks.current.set(index, um);
    });
  }, [live, sensors]);

  // …and decay them on a timer that does not depend on the frame rate.
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      peaks.current.forEach((value, key) => {
        const current = sensorsRef.current[key] ?? 0;
        if (value > current) peaks.current.set(key, Math.max(current, value - 20));
        else peaks.current.delete(key);
      });
      setDecayTick((tick) => tick + 1);
    }, 90);
    return () => clearInterval(timer);
  }, [live]);

  const cells = useMemo(
    () =>
      state.layout
        .map((key) => {
          const index = key.row * SENSOR_COLS + key.col;
          const um = sensors[index] ?? 0;
          return { key, index, um, peak: Math.max(peaks.current.get(index) ?? 0, um) };
        })
        .sort((a, b) => a.key.y - b.key.y || a.key.x - b.key.x),
    // `decayTick` re-renders the meters when only the peaks move.
    [state.layout, sensors, decayTick],
  );

  const maxTravel = state.max_travel || 3.4;
  const active = cells.filter((cell) => cell.um > 50).length;
  const channels = cells.length;

  const setStream = (next: boolean) => {
    setPending(true);
    api
      .setStreaming(next)
      .then(() => setLive(next))
      .catch(() => setLive(false))
      .finally(() => setPending(false));
  };

  return (
    <div class="columns columns--wide">
      <Panel
        title={t.sensors}
        description={t.sensorsHint}
        actions={
          <span class="tag tag--live">
            {live ? `${t.streaming}: ${t.on}` : `${t.streaming}: ${t.off}`}
          </span>
        }
      >
        <Toggle
          label={t.streaming}
          hint={t.streamingHint}
          checked={live}
          disabled={!state.connected || pending}
          onChange={setStream}
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
                <span class="meter__track" aria-hidden="true">
                  <span class="meter__fill" style={{ height: `${pct}%` }} />
                  <span class="meter__peak" style={{ bottom: `${peakPct}%` }} />
                </span>
                <span class={`meter__value${mm > 0.05 ? " is-live" : ""}`}>{mm.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title={t.peak} description={t.readout}>
        <p class="note">
          {live
            ? `${active} ${t.activeSensors} · ${channels} ${t.channels}`
            : t.sensorsIdle}
        </p>
        <Button
          variant="ghost"
          disabled={peaks.current.size === 0}
          onClick={() => {
            peaks.current.clear();
            setDecayTick((tick) => tick + 1);
          }}
        >
          {t.peakReset}
        </Button>
      </Panel>
    </div>
  );
}
