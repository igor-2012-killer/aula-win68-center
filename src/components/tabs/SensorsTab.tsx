import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { STRINGS, type Lang } from "../../i18n";
import { useTravel, type TravelBus } from "../../store";
import { SENSOR_COLS, type KeyboardState } from "../../types";
import { Button, Panel, Segmented, Toggle } from "../ui";
import { PracticeExercise } from "../PracticeExercise";
import { GameRecording } from "../GameRecording";
import { TosuPanel } from "../TosuPanel";
import type { TosuSnapshot } from "../../tosu-data";
import type { createSessionExport } from "../../session-export";
import { SessionComparison } from "../SessionComparison";
import { TuningWizard } from "../TuningWizard";

interface Props {
  state: KeyboardState;
  lang: Lang;
  travelBus: TravelBus;
  selection: number[];
  selectMany: (ids: number[]) => void;
  onTune: (id: number, target: "actuation" | "rapid") => void;
  recording: boolean;
  setRecording: (recording: boolean) => void;
  active: boolean;
  live: boolean;
  streamPending: boolean;
  streamError: boolean;
  setStream: (enabled: boolean) => void;
  stopStream: () => Promise<boolean>;
}

export function SensorsTab({
  state,
  lang,
  travelBus,
  selection,
  selectMany,
  onTune,
  recording,
  setRecording,
  active,
  live,
  streamPending,
  streamError,
  setStream,
  stopStream,
}: Props) {
  const t = STRINGS[lang];
  const [subtab, setSubtab] = useState<"monitor" | "recording">("monitor");
  const sensors = useTravel(travelBus, active && live);
  const tosuSink = useRef<(snapshot: TosuSnapshot, receivedAt: number) => void>(() => {});
  const [completedSession, setCompletedSession] = useState<ReturnType<typeof createSessionExport> | null>(null);
  const [tosuConnected, setTosuConnected] = useState(false);
  const peaks = useRef(new Map<number, number>());
  const sessionPeaks = useRef(new Map<number, number>());
  const selectionKey = selection.join(",");
  // The decay interval reads the latest frame through a ref: keying the effect
  // on `sensors` re-created the interval ~60 times per second and the 90 ms
  // tick never fired, so peaks never decayed.
  const sensorsRef = useRef(sensors);
  sensorsRef.current = sensors;
  const [decayTick, setDecayTick] = useState(0);

  // Record peaks as frames arrive…
  useEffect(() => {
    if (!live || !active) return;
    sensors.forEach((um, index) => {
      if (um > (peaks.current.get(index) ?? 0)) peaks.current.set(index, um);
      if (um > (sessionPeaks.current.get(index) ?? 0)) sessionPeaks.current.set(index, um);
    });
  }, [live, active, sensors]);

  useEffect(() => {
    sessionPeaks.current.clear();
  }, [selectionKey, live]);

  // …and decay them on a timer that does not depend on the frame rate.
  useEffect(() => {
    if (!live || !active) return;
    const timer = window.setInterval(() => {
      peaks.current.forEach((value, key) => {
        const current = sensorsRef.current[key] ?? 0;
        if (value > current) peaks.current.set(key, Math.max(current, value - 20));
        else peaks.current.delete(key);
      });
      setDecayTick((tick) => tick + 1);
    }, 90);
    return () => clearInterval(timer);
  }, [live, active]);

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
  const activeCount = cells.filter((cell) => cell.um > 50).length;
  const channels = cells.length;
  const zx = [29, 27].filter((id) => state.layout.some((key) => key.id === id));

  return (
    <div class="sensors-shell">
      <div class="sensors-subnav">
        <Segmented
          value={subtab}
          options={[
            ["monitor", t.sensorsSubMonitor],
            ["recording", t.sensorsSubRecording],
          ]}
          disabled={recording}
          onChange={setSubtab}
        />
      </div>

      <div class="columns columns--wide" hidden={subtab !== "monitor"}>
        <Panel
          title={t.sensors}
          description={t.sensorsHint}
          actions={
            <div class="btn-row">
              <span class="tag tag--live">
                {live ? `${t.streaming}: ${t.on}` : `${t.streaming}: ${t.off}`}
              </span>
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
            </div>
          }
        >
          <Toggle
            label={t.streaming}
            hint={t.streamingHint}
            checked={live}
            disabled={!state.connected || streamPending || recording}
            onChange={setStream}
          />
          {streamError ? <p role="alert" class="note">{t.sensorStreamError}</p> : null}
          <p class="note">
            {live
              ? `${activeCount} ${t.activeSensors} · ${channels} ${t.channels}`
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

        <Panel title={t.practiceTitle} description={t.practiceHint}>
          <p class="note">{t.practiceSteps}</p>
          <div class="practice-actions">
            <Button disabled={zx.length !== 2} onClick={() => selectMany(zx)}>{t.practiceSelectZX}</Button>
            <span class="note">{t.practiceAnyKeys}</span>
          </div>
          {selection.length === 0 ? (
            <p class="empty">{t.practiceSelect}</p>
          ) : (
            <div class="practice-keys">
              {selection.map((id) => {
                const key = state.layout.find((item) => item.id === id);
                if (!key) return null;
                const index = key.row * SENSOR_COLS + key.col;
                const current = live ? (sensors[index] ?? 0) : 0;
                const peak = live ? (sessionPeaks.current.get(index) ?? 0) : 0;
                const settings = state.keys[id];
                return (
                  <div class="practice-key" key={id}>
                    <span class="practice-key__label">{key.label}</span>
                    <span class="practice-key__reading">
                      {live ? (current / 1000).toFixed(2) : "—"}
                      <small> {t.unitMm}</small>
                    </span>
                    <span class="practice-key__peak">
                      {t.practicePeak}: {live ? (peak / 1000).toFixed(2) : "—"} {t.unitMm}
                    </span>
                    <span class="practice-key__track" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, (current / 1000 / maxTravel) * 100)}%` }} />
                    </span>
                    {settings ? (
                      <div class="practice-key__settings">
                        <span>
                          {t.practiceMode}:{" "}
                          {settings.mode === "rapidtrigger"
                            ? t.modeRapid
                            : settings.mode === "single"
                              ? t.modeSingle
                              : t.modeGlobal}
                        </span>
                        {settings.mode !== "rapidtrigger" ? (
                          <span>
                            {t.practiceActuation}:{" "}
                            {(settings.mode === "global" ? state.global_actuation : settings.actuation).toFixed(2)}{" "}
                            {t.unitMm}
                          </span>
                        ) : null}
                        {settings.mode === "rapidtrigger" ? (
                          <span>
                            RT: {settings.rt_press.toFixed(2)} / {settings.rt_release.toFixed(2)} {t.unitMm}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <div class="practice-key__actions">
                      <Button disabled={recording} onClick={() => onTune(id, "actuation")}>
                        {t.practiceTuneActuation}
                      </Button>
                      <Button disabled={recording} onClick={() => onTune(id, "rapid")}>
                        {t.practiceTuneRapid}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div class="practice-actions">
            <Button
              disabled={!live || selection.length === 0}
              onClick={() => {
                sessionPeaks.current.clear();
                setDecayTick((tick) => tick + 1);
              }}
            >
              {t.practiceReset}
            </Button>
            <span class="note">{live ? t.practiceLive : t.practiceStart}</span>
          </div>
        </Panel>

        <Panel title={t.practiceGuideTitle} description={t.practiceGuideHint}>
          <ol class="practice-guide">
            <li>{t.practiceGuideObserve}</li>
            <li>{t.practiceGuideActuation}</li>
            <li>{t.practiceGuideRapid}</li>
            <li>{t.practiceGuideCompare}</li>
          </ol>
          <p class="note">{t.practiceGuideLimit}</p>
        </Panel>
      </div>

      <div class="columns columns--wide" hidden={subtab !== "recording"}>
        <TosuPanel
          lang={lang}
          onSnapshot={(snapshot, receivedAt) => tosuSink.current(snapshot, receivedAt)}
          onConnectionChange={setTosuConnected}
        />
        <GameRecording
          state={state}
          lang={lang}
          live={live}
          recording={recording}
          setRecording={setRecording}
          streamPending={streamPending}
          startStream={() => setStream(true)}
          stopStream={stopStream}
          tosuSink={tosuSink}
          tosuConnected={tosuConnected}
          onCompleted={setCompletedSession}
        />
        <SessionComparison
          currentSession={completedSession}
          lang={lang}
          recording={recording}
          onTune={onTune}
          availableKeys={zx}
        />
        <TuningWizard
          currentSession={completedSession}
          recording={recording}
          lang={lang}
          onTune={onTune}
        />
        {active && subtab === "recording" ? (
          <PracticeExercise state={state} lang={lang} sensors={sensors} live={live} />
        ) : null}
      </div>
    </div>
  );
}
