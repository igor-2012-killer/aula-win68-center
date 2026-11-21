import { useEffect, useRef, useState } from "preact/hooks";
import type { Lang } from "../i18n";
import { SENSOR_COLS, type KeyboardState } from "../types";
import { Button, Panel } from "./ui";

type Key = "Z" | "X";
type Exercise = "Z" | "X" | "alternate";
type Result = {
  exercise: Exercise;
  counts: Record<Key, number>;
  unexpected: number;
  settings: string;
  release: Record<Key, number | null>;
};
type Attempt = {
  end: number;
  result: Result;
  held: Set<Key>;
  lastKey: Key | null;
  seen: Record<Key, boolean>;
  minimum: Record<Key, number | null>;
};

const copy = {
  ru: {
    title: "Тренировка Z / X", hint: "10 секунд для сравнения попыток",
    intro: "Выберите упражнение, нажмите «Начать» и играйте в этом окне. Отпустите клавиши перед началом.",
    z: "Повторы Z", x: "Повторы X", alternate: "Чередование Z / X",
    start: "Начать", cancel: "Прервать", remaining: "Осталось", seconds: "с",
    count: "Нажатия", unexpected: "Нарушения задания", result: "Последняя попытка", previous: "Предыдущая попытка",
    noResult: "Завершите 10-секундную попытку, чтобы увидеть результат.",
    note: "Считаются события Z/X, полученные этим окном от системы, не обязательно от выбранной клавиатуры; повторы при удержании исключены. Нарушения — другая клавиша в упражнении на повторы или две одинаковые подряд при чередовании. Пропуски и точность в osu! не измеряются. При потере фокуса попытка прерывается.",
    release: "Последнее отпускание: минимум по кадрам", releaseNote: "Меньше мм — выше отпущена клавиша. Это приблизительное положение между двумя последними нажатиями, не расстояние отпускания; поток может пропустить быстрые движения. Включите поток датчиков ниже до начала попытки.",
    settings: "Режимы при старте", cancelled: "Попытка прервана: окно потеряло фокус или тренировка остановлена.",
    compare: "Сравниваются две завершённые попытки одного упражнения. Результаты хранятся только в текущем сеансе приложения.",
    disconnected: "Подключите клавиатуру, чтобы начать.",
  },
  en: {
    title: "Z / X practice", hint: "10 seconds to compare attempts",
    intro: "Choose an exercise, press Start and play in this window. Release the keys before starting.",
    z: "Repeat Z", x: "Repeat X", alternate: "Alternate Z / X",
    start: "Start", cancel: "Stop", remaining: "Remaining", seconds: "s",
    count: "Presses", unexpected: "Pattern deviations", result: "Latest attempt", previous: "Previous attempt",
    noResult: "Complete a 10-second attempt to see a result.",
    note: "Counts Z/X events received by this window from the system, not necessarily from the selected keyboard, excluding held-key repeats. Deviations are the other key in a repeat exercise or the same key twice in alternation. Misses and osu! accuracy are not measured. Losing focus stops the attempt.",
    release: "Last release: minimum sampled position", releaseNote: "Lower mm means the key was released higher. This is an approximate position between the last two presses, not release distance; the stream can miss fast movement. Enable the sensor stream below before starting.",
    settings: "Modes at start", cancelled: "Attempt stopped: the window lost focus or practice was stopped.",
    compare: "Two completed attempts of the same exercise are compared. Results are kept only for this app session.",
    disconnected: "Connect the keyboard to start.",
  },
} as const;

const storageKey = "aula-practice-results-v1";
type History = Partial<Record<Exercise, Result[]>>;

function readHistory(): History {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: History = {};
    for (const key of ["Z", "X", "alternate"] as const) {
      const list = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(list)) {
        out[key] = list.filter(
          (item): item is Result =>
            !!item &&
            typeof item === "object" &&
            typeof (item as Result).unexpected === "number" &&
            !!(item as Result).counts &&
            typeof (item as Result).counts.Z === "number" &&
            typeof (item as Result).counts.X === "number" &&
            !!(item as Result).release,
        );
      }
    }
    return out;
  } catch {
    return {};
  }
}

function describeSettings(state: KeyboardState): string {
  return ([29, 27] as const).map((id, i) => {
    const key = state.keys[id];
    if (!key) return `${i ? "X" : "Z"}: —`;
    const detail = key.mode === "rapidtrigger"
      ? `RT ${key.rt_press.toFixed(2)} / ${key.rt_release.toFixed(2)} mm`
      : `${key.mode} ${(key.mode === "global" ? state.global_actuation : key.actuation).toFixed(2)} mm`;
    return `${i ? "X" : "Z"}: ${detail}`;
  }).join(" · ");
}

export function PracticeExercise({ state, lang, sensors, live }: {
  state: KeyboardState; lang: Lang; sensors: number[]; live: boolean;
}) {
  const t = copy[lang];
  const [exercise, setExercise] = useState<Exercise>("alternate");
  const [history, setHistory] = useState<History>(readHistory);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(10);
  const [cancelled, setCancelled] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const liveRef = useRef(live);
  liveRef.current = live;
  const layoutRef = useRef(state.layout);
  layoutRef.current = state.layout;

  const finish = (completed: boolean) => {
    const current = attempt.current;
    if (!current) return;
    attempt.current = null;
    setRunning(false);
    if (!completed) { setCancelled(true); return; }
    setRemaining(0);
    setHistory((old) => {
      const next = { ...old, [current.result.exercise]: [current.result, ...(old[current.result.exercise] ?? [])].slice(0, 2) };
      try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* storage is optional */ }
      return next;
    });
  };

  useEffect(() => {
    if (!running) return;
    const onDown = (event: KeyboardEvent) => {
      const current = attempt.current;
      if (!current) return;
      if (performance.now() >= current.end) { finish(true); return; }
      const key: Key | null = event.code === "KeyZ" ? "Z" : event.code === "KeyX" ? "X" : null;
      if (!key) return;
      event.preventDefault();
      if (event.repeat || current.held.has(key)) return;
      current.held.add(key);
      current.result.counts[key]++;
      if ((current.result.exercise !== "alternate" && current.result.exercise !== key) ||
          (current.result.exercise === "alternate" && current.lastKey === key)) current.result.unexpected++;
      current.lastKey = key;
      if (current.seen[key] && current.minimum[key] !== null) current.result.release[key] = current.minimum[key];
      current.seen[key] = true;
      current.minimum[key] = null;
    };
    const onUp = (event: KeyboardEvent) => {
      const key = event.code === "KeyZ" ? "Z" : event.code === "KeyX" ? "X" : null;
      if (key) attempt.current?.held.delete(key);
    };
    const onBlur = () => finish(false);
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    window.addEventListener("blur", onBlur);
    const timer = window.setInterval(() => {
      const current = attempt.current;
      if (!current) return;
      const left = current.end - performance.now();
      if (left <= 0) finish(true);
      else setRemaining(Math.ceil(left / 1000));
    }, 100);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
      window.removeEventListener("blur", onBlur);
      clearInterval(timer);
    };
  }, [running]);

  useEffect(() => {
    const current = attempt.current;
    if (!current || !liveRef.current) return;
    for (const [key, id] of [["Z", 29], ["X", 27]] as const) {
      if (!current.seen[key]) continue;
      const def = layoutRef.current.find((item) => item.id === id);
      if (!def) continue;
      const sample = sensors[def.row * SENSOR_COLS + def.col];
      if (sample === undefined || !Number.isFinite(sample)) continue;
      current.minimum[key] = Math.min(current.minimum[key] ?? sample, sample);
    }
  }, [sensors]);

  useEffect(() => {
    if (!state.connected) finish(false);
  }, [state.connected]);

  useEffect(() => {
    if (!live && attempt.current) {
      attempt.current.minimum = { Z: null, X: null };
      attempt.current.result.release = { Z: null, X: null };
    }
  }, [live]);

  useEffect(() => () => { attempt.current = null; }, []);

  const start = () => {
    if (!state.connected || !document.hasFocus()) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const result: Result = { exercise, counts: { Z: 0, X: 0 }, unexpected: 0, settings: describeSettings(state), release: { Z: null, X: null } };
    attempt.current = { end: performance.now() + 10000, result, held: new Set(), lastKey: null, seen: { Z: false, X: false }, minimum: { Z: null, X: null } };
    setCancelled(false);
    setRemaining(10);
    setRunning(true);
  };

  const results = history[exercise] ?? [];
  return (
    <Panel title={t.title} description={t.hint}>
      <p class="note">{t.intro}</p>
      <div class="practice-actions" role="group" aria-label={t.title}>
        {(["Z", "X", "alternate"] as const).map((item) => (
          <button key={item} type="button" class={`btn ${exercise === item ? "btn--primary" : "btn--ghost"}`} disabled={running} aria-pressed={exercise === item} onClick={() => setExercise(item)}>
            {item === "Z" ? t.z : item === "X" ? t.x : t.alternate}
          </button>
        ))}
      </div>
      <div class="practice-actions">
        {running ? <Button onClick={() => finish(false)}>{t.cancel}</Button> : <Button variant="primary" disabled={!state.connected} onClick={start}>{t.start}</Button>}
        {running ? <strong role="status">{t.remaining}: {remaining} {t.seconds}</strong> : null}
        {!state.connected ? <span class="note">{t.disconnected}</span> : null}
      </div>
      {cancelled ? <p class="note" role="status">{t.cancelled}</p> : null}
      {results.length === 0 ? <p class="note">{t.noResult}</p> : (
        <div class="practice-keys">
          {results.map((result, index) => (
            <div class="practice-key" key={index}>
              <strong>{index === 0 ? t.result : t.previous}</strong>
              <span>{t.count}: Z {result.counts.Z} · X {result.counts.X}</span>
              <span>{t.unexpected}: {result.unexpected}</span>
              <span class="practice-key__peak">{t.release}: Z {result.release.Z === null ? "—" : `${(result.release.Z / 1000).toFixed(2)} mm`} · X {result.release.X === null ? "—" : `${(result.release.X / 1000).toFixed(2)} mm`}</span>
              <span class="practice-key__peak">{t.settings}: {result.settings}</span>
            </div>
          ))}
        </div>
      )}
      <p class="note">{t.note}</p>
      <p class="note">{t.releaseNote}</p>
      <p class="note">{t.compare}</p>
    </Panel>
  );
}
