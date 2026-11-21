import { useEffect, useRef, useState } from "preact/hooks";
import { api, onTravel, type KeyRecording } from "../ipc";
import type { Lang } from "../i18n";
import { SENSOR_COLS, type KeyboardState } from "../types";
import { Button, Chip, Panel } from "./ui";
import { SENSOR_GAP_MS, reduceTravelSegment, splitTravelSamples, type TravelSample } from "../recording-graph";
import { KeyEventTimeline } from "./KeyEventTimeline";
import type { TosuSnapshot } from "../tosu-data";
import { summarizeTosuFrames, type TosuFrame } from "../capture-analysis";
import { createSessionExport } from "../session-export";
import { tuningSnapshot, type TuningSnapshot } from "../tuning";
import { createPreciseCollector, summarizePrecise, type PreciseRecording } from "../tosu-precise";

type Sample = TravelSample;
type Capture = { started: number; requestStarted: number; keyReady: number; samples: Sample[]; tosuFrames: TosuFrame[]; tosuTruncated: boolean; settings: string; settingsDetail: TuningSnapshot | null; recordingId: string; maxTravel: number; indexes: [number, number]; sensorEnabled: boolean; precise: ReturnType<typeof createPreciseCollector> | null };
type Result = { duration: number; samples: Sample[]; tosuFrames: TosuFrame[]; tosuTruncated: boolean; keyStartWindowMs: number; stopRequestMs: number; settings: string; settingsDetail: TuningSnapshot | null; recordingId: string; maxTravel: number; interrupted: boolean; sensorEnabled: boolean; precise: PreciseRecording | null };
const LIMIT_MS = 180_000;
const LIMIT_SAMPLES = 25_000;

const words = {
  ru: {
    title: "Запись во время игры", hint: "События Z и X и данные osu!",
    intro: "Начните запись, переключитесь в osu! и сыграйте отрывок. Вернитесь в это окно и остановите запись. Пока идёт запись, оставьте вкладку «Датчики» открытой.",
    mode: "Режим записи", light: "Без датчиков", sensorsMode: "С датчиками", lightNote: "По умолчанию: события Z/X и данные tosu без опроса матрицы датчиков и графика хода. Если поток датчиков включён, он остановится перед записью.", sensorsNote: "События Z/X, данные tosu и график хода. Используется постоянный опрос датчиков.", sensorOff: "Датчики не записывались; графика хода нет.", stopFailed: "Не удалось выключить поток датчиков. Запись не начата.",
    preciseTitle: "Нажатия в osu! через tosu", preciseSwitch: "Собирать K1/K2", preciseOn: "Включено", preciseOff: "Выключено", preciseHelp: "Во время записи подключается дополнительный поток tosu. Если появятся лаги, отключите его перед следующей записью.", preciseNeeds: "Для K1/K2 подключите tosu до начала записи.", preciseWait: "Подключение K1/K2…", preciseLive: "Поток K1/K2 подключён", preciseError: "Поток K1/K2 недоступен или прерван. Остальная запись продолжается.", preciseNone: "Нет данных K1/K2. Подключите tosu и включите сбор до записи.", preciseObserved: "Сумма наблюдаемых приростов счётчика", preciseUpdates: "Обновлений", preciseGaps: "Максимальный промежуток", preciseCoverage: "Первый / последний сохранённый снимок после запуска", preciseResets: "Сбросов счётчика", preciseInvalid: "Неподходящих сообщений", preciseTruncated: "Достигнут лимит сохранённых изменений", preciseStartEnd: "Счётчик в первом / последнем снимке", preciseLimit: "Это снимки счётчиков, а не отдельные события. Сбросы, задержки, разрывы и разное время старта/остановки влияют на числа. K1/K2 могут зависеть от назначений и других устройств; они не привязаны автоматически к Z/X. Даже расхождение не доказывает потерянное нажатие и не объясняет промах.",
    start: "Начать запись", stop: "Остановить запись", active: "Идёт запись · максимум 3 минуты", enable: "Включить датчики",
    need: "Для записи подключите клавиатуру; в режиме с датчиками также включите их поток.", loading: "Подключение к потоку…", failed: "Не удалось подписаться на поток датчиков.",
    recorded: "Получено кадров", rate: "Средняя частота получения", duration: "Длительность", seconds: "с", gap: "Самый длинный перерыв между полученными кадрами", ms: "мс",
    none: "Кадры не получены. Запись не показывает движение клавиш.", interrupted: "Запись прервана отключением или остановкой потока; показаны полученные данные.",
    quality: "Время — момент получения кадра приложением, а не точное время измерения. Фоновые задержки и пропущенные кадры могут скрывать движения; большие перерывы делают запись неполной. Нули при ошибках чтения датчиков могут выглядеть как отпускание.",
    limit: "График прорежен для отображения. Он не считает нажатия, пропуски или точность osu! и не определяет оптимальные настройки.",
    chart: "Ход клавиш во времени", top: "Верх графика", bottom: "низ", z: "Z", x: "X", mm: "мм", settings: "Настройки при старте", range: "Диапазон полученных значений",
    gapRule: `Разрывы больше ${SENSOR_GAP_MS} мс выделены на графике. Порог выбран для отображения: он не выявляет все пропущенные кадры.`, gapCount: "Разрывов на графике",
    rawTitle: "События клавиатуры", rawHelp: "Windows Raw Input записывает коды Z/X, полученные от этой клавиатуры, пока запись включена, в том числе во время игры. При переназначении они могут не соответствовать физическим клавишам Z/X. Это не попадания или промахи в osu! Время — момент обработки Windows, а не аппаратная метка. С данными датчиков события не синхронизированы.", rawCounts: "Нажатия / отпускания", rawInterval: "Медианный интервал между нажатиями", rawRepeats: "Повторы удержания исключены", rawTruncated: "Запись ограничена по времени или размеру.", rawError: "Ошибка записи событий", rawWait: "Подготовка записи…",
    sessionTosu: "tosu в этой записи", sessionFrames: "Получено обновлений", sessionNoFrames: "Обновлений tosu во время записи нет. Для следующей попытки подключите tosu до начала записи.", sessionNoPlay: "Данных об оценённых нотах во время записи не получено.", sessionLast: "Последнее наблюдение игры в этой записи", sessionGap: "Максимальный промежуток между обновлениями", sessionCoverage: "Первое / последнее обновление после запроса запуска", sessionMaps: "Карт с известным идентификатором", sessionBackwards: "Обратных переходов времени карты", sessionTruncated: "Достигнут лимит обновлений tosu.", sessionStartup: "Интервал запуска записи клавиш", sessionUncertain: "Время tosu — время получения обновлений приложением, время клавиш — время обработки Windows. Обновления собираются после подтверждения запуска записи клавиш. Интервал запуска ограничивает только неопределённость начала записи; задержка игры, tosu и доставки неизвестна. Эти данные не подтверждают соответствие нажатия конкретной ноте или промаху.", sessionExport: "Сохранить запись в JSON", sessionExportNote: "Файл содержит события Z/X, полученные кадры датчиков, выбранные данные tosu, настройки клавиш и интервалы времени. Сохраняется только по нажатию кнопки.", sessionAccuracy: "Точность", sessionMisses: "Промахи", sessionMap: "Карта",
  },
  en: {
    title: "Record while playing", hint: "Z/X events and osu! data",
    intro: "Start recording, switch to osu! and play a passage. Return here and stop recording. Keep the Sensors tab open while recording.",
    mode: "Recording mode", light: "Without sensors", sensorsMode: "With sensors", lightNote: "Default: Z/X events and tosu data without polling the sensor matrix or a travel chart. An active sensor stream will be stopped before recording.", sensorsNote: "Z/X events, tosu data and a travel chart. Sensors are polled continuously.", sensorOff: "Sensors were not recorded; no travel chart is available.", stopFailed: "Could not stop the sensor stream. Recording did not start.",
    preciseTitle: "osu! key counters via tosu", preciseSwitch: "Collect K1/K2", preciseOn: "On", preciseOff: "Off", preciseHelp: "An additional tosu stream connects during recording. If the game stutters, turn it off before the next recording.", preciseNeeds: "Connect tosu before recording to collect K1/K2.", preciseWait: "Connecting K1/K2…", preciseLive: "K1/K2 stream connected", preciseError: "The K1/K2 stream is unavailable or disconnected. Other recording continues.", preciseNone: "No K1/K2 data. Connect tosu and enable collection before recording.", preciseObserved: "Sum of observed counter increases", preciseUpdates: "Updates", preciseGaps: "Longest gap", preciseCoverage: "First / last saved sample after start", preciseResets: "Counter resets", preciseInvalid: "Invalid messages", preciseTruncated: "The stored change limit was reached", preciseStartEnd: "First / last counter value", preciseLimit: "These are sampled counters, not individual events. Resets, delays, gaps and different start/stop times affect the numbers. K1/K2 can depend on bindings and other devices; they are not automatically mapped to Z/X. A difference does not prove a lost press or explain a miss.",
    start: "Start recording", stop: "Stop recording", active: "Recording · up to 3 minutes", enable: "Enable sensors",
    need: "Connect the keyboard; in sensor mode also enable the sensor stream.", loading: "Connecting to the stream…", failed: "Could not subscribe to the sensor stream.",
    recorded: "Frames received", rate: "Average receive rate", duration: "Duration", seconds: "s", gap: "Longest gap between received frames", ms: "ms",
    none: "No frames received. This recording does not show key movement.", interrupted: "Recording interrupted by disconnection or stream stopping; showing received data.",
    quality: "Time is when the app received a frame, not the exact measurement time. Background delays and missing frames may hide movement; large gaps make the recording incomplete. Sensor read errors may appear as zeroes.",
    limit: "The graph is downsampled for display. It does not count presses, misses or osu! accuracy, or determine optimal settings.",
    chart: "Key travel over time", top: "Chart top", bottom: "bottom", z: "Z", x: "X", mm: "mm", settings: "Settings at start", range: "Range of received values",
    gapRule: `Gaps over ${SENSOR_GAP_MS} ms are highlighted. This display threshold does not detect all missing frames.`, gapCount: "Gaps on graph",
    rawTitle: "Keyboard events", rawHelp: "Windows Raw Input records Z/X codes received from this keyboard while recording is active, including during play. Remapping can make them differ from physical Z/X keys. These are not osu! hits or misses. Times are Windows processing times, not hardware timestamps. Events are not synchronized with sensor data.", rawCounts: "Presses / releases", rawInterval: "Median time between presses", rawRepeats: "Held-key repeats excluded", rawTruncated: "Recording reached its time or size limit.", rawError: "Event recording error", rawWait: "Preparing recording…",
    sessionTosu: "tosu in this recording", sessionFrames: "Updates received", sessionNoFrames: "No tosu updates were received during recording. Connect tosu before the next attempt.", sessionNoPlay: "No data on judged notes was received during recording.", sessionLast: "Last game observation in this recording", sessionGap: "Longest interval between updates", sessionCoverage: "First / last update after start request", sessionMaps: "Maps with known identifier", sessionBackwards: "Backward map-time transitions", sessionTruncated: "The tosu update limit was reached.", sessionStartup: "Key recording startup interval", sessionUncertain: "tosu times are when the app receives updates; key times are when Windows messages are processed. Updates are collected after key recording starts. The startup interval bounds only the recording start uncertainty; game, tosu and delivery latency are unknown. These data do not establish that a press corresponds to a particular note or miss.", sessionExport: "Save recording as JSON", sessionExportNote: "The file contains Z/X events, received sensor frames, selected tosu data, key settings and timing intervals. It is saved only when you press the button.", sessionAccuracy: "Accuracy", sessionMisses: "Misses", sessionMap: "Map",
  },
} as const;

function settingsAtStart(state: KeyboardState): string {
  return ([29, 27] as const).map((id, i) => {
    const key = state.keys[id];
    if (!key) return `${i ? "X" : "Z"}: —`;
    const value = key.mode === "rapidtrigger"
      ? `RT ${key.rt_press.toFixed(2)} / ${key.rt_release.toFixed(2)} mm`
      : `${key.mode} ${(key.mode === "global" ? state.global_actuation : key.actuation).toFixed(2)} mm`;
    return `${i ? "X" : "Z"}: ${value}`;
  }).join(" · ");
}

export function GameRecording({ state, lang, live, recording, setRecording, streamPending, startStream, stopStream, tosuSink, tosuConnected, onCompleted }: {
  state: KeyboardState; lang: Lang; live: boolean; recording: boolean; setRecording: (value: boolean) => void;
  streamPending: boolean; startStream: () => void; stopStream: () => Promise<boolean>;
  tosuSink: { current: (snapshot: TosuSnapshot, receivedAt: number) => void };
  tosuConnected: boolean;
  onCompleted: (session: ReturnType<typeof createSessionExport>) => void;
}) {
  const t = words[lang];
  const [subscription, setSubscription] = useState<"loading" | "ready" | "error">("loading");
  const [result, setResult] = useState<Result | null>(null);
  const [keyResult, setKeyResult] = useState<KeyRecording | null>(null);
  const [stopResponseMs, setStopResponseMs] = useState<number | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sensorEnabled, setSensorEnabled] = useState(false);
  const [preciseEnabled, setPreciseEnabled] = useState(true);
  const [preciseStatus, setPreciseStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const preciseSocket = useRef<WebSocket | null>(null);
  const activeRaw = useRef(false);
  const mounted = useRef(true);
  const available = useRef({ connected: state.connected, live });
  available.current = { connected: state.connected, live };
  const capture = useRef<Capture | null>(null);
  const finishRef = useRef<(interrupted: boolean) => void>(() => undefined);
  finishRef.current = (interrupted) => {
    const current = capture.current;
    if (!current) return;
    capture.current = null;
    const precise = current.precise?.finish() ?? null;
    preciseSocket.current?.close();
    preciseSocket.current = null;
    setPreciseStatus("idle");
    const stopRequest = performance.now();
    const finished = { duration: Math.min(stopRequest - current.started, LIMIT_MS), samples: current.samples, tosuFrames: current.tosuFrames, tosuTruncated: current.tosuTruncated, keyStartWindowMs: current.keyReady - current.requestStarted, stopRequestMs: stopRequest - current.requestStarted, settings: current.settings, settingsDetail: current.settingsDetail, recordingId: current.recordingId, maxTravel: current.maxTravel, interrupted, sensorEnabled: current.sensorEnabled, precise };
    setResult(finished);
    setPending(true);
    if (activeRaw.current) {
      activeRaw.current = false;
      void api.stopKeyRecording().then((keyboard) => {
        if (!mounted.current) return;
        const stopResponse = performance.now() - current.requestStarted;
        setKeyResult(keyboard);
        setStopResponseMs(stopResponse);
        onCompleted(createSessionExport({ keyStartWindowMs: finished.keyStartWindowMs, stopRequestMs: finished.stopRequestMs, stopResponseMs: stopResponse, settings: finished.settings, settingsDetail: finished.settingsDetail ?? undefined, recordingId: finished.recordingId, sensor: { durationMs: finished.duration, maxTravelMm: finished.maxTravel, interrupted: finished.interrupted, samples: finished.samples, enabled: finished.sensorEnabled }, keyboard, tosu: { truncated: finished.tosuTruncated, frames: finished.tosuFrames }, precise: finished.precise ?? undefined }));
      }).catch((e: unknown) => {
        if (mounted.current) setRawError(String(e));
      }).finally(() => {
        if (mounted.current) {
          setRecording(false);
          setPending(false);
        }
      });
    } else { setRecording(false); setPending(false); }
  };

  useEffect(() => {
    tosuSink.current = (snapshot, receivedAt) => {
      const current = capture.current;
      if (!current) return;
      if (receivedAt - current.started >= LIMIT_MS) { finishRef.current(false); return; }
      if (current.tosuFrames.length >= LIMIT_SAMPLES) { current.tosuTruncated = true; return; }
      current.tosuFrames.push({ receivedMs: receivedAt - current.requestStarted, data: snapshot });
    };
    return () => { tosuSink.current = () => {}; };
  }, [tosuSink]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    onTravel((frame) => {
      const current = capture.current;
      if (!current || !current.sensorEnabled) return;
      const elapsed = performance.now() - current.started;
      if (elapsed >= LIMIT_MS || current.samples.length >= LIMIT_SAMPLES) { finishRef.current(false); return; }
      const [z, x] = current.indexes.map((index) => frame[index]);
      if (typeof z !== "number" || typeof x !== "number" || !Number.isFinite(z) || !Number.isFinite(x)) return;
      current.samples.push({ time: elapsed, z, x });
    }).then((off) => {
      if (disposed) off();
      else { unlisten = off; setSubscription("ready"); }
    }).catch(() => { if (!disposed) setSubscription("error"); });
    return () => { disposed = true; mounted.current = false; unlisten?.(); capture.current = null; preciseSocket.current?.close(); preciseSocket.current = null; if (activeRaw.current) { activeRaw.current = false; void api.stopKeyRecording().catch(() => undefined); } };
  }, []);

  useEffect(() => {
    if (tosuConnected || !capture.current?.precise || !preciseSocket.current) return;
    capture.current.precise.setStatus("disconnected");
    preciseSocket.current.close();
    preciseSocket.current = null;
    setPreciseStatus("error");
  }, [tosuConnected]);

  useEffect(() => {
    if (capture.current && (!state.connected || (capture.current.sensorEnabled && !live))) finishRef.current(true);
  }, [state.connected, live]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setTimeout(() => finishRef.current(false), LIMIT_MS);
    return () => clearTimeout(timer);
  }, [recording]);

  const start = async () => {
    const z = state.layout.find((key) => key.id === 29);
    const x = state.layout.find((key) => key.id === 27);
    if (!z || !x || !state.connected || (sensorEnabled && (!live || subscription !== "ready"))) return;
    setPending(true);
    setRecording(true);
    setRawError(null);
    const settingsDetail = tuningSnapshot(state);
    const recordingId = crypto.randomUUID();
    try {
      if (!sensorEnabled && !(await stopStream())) throw new Error(t.stopFailed);
      if (!mounted.current || !available.current.connected) { if (mounted.current) setRecording(false); return; }
      const requestStarted = performance.now();
      await api.startKeyRecording();
      const keyReady = performance.now();
      activeRaw.current = true;
      if (!mounted.current || !available.current.connected || (sensorEnabled && !available.current.live)) {
        activeRaw.current = false;
        await api.stopKeyRecording();
        if (mounted.current) setRecording(false);
        return;
      }
      const current: Capture = { started: keyReady, requestStarted, keyReady, samples: [], tosuFrames: [], tosuTruncated: false, settings: settingsAtStart(state), settingsDetail, recordingId, maxTravel: state.max_travel || 3.4, indexes: [z.row * SENSOR_COLS + z.col, x.row * SENSOR_COLS + x.col], sensorEnabled, precise: preciseEnabled ? createPreciseCollector() : null };
      capture.current = current;
      if (current.precise) {
        const collector = current.precise;
        if (!tosuConnected) { collector.setStatus("unavailable"); setPreciseStatus("error"); }
        else {
          setPreciseStatus("connecting");
          try {
            const ws = new WebSocket("ws://127.0.0.1:24050/websocket/v2/precise");
            let opened = false;
            preciseSocket.current = ws;
            ws.onopen = () => {
              if (capture.current === current && preciseSocket.current === ws) {
                opened = true;
                collector.setStatus("connected");
                setPreciseStatus("connected");
              }
            };
            ws.onmessage = (event) => {
              if (capture.current !== current) return;
              let value: unknown = null;
              try { if (typeof event.data === "string") value = JSON.parse(event.data) as unknown; } catch { /* record invalid message */ }
              collector.receive(value, performance.now() - current.requestStarted);
            };
            const failed = () => {
              if (capture.current !== current || preciseSocket.current !== ws) return;
              collector.setStatus(opened ? "disconnected" : "unavailable");
              preciseSocket.current = null;
              setPreciseStatus("error");
            };
            ws.onerror = failed;
            ws.onclose = failed;
          } catch { collector.setStatus("unavailable"); setPreciseStatus("error"); }
        }
      } else setPreciseStatus("idle");
      setResult(null);
      setKeyResult(null);
      setStopResponseMs(null);
      setRecording(true);
    } catch (e) { if (mounted.current) { setRawError(String(e)); setRecording(false); } }
    finally { if (mounted.current) setPending(false); }
  };

  const samples = result?.samples ?? [];
  const tosuSummary = summarizeTosuFrames(result?.tosuFrames ?? []);
  const precise = result?.precise ?? null;
  const preciseSummary = precise ? summarizePrecise(precise) : null;
  const exportSession = () => {
    if (!result || !keyResult || stopResponseMs === null) return;
    const file = createSessionExport({
      keyStartWindowMs: result.keyStartWindowMs,
      stopRequestMs: result.stopRequestMs,
      stopResponseMs,
      settings: result.settings,
      settingsDetail: result.settingsDetail ?? undefined,
      recordingId: result.recordingId,
      sensor: { durationMs: result.duration, maxTravelMm: result.maxTravel, interrupted: result.interrupted, samples: result.samples, enabled: result.sensorEnabled },
      keyboard: keyResult,
      tosu: { truncated: result.tosuTruncated, frames: result.tosuFrames },
      precise: result.precise ?? undefined,
    });
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const link = document.createElement("a"); link.href = url; link.download = `aula-osu-session-${stamp}.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  let maxGap = 0;
  if (result) {
    let previous = 0;
    for (const sample of samples) { maxGap = Math.max(maxGap, sample.time - previous); previous = sample.time; }
    maxGap = Math.max(maxGap, result.duration - previous);
  }
  const segments = splitTravelSamples(samples);
  const bucketSize = Math.max(1, Math.ceil(samples.length / 1000));
  const reduced = segments.map((segment) => reduceTravelSegment(segment, bucketSize));
  const xPosition = (time: number) => time / Math.max(1, result?.duration ?? 1) * 1000;
  const yPosition = (value: number) => 100 - Math.min(100, Math.max(0, value / 1000 / (result?.maxTravel || 3.4) * 100));
  const path = (segment: Sample[], key: "z" | "x") => segment.map((sample) => `${xPosition(sample.time).toFixed(1)},${yPosition(sample[key]).toFixed(1)}`).join(" ");
  const range = (key: "z" | "x") => {
    let min = Infinity, max = -Infinity;
    for (const sample of samples) { min = Math.min(min, sample[key]); max = Math.max(max, sample[key]); }
    return `${(min / 1000).toFixed(2)}–${(max / 1000).toFixed(2)} ${t.mm}`;
  };
  const interval = (key: "Z" | "X") => {
    const times = (keyResult?.events ?? []).filter((event) => event.key === key && event.down).map((event) => event.elapsed_us);
    const gaps = times.slice(1).map((time, index) => time - times[index]!).sort((a, b) => a - b);
    if (!gaps.length) return "—";
    const middle = Math.floor(gaps.length / 2);
    const median = gaps.length % 2 ? gaps[middle]! : (gaps[middle - 1]! + gaps[middle]!) / 2;
    return `${(median / 1000).toFixed(1)} ${t.ms}`;
  };

  return (
    <Panel title={t.title} description={t.hint}>
      <p class="note">{t.intro}</p>
      <div class="tuning-field">
        <strong>{t.mode}</strong>
        <div class="practice-actions">
          <Chip active={!sensorEnabled} disabled={recording || pending} onClick={() => setSensorEnabled(false)}>{t.light}</Chip>
          <Chip active={sensorEnabled} disabled={recording || pending} onClick={() => setSensorEnabled(true)}>{t.sensorsMode}</Chip>
        </div>
        <span class="note">{sensorEnabled ? t.sensorsNote : t.lightNote}</span>
      </div>
      <div class="practice-actions">
        <span>{t.preciseSwitch}</span>
        <Chip active={preciseEnabled} disabled={recording || pending} onClick={() => setPreciseEnabled((value) => !value)}>{preciseEnabled ? t.preciseOn : t.preciseOff}</Chip>
        <span class="note">{t.preciseHelp}</span>
      </div>
      {preciseEnabled && !tosuConnected && !recording ? <p class="note">{t.preciseNeeds}</p> : null}
      {recording && preciseStatus !== "idle" ? <p class="note" role="status">{preciseStatus === "connecting" ? t.preciseWait : preciseStatus === "connected" ? t.preciseLive : t.preciseError}</p> : null}
      <div class="practice-actions">
        {sensorEnabled && !live ? <Button disabled={!state.connected || streamPending || recording} onClick={startStream}>{t.enable}</Button> : null}
        {recording ? <Button disabled={pending} onClick={() => finishRef.current(false)}>{t.stop}</Button> : <Button variant="primary" disabled={pending || streamPending || !state.connected || (sensorEnabled && (!live || subscription !== "ready")) || !state.layout.some((k) => k.id === 29) || !state.layout.some((k) => k.id === 27)} onClick={() => void start()}>{t.start}</Button>}
        <span class="note" role="status">{pending ? t.rawWait : recording ? t.active : sensorEnabled && subscription === "error" ? t.failed : sensorEnabled && subscription === "loading" ? t.loading : !state.connected || (sensorEnabled && !live) ? t.need : ""}</span>
      </div>
      <p class="note">{t.rawHelp}</p>
      {rawError ? <p role="alert">{t.rawError}: {rawError}</p> : null}
      {keyResult ? <div class="recording-result"><strong>{t.rawTitle}</strong><div class="recording-stats">{(["Z", "X"] as const).map((key) => <span key={key}>{key} · {t.rawCounts}: <strong>{keyResult.events.filter((e) => e.key === key && e.down).length} / {keyResult.events.filter((e) => e.key === key && !e.down).length}</strong> · {t.rawInterval}: <strong>{interval(key)}</strong></span>)}</div><p class="note">{t.rawRepeats}: {keyResult.repeats}{keyResult.truncated ? ` · ${t.rawTruncated}` : ""}</p></div> : null}
      {result ? <div class="recording-result">
        <strong>{t.preciseTitle}</strong>
        {!precise || !preciseSummary?.first || !preciseSummary.last ? <p class="note">{t.preciseNone}</p> : <>
          {precise.status !== "connected" ? <p class="tuning-warning">{t.preciseError}</p> : null}
          <div class="recording-stats">
            <span>{t.preciseUpdates}: <strong>{precise.updates}</strong></span>
            <span>{t.preciseCoverage}: <strong>{(preciseSummary.first.receivedMs / 1000).toFixed(2)} / {(preciseSummary.last.receivedMs / 1000).toFixed(2)} {t.seconds}</strong></span>
            <span>{t.preciseGaps}: <strong>{precise.maxGapMs.toFixed(0)} {t.ms}</strong></span>
            <span>{t.preciseInvalid}: <strong>{precise.invalid}</strong></span>
          </div>
          {(["k1", "k2"] as const).map((key) => <div key={key} class="recording-stats">
            <span>{key.toUpperCase()} · {t.preciseObserved}: <strong>{preciseSummary.total[key]}</strong></span>
            <span>{t.preciseStartEnd}: <strong>{preciseSummary.first![key].count} / {preciseSummary.last![key].count}</strong></span>
            <span>{t.preciseResets}: <strong>{preciseSummary.resets[key]}</strong></span>
          </div>)}
          {precise.truncated ? <p class="tuning-warning">{t.preciseTruncated}</p> : null}
          <p class="note">{t.preciseLimit}</p>
        </>}
      </div> : null}
      {keyResult ? <KeyEventTimeline events={keyResult.events} duration_us={keyResult.duration_us} lang={lang} /> : null}
      {result ? <div class="recording-result">
        <strong>{t.sessionTosu}</strong>
        {tosuSummary.count === 0 ? <p class="note">{t.sessionNoFrames}</p> : <>
          <div class="recording-stats"><span>{t.sessionFrames}: <strong>{tosuSummary.count}</strong></span><span>{t.sessionCoverage}: <strong>{(result.tosuFrames[0]!.receivedMs / 1000).toFixed(1)} / {(result.tosuFrames[result.tosuFrames.length - 1]!.receivedMs / 1000).toFixed(1)} {t.seconds}</strong></span><span>{t.sessionGap}: <strong>{tosuSummary.count < 2 ? "—" : `${tosuSummary.maxGapMs.toFixed(0)} ${t.ms}`}</strong></span><span>{t.sessionMaps}: <strong>{tosuSummary.distinctMaps}</strong></span><span>{t.sessionBackwards}: <strong>{tosuSummary.backwards}</strong></span></div>
          {tosuSummary.lastPlay ? <div class="recording-stats"><span>{t.sessionLast}: <strong>{tosuSummary.lastPlay.data.map ?? "—"}</strong></span><span>{t.sessionAccuracy}: <strong>{tosuSummary.lastPlay.data.accuracy === null ? "—" : `${tosuSummary.lastPlay.data.accuracy.toFixed(2)}%`}</strong></span><span>{t.sessionMisses}: <strong>{tosuSummary.lastPlay.data.misses ?? "—"}</strong></span></div> : <p class="note">{t.sessionNoPlay}</p>}
          {result.tosuTruncated ? <p class="note">{t.sessionTruncated}</p> : null}
        </>}
        <p class="note">{t.sessionStartup}: 0–{result.keyStartWindowMs.toFixed(1)} {t.ms}. {t.sessionUncertain}</p>
        <div class="practice-actions"><Button disabled={!keyResult || stopResponseMs === null} onClick={exportSession}>{t.sessionExport}</Button><span class="note">{t.sessionExportNote}</span></div>
      </div> : null}
      {result ? (
        <div class="recording-result">
          {result.interrupted ? <p class="note" role="status">{t.interrupted}</p> : null}
          <div class="recording-stats">
            <span>{t.duration}: <strong>{(result.duration / 1000).toFixed(1)} {t.seconds}</strong></span>
            {result.sensorEnabled ? <>
            <span>{t.recorded}: <strong>{samples.length}</strong></span>
            <span>{t.rate}: <strong>{(samples.length / Math.max(result.duration / 1000, 0.001)).toFixed(1)} Hz</strong></span>
            <span>{t.gap}: <strong>{Math.round(maxGap)} {t.ms}</strong></span>
            <span>{t.gapCount}: <strong>{Math.max(0, segments.length - 1)}</strong></span>
            </> : null}
          </div>
          <p class="note">{t.settings}: {result.settings}</p>
          {!result.sensorEnabled ? <p class="note">{t.sensorOff}</p> : samples.length === 0 ? <p class="note">{t.none}</p> : <>
            <div class="recording-legend"><span><i class="recording-swatch recording-swatch--z" /> Z · {t.range}: {range("z")}</span><span><i class="recording-swatch recording-swatch--x" /> X · {t.range}: {range("x")}</span></div>
            <p class="note">{t.top}: {result.maxTravel.toFixed(2)} {t.mm} · {t.bottom}: 0 {t.mm}</p>
            <div class="recording-chart" role="img" aria-label={`${t.chart}: Z, X; 0–${result.maxTravel.toFixed(2)} ${t.mm}, 0–${(result.duration / 1000).toFixed(1)} ${t.seconds}`}>
              <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
                {segments.slice(1).map((segment, index) => {
                  const from = xPosition(segments[index]![segments[index]!.length - 1]!.time);
                  const to = xPosition(segment[0]!.time);
                  return <rect key={index} class="recording-gap" x={from} y="0" width={Math.max(0, to - from)} height="100" />;
                })}
                {reduced.flatMap((segment, index) => (["z", "x"] as const).map((key) => segment.length === 1
                  ? <circle key={`${index}-${key}`} class={`recording-point recording-line--${key}`} cx={xPosition(segment[0]!.time)} cy={yPosition(segment[0]![key])} r="1.5" />
                  : <polyline key={`${index}-${key}`} class={`recording-line recording-line--${key}`} points={path(segment, key)} />))}
              </svg>
            </div>
            <div class="recording-axis"><span>0 {t.seconds}</span><span>{(result.duration / 1000).toFixed(1)} {t.seconds}</span></div>
            <p class="note">{t.gapRule}</p>
          </>}
        </div>
      ) : null}
      {result?.sensorEnabled ? <><p class="note">{t.quality}</p><p class="note">{t.limit}</p></> : null}
    </Panel>
  );
}
