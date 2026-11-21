import { useEffect, useMemo, useState } from "preact/hooks";
import type { Lang } from "../i18n";
import type { RecordedKeyEvent } from "../ipc";
import { Slider } from "./ui";

interface Props {
  events: RecordedKeyEvent[];
  duration_us: number;
  lang: Lang;
}

const labels = {
  ru: {
    title: "События по времени",
    description: "Выберите участок записи. Каждая отметка — отдельное событие, полученное Windows.",
    window: "Длина участка",
    start: "Начало участка",
    seconds: "с",
    down: "нажатие",
    up: "отпускание",
    noEvents: "На этом участке событий нет.",
    count: "Событий на участке",
    list: "Список событий",
    limited: "Показаны первые 100 событий участка; все отметки остаются на графике.",
    warning: "Время отсчитывается от запуска записи и фиксируется при обработке события приложением. Это не аппаратная метка и не оценка точности или промахов в osu!. Данные датчиков имеют отдельную временную шкалу. Удержание, начатое до записи или продолженное после неё, может не иметь пары событий.",
  },
  en: {
    title: "Events over time",
    description: "Select a section of the recording. Each mark is a separate event received by Windows.",
    window: "Window length",
    start: "Window start",
    seconds: "s",
    down: "press",
    up: "release",
    noEvents: "No events in this section.",
    count: "Events in section",
    list: "Event list",
    limited: "The first 100 events are listed; all marks remain on the graph.",
    warning: "Time is measured from the start of the recording when the application processes each event. It is not a hardware timestamp or a measure of osu! accuracy or misses. Sensor data uses a separate timeline. A key held before the recording starts or after it ends may not have a matching event.",
  },
} as const;

const lanes = [
  { key: "Z", down: true, y: 25 },
  { key: "Z", down: false, y: 55 },
  { key: "X", down: true, y: 85 },
  { key: "X", down: false, y: 115 },
] as const;

export function KeyEventTimeline({ events, duration_us, lang }: Props) {
  const t = labels[lang];
  const duration = Math.max(0, duration_us / 1_000_000);
  const [windowSeconds, setWindowSeconds] = useState(5);
  const [offset, setOffset] = useState(0);
  const span = Math.min(windowSeconds, duration);
  const maxOffset = Math.max(0, duration - span);
  const start = Math.min(offset, maxOffset);
  const end = Math.min(duration, start + span);

  // A new recording starts at zero; changing the zoom keeps the current start
  // where possible, clamped when the window reaches the recording's end.
  useEffect(() => setOffset(0), [events, duration_us]);
  const visible = useMemo(
    () => events.filter((event) => {
      const time = event.elapsed_us / 1_000_000;
      return time >= start && (time < end || (end === duration && time <= end));
    }),
    [events, start, end, duration],
  );

  return (
    <section class="event-timeline" aria-label={t.title}>
      <div>
        <strong>{t.title}</strong>
        <p class="note">{t.description}</p>
      </div>
      <div class="practice-actions" role="group" aria-label={t.window}>
        <span class="note">{t.window}:</span>
        {[1, 2, 5, 10, 30].map((value) => (
          <button
            key={value}
            type="button"
            class={`chip${windowSeconds === value ? " is-active" : ""}`}
            aria-pressed={windowSeconds === value}
            onClick={() => setWindowSeconds(value)}
          >
            {value} {t.seconds}
          </button>
        ))}
      </div>
      <Slider
        label={`${t.start} (${duration.toFixed(2)} ${t.seconds})`}
        value={start}
        min={0}
        max={maxOffset}
        step={0.01}
        unit={t.seconds}
        digits={2}
        disabled={maxOffset <= 0}
        onLiveChange={setOffset}
        onCommit={setOffset}
      />
      <div
        class="event-timeline__viewport"
        role="img"
        aria-label={`${t.title}: ${start.toFixed(2)}–${end.toFixed(2)} ${t.seconds}; ${t.count}: ${visible.length}`}
      >
        <svg class="event-timeline__svg" viewBox="0 0 1000 145" width="100%" height="145" preserveAspectRatio="none" aria-hidden="true">
          {lanes.map((lane) => (
            <g key={`${lane.key}-${String(lane.down)}`}>
              <text x="0" y={lane.y + 4} fill="var(--text-dim)" font-size="11">{lane.key} {lane.down ? "↓" : "↑"}</text>
              <line x1="55" x2="995" y1={lane.y} y2={lane.y} stroke="var(--line)" stroke-width="1" vector-effect="non-scaling-stroke" />
            </g>
          ))}
          {visible.map((event, index) => {
            const x = 55 + (span > 0 ? (event.elapsed_us / 1_000_000 - start) / span * 940 : 0);
            const lane = lanes.find((item) => item.key === event.key && item.down === event.down)!;
            return (
              <line key={`${event.elapsed_us}-${event.key}-${index}`} x1={x} x2={x} y1={lane.y - 7} y2={lane.y + 7} stroke={event.key === "Z" ? "var(--primary)" : "var(--rose)"} stroke-width="2" vector-effect="non-scaling-stroke">
                <title>{event.key} {event.down ? t.down : t.up}: {(event.elapsed_us / 1_000_000).toFixed(3)} {t.seconds}</title>
              </line>
            );
          })}
        </svg>
      </div>
      <div class="recording-axis"><span>{start.toFixed(2)} {t.seconds}</span><span>{end.toFixed(2)} {t.seconds}</span></div>
      <p class="note">↓ {t.down} · ↑ {t.up} · {t.count}: {visible.length}</p>
      {visible.length === 0 ? <p class="note">{t.noEvents}</p> : (
        <details>
          <summary>{t.list}</summary>
          <div class="event-timeline__list">
            {visible.slice(0, 100).map((event, index) => (
              <div key={`${event.elapsed_us}-${event.key}-${index}`}>{(event.elapsed_us / 1_000_000).toFixed(3)} {t.seconds} · {event.key} · {event.down ? t.down : t.up}</div>
            ))}
          </div>
          {visible.length > 100 ? <p class="note">{t.limited}</p> : null}
        </details>
      )}
      <p class="note">{t.warning}</p>
    </section>
  );
}
