import { useMemo, useRef, useState } from "preact/hooks";
import type { Lang } from "../i18n";
import { comparisonIdentity, reviewSession, type SessionReview } from "../session-review";
import { Button, Panel } from "./ui";

const strings = {
  ru: {
    title: "Сравнение попыток", hint: "Сравнивайте запись с ранее сохранённой сессией",
    steps: "Запишите попытку, закрепите её как эталон, затем при необходимости измените один параметр и запишите ещё одну попытку на той же карте.",
    pin: "Использовать текущую как эталон", pinned: "Эталон закреплён. После следующей записи здесь появится сравнение.", baselineMemory: "Эталон сравнения и текущая запись хранятся в памяти до закрытия приложения. Чтобы сохранить эталон целиком, экспортируйте JSON до новой записи.", tuneZ: "Настроить Z", tuneX: "Настроить X", tuneNote: "Переход к Rapid Trigger только выбирает клавишу. Изменения вы вносите сами.",
    intro: "Можно также загрузить ранее сохранённый JSON. Данные об удержании относятся ко всей записи, включая меню. Игровые показатели — последнее наблюдение tosu, а не обязательно итог карты.",
    choose: "Выбрать предыдущий JSON", selected: "Загружен файл", invalid: "Не удалось прочитать запись Aula. Выберите JSON-файл, сохранённый в приложении (до 20 МБ).", current: "Текущая запись", earlier: "Предыдущая запись", noCurrent: "Завершите запись, чтобы показать текущую попытку.", noEarlier: "Выберите ранее сохранённый файл.",
    settings: "Настройки на старте", duration: "Длительность записи", seconds: "с", presses: "Нажатия", hold: "Медиана удержания", pairs: "полных пар", incomplete: "неполных событий", score: "Последнее наблюдение tosu", noScore: "Нет игрового наблюдения tosu с оценёнными нотами.",
    map: "Карта", accuracy: "Точность", misses: "Промахи", mode: "Режим", mods: "Моды", rate: "Скорость", client: "Клиент", unknown: "неизвестно", playPeriods: "Периодов игры", rewinds: "Обратных скачков времени >100 мс", range: "Первое / последнее время карты", truncated: "Запись ограничена или прервана",
    same: "Карта, режим, моды, скорость и тип клиента совпадают по данным tosu.", different: "Карта, режим, моды, скорость или тип клиента различаются; сравнение результата ненадёжно.", missing: "Не хватает идентификатора карты, режима, модов, скорости или клиента, чтобы проверить совпадение условий. Старые файлы могут не содержать эти поля.",
    delta: "Разница: текущая минус предыдущая", accuracyDelta: "Точность, процентные пункты", missDelta: "Промахи", holdDelta: "Медиана удержания", deltaNote: "Разница — только сравнение полученных наблюдений; она не доказывает влияние настроек и не обязательно отражает итог карты.",
    note: "Даже при совпадении условий запись может включать паузы, повторы карты или разные участки. Разницу в точности нельзя автоматически приписать настройкам или отдельной клавише. Меняйте по одному параметру и повторяйте одну карту несколько раз.",
  },
  en: {
    title: "Compare attempts", hint: "Compare a recording with an earlier saved session",
    steps: "Record an attempt and set it as the baseline. If needed, change one setting, then record another attempt on the same map.",
    pin: "Use current as baseline", pinned: "Baseline saved. The next recording will be compared with it.", baselineMemory: "The comparison baseline and current recording are kept in memory until the app closes. To keep the full baseline, export its JSON before recording again.", tuneZ: "Tune Z", tuneX: "Tune X", tuneNote: "Opening Rapid Trigger only selects the key. You make any changes yourself.",
    intro: "You can also load an earlier JSON file. Hold times cover the whole recording, including menus. Game values are the last observed tosu data, not necessarily the final map result.",
    choose: "Choose previous JSON", selected: "Loaded file", invalid: "Could not read the Aula recording. Choose a JSON file saved by this app (up to 20 MB).", current: "Current recording", earlier: "Previous recording", noCurrent: "Finish a recording to show the current attempt.", noEarlier: "Choose a previously saved file.",
    settings: "Settings at start", duration: "Recording duration", seconds: "s", presses: "Presses", hold: "Median hold", pairs: "complete pairs", incomplete: "incomplete events", score: "Last tosu observation", noScore: "No tosu gameplay observation with judged notes.",
    map: "Map", accuracy: "Accuracy", misses: "Misses", mode: "Mode", mods: "Mods", rate: "Rate", client: "Client", unknown: "unknown", playPeriods: "Gameplay periods", rewinds: "Map-time reversals >100 ms", range: "First / last map time", truncated: "Recording truncated or interrupted",
    same: "Map, mode, mods, rate and client type match according to tosu.", different: "Map, mode, mods, rate or client type differ; result comparisons are unreliable.", missing: "Map identifier, mode, mods, rate or client is missing, so matching conditions cannot be checked. Older files may not contain these fields.",
    delta: "Difference: current minus previous", accuracyDelta: "Accuracy, percentage points", missDelta: "Misses", holdDelta: "Median hold", deltaNote: "The difference compares observed values only; it does not prove an effect of settings and may not reflect the final score.",
    note: "Even when conditions match, recordings can include pauses, retries or different passages. Accuracy differences cannot automatically be attributed to settings or an individual key. Change one parameter and repeat the same map several times.",
  },
} as const;

function ReviewCard({ title, data, lang }: { title: string; data: SessionReview; lang: Lang }) {
  const t = strings[lang];
  const score = data.score;
  const time = (value: number | null) => value === null ? "—" : `${(value / 1000).toFixed(1)} ${t.seconds}`;
  return <div class="practice-key">
    <strong>{title}</strong>
    <span class="note">{t.settings}: {data.settings ?? "—"}</span>
    <span class="note">{t.duration}: {(data.durationMs / 1000).toFixed(1)} {t.seconds}</span>
    {(["Z", "X"] as const).map((key) => {
      const info = data.keys[key];
      return <div key={key} class="practice-key__settings">
        <strong>{key}</strong>
        <span>{t.presses}: {info.presses} · {t.hold}: {info.medianHoldMs === null ? "—" : `${info.medianHoldMs.toFixed(1)} ms`}</span>
        <span class="note">{info.paired} {t.pairs}{info.incomplete ? ` · ${info.incomplete} ${t.incomplete}` : ""}</span>
      </div>;
    })}
    {score ? <div class="practice-key__settings">
      <strong>{t.score}</strong>
      <span>{t.map}: {score.map ?? t.unknown}</span>
      <span>{t.accuracy}: {score.accuracy === null ? "—" : `${score.accuracy.toFixed(2)}%`} · {t.misses}: {score.misses ?? "—"}</span>
      <span class="note">{t.mode}: {score.mode ?? t.unknown} · {t.mods}: {score.modsName === null ? t.unknown : score.modsName || "—"} · {t.rate}: {score.rate ?? t.unknown} · {t.client}: {score.client ?? t.unknown}</span>
      <span class="note">{t.range}: {time(score.firstMapTimeMs)} / {time(score.lastMapTimeMs)} · {t.playPeriods}: {score.playPeriods} · {t.rewinds}: {score.rewinds}</span>
      {score.truncated ? <span class="note">{t.truncated}</span> : null}
    </div> : <p class="note">{t.noScore}</p>}
  </div>;
}

export function SessionComparison({ currentSession, lang, recording, onTune, availableKeys }: { currentSession: unknown; lang: Lang; recording: boolean; onTune: (id: number, target: "rapid") => void; availableKeys: number[] }) {
  const t = strings[lang];
  const [previous, setPrevious] = useState<SessionReview | null>(null);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState(false);
  const loadGeneration = useRef(0);
  const baselineSession = useRef<unknown>(null);
  const current = useMemo(() => {
    if (!currentSession) return null;
    try { return reviewSession(currentSession); } catch { return null; }
  }, [currentSession]);

  const load = async (file: File | undefined) => {
    if (!file) return;
    const generation = ++loadGeneration.current;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("too large");
      const parsed = reviewSession(JSON.parse(await file.text()) as unknown);
      if (generation !== loadGeneration.current) return;
      baselineSession.current = null;
      setPrevious(parsed); setFilename(file.name); setError(false);
    } catch {
      if (generation !== loadGeneration.current) return;
      setError(true);
    }
  };
  const pin = () => {
    if (!current || recording) return;
    loadGeneration.current++;
    baselineSession.current = currentSession;
    setPrevious(current); setFilename(""); setError(false);
  };
  const sameSession = previous !== null && baselineSession.current !== null && baselineSession.current === currentSession;
  const identity = current && previous && !sameSession ? comparisonIdentity(current, previous) : null;
  const signed = (value: number, digits: number) => `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
  return <Panel title={t.title} description={t.hint}>
    <p>{t.steps}</p>
    <div class="practice-actions">
      <Button variant="primary" disabled={!current || recording || current.keys.Z.presses + current.keys.X.presses === 0} onClick={pin}>{t.pin}</Button>
      <Button disabled={recording || !availableKeys.includes(29)} onClick={() => onTune(29, "rapid")}>{t.tuneZ}</Button>
      <Button disabled={recording || !availableKeys.includes(27)} onClick={() => onTune(27, "rapid")}>{t.tuneX}</Button>
    </div>
    <p class="note">{t.tuneNote} {t.baselineMemory}</p>
    {sameSession ? <p role="status">{t.pinned}</p> : null}
    <p class="note">{t.intro}</p>
    <label class="session-file">
      <span class="btn btn--ghost">{t.choose}</span>
      <input type="file" accept=".json,application/json" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void load(file); }} />
    </label>
    {filename ? <span class="note">{t.selected}: {filename}</span> : null}
    {error ? <p role="alert">{t.invalid}</p> : null}
    {identity ? <p class="note">{identity === "same" ? t.same : identity === "different" ? t.different : t.missing}</p> : null}
    <div class="practice-keys">
      {current ? <ReviewCard title={t.current} data={current} lang={lang} /> : <p class="empty">{t.noCurrent}</p>}
      {previous ? <ReviewCard title={t.earlier} data={previous} lang={lang} /> : <p class="empty">{t.noEarlier}</p>}
    </div>
    {current && previous && !sameSession ? <div class="recording-result">
      <strong>{t.delta}</strong>
      <div class="recording-stats">
        {(["Z", "X"] as const).map((key) => {
          const a = current.keys[key].medianHoldMs, b = previous.keys[key].medianHoldMs;
          return <span key={key}>{key} · {t.holdDelta}: <strong>{a === null || b === null ? "—" : `${signed(a - b, 1)} ms`}</strong></span>;
        })}
        {identity === "same" && current.score && previous.score ? <>
          <span>{t.accuracyDelta}: <strong>{current.score.accuracy === null || previous.score.accuracy === null ? "—" : signed(current.score.accuracy - previous.score.accuracy, 2)}</strong></span>
          <span>{t.missDelta}: <strong>{current.score.misses === null || previous.score.misses === null ? "—" : signed(current.score.misses - previous.score.misses, 0)}</strong></span>
        </> : null}
      </div>
      <p class="note">{t.deltaNote}</p>
    </div> : null}
    <p class="note">{t.note}</p>
  </Panel>;
}
