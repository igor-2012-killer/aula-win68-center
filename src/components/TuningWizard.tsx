import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Lang } from "../i18n";
import { reviewSession } from "../session-review";
import { attemptIssue, isTuningSnapshot, type TuningAttempt, type TuningIssue, type TuningKey, type TuningParameter } from "../tuning";
import { Button, Chip, Panel } from "./ui";

type Answer = TuningAttempt["extra"];
type Progress = { version: 1; key: TuningKey; parameter: TuningParameter; baseline: TuningAttempt[]; variant: TuningAttempt[] };
const STORAGE = "aula-tuning-wizard-v1";
const empty = (): Progress => ({ version: 1, key: "Z", parameter: "rt_release", baseline: [], variant: [] });
const words = {
  ru: {
    title: "Подбор Rapid Trigger под игру", hint: "Сравните два варианта на одной карте",
    introduction: "Выберите клавишу и один параметр. Запишите по три попытки с исходным и изменённым значением, после каждой оцените ощущения.",
    key: "Клавиша", parameter: "Параметр", press: "Нажатие", release: "Отпускание", baseline: "1. Исходные настройки", variant: "2. Изменённая настройка", results: "3. Сравнение", complete: "Попыток собрано", of: "из 3",
    first: "Подключите tosu и запишите попытку в разделе ниже. Начните запись до старта карты, сыграйте один и тот же участок и остановите после него.",
    nextBaseline: "Запишите ещё одну попытку на том же участке, ничего не меняя в настройках.",
    change: "Откройте настройки выбранной клавиши и вручную измените только выбранный параметр. Затем вернитесь сюда и запишите три попытки на том же участке.",
    nextVariant: "Запишите ещё одну попытку с тем же изменённым значением и оцените её.", tune: "Открыть Rapid Trigger", setting: "Настройки при записи", selectedValue: "Выбранный параметр", waiting: "Ожидание новой записи", recording: "Идёт запись…",
    comfort: "Насколько было удобно?", low: "неудобно", high: "очень удобно", extra: "Заметили лишние нажатия?", missing: "Заметили потерянные повторы?", unknown: "Не знаю", yes: "Да", no: "Нет", add: "Добавить эту попытку", ratingRequired: "Выберите оценку удобства от 1 до 5.",
    duplicate: "Эта запись уже добавлена. Запишите следующую попытку.", no_settings: "В записи нет подробных настроек. Создайте новую запись в этой версии приложения.", invalid_session: "Не удалось разобрать запись: проверьте, что файл не повреждён и не превышает лимиты.", no_game: "Нет полных данных tosu об игре, карте и модах. Подключите tosu и запишите попытку заново.", interrupted: "Запись прервана, содержит перезапуск или несколько игровых периодов. Запишите один непрерывный проход.", range: "Нет хотя бы 10 секунд игры с нажатиями, либо начало или конец отличаются от первой попытки больше чем на 3 секунды. Повторите тот же участок.", identity: "Карта, режим, моды, скорость или клиент отличаются от первой попытки.", settings: "Настройки не подходят для этой серии. Убедитесь, что для выбранной клавиши включён Rapid Trigger, и проверьте профиль и значения на старте записи.", unchanged: "Выбранный параметр пока не отличается от исходного. Измените его вручную или продолжай­те играть с исходными настройками.", multiple: "Кроме выбранного параметра изменились другие настройки Z/X или условия клавиатуры. Для сравнения оставьте одно изменение.",
    original: "Исходный вариант", changed: "Изменённый вариант", accuracy: "Средняя наблюдаемая точность", misses: "Среднее число промахов", comfortAvg: "Среднее удобство", flags: "Сообщено о проблеме", outOf: "из", extraShort: "лишние", missingShort: "потерянные", unknownShort: "неизвестно", perAttempt: "Попытки", resultNote: "Точность и промахи — последние наблюдения tosu, не обязательно итоги карты. Это сравнение, а не доказательство причины и не автоматическая рекомендация. Учитывайте комфорт и повторите тест, если разница невелика.",
    removeLast: "Убрать последнюю попытку", reset: "Начать подбор заново", confirm: "Подтвердить сброс", cancel: "Отмена", persistence: "Сводки и оценки сохраняются на этом компьютере. Полные записи сохраняются отдельно через JSON.", storageError: "Не удалось сохранить сводки на компьютере: они доступны только до закрытия приложения.", unknownSettings: "Нет данных", noAutomatic: "Приложение не меняет настройки автоматически.", importFile: "Загрузить сохранённую попытку", imported: "Загружена запись", badFile: "Не удалось прочитать запись с подробными настройками. Выберите JSON, сохранённый в этой версии приложения (до 20 МБ).",
  },
  en: {
    title: "Tune Rapid Trigger in game", hint: "Compare two settings on the same map",
    introduction: "Choose a key and one parameter. Record three attempts with the original setting and three with the changed setting, rating each one.",
    key: "Key", parameter: "Parameter", press: "Press", release: "Release", baseline: "1. Original setting", variant: "2. Changed setting", results: "3. Comparison", complete: "Attempts collected", of: "of 3",
    first: "Connect tosu and start a recording below before the map. Play the same passage and stop recording afterwards.",
    nextBaseline: "Record another attempt on the same passage without changing settings.",
    change: "Open the selected key's settings and manually change only the selected parameter. Return here and record three attempts on the same passage.",
    nextVariant: "Record another attempt with the same changed setting and rate it.", tune: "Open Rapid Trigger", setting: "Settings at recording start", selectedValue: "Selected parameter", waiting: "Waiting for a new recording", recording: "Recording…",
    comfort: "How comfortable was it?", low: "uncomfortable", high: "very comfortable", extra: "Notice extra presses?", missing: "Notice missing repeats?", unknown: "Not sure", yes: "Yes", no: "No", add: "Add this attempt", ratingRequired: "Choose a comfort rating from 1 to 5.",
    duplicate: "This recording is already included. Record the next attempt.", no_settings: "The recording lacks detailed settings. Make a new recording in this version of the app.", invalid_session: "Could not decode the recording: check that the file is intact and within limits.", no_game: "Complete tosu game, map and mod data is missing. Connect tosu and record again.", interrupted: "The recording was interrupted, includes a restart or multiple gameplay periods. Record one continuous play.", range: "Less than 10 seconds of play with presses, or the start or end differs from the first attempt by more than 3 seconds. Repeat the same passage.", identity: "The map, mode, mods, rate or client differ from the first attempt.", settings: "Settings do not match this series. Check that Rapid Trigger is enabled for the selected key, along with profile and values at the recording start.", unchanged: "The selected parameter has not changed from the baseline. Change it manually or keep playing with the original setting.", multiple: "Other Z/X settings or keyboard conditions changed along with the selected parameter. Change only one for this comparison.",
    original: "Original", changed: "Changed", accuracy: "Mean observed accuracy", misses: "Mean misses", comfortAvg: "Mean comfort", flags: "Problem reported", outOf: "of", extraShort: "extra", missingShort: "missing", unknownShort: "unknown", perAttempt: "Attempts", resultNote: "Accuracy and misses are the last tosu observations, not necessarily the final score. This comparison does not prove a cause or automatically recommend a setting. Consider comfort and repeat the test if the difference is small.",
    removeLast: "Remove last attempt", reset: "Start a new comparison", confirm: "Confirm reset", cancel: "Cancel", persistence: "Summaries and ratings are saved on this computer. Export full recordings separately as JSON.", storageError: "Could not save summaries on this computer; they are available only until the app closes.", unknownSettings: "Unavailable", noAutomatic: "The app does not change settings automatically.", importFile: "Load a saved attempt", imported: "Loaded recording", badFile: "Could not read a recording with detailed settings. Choose JSON saved by this version of the app (up to 20 MB).",
  },
} as const;

function restore(): Progress {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE) ?? "null") as Progress | null;
    if (!value || value.version !== 1 || !["Z", "X"].includes(value.key) || !["rt_press", "rt_release"].includes(value.parameter) || !Array.isArray(value.baseline) || !Array.isArray(value.variant) || value.baseline.length > 3 || value.variant.length > 3 || (value.variant.length && value.baseline.length !== 3)) return empty();
    const prior: TuningAttempt[] = [];
    for (const [group, list] of [["baseline", value.baseline], ["variant", value.variant]] as const) {
      for (const attempt of list) {
        if (!attempt || typeof attempt.id !== "string" || !Number.isInteger(attempt.comfort) || attempt.comfort < 1 || attempt.comfort > 5 || !["yes", "no", "unknown"].includes(attempt.extra) || !["yes", "no", "unknown"].includes(attempt.missing) || attemptIssue(attempt, prior, group, value.key, value.parameter)) return empty();
        prior.push(attempt);
      }
    }
    return value;
  } catch { return empty(); }
}

export function TuningWizard({ currentSession, recording, lang, onTune }: { currentSession: unknown; recording: boolean; lang: Lang; onTune: (id: number, target: "rapid") => void }) {
  const t = words[lang];
  const [progress, setProgress] = useState<Progress>(restore);
  const [comfort, setComfort] = useState<number | null>(null);
  const [extra, setExtra] = useState<Answer>("unknown");
  const [missing, setMissing] = useState<Answer>("unknown");
  const [resetting, setResetting] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [importedSession, setImportedSession] = useState<unknown>(null);
  const [importedName, setImportedName] = useState("");
  const [fileError, setFileError] = useState(false);
  const fileGeneration = useRef(0);
  const group = progress.baseline.length < 3 ? "baseline" : "variant";
  const full = progress.variant.length >= 3;
  useEffect(() => {
    if (currentSession) {
      fileGeneration.current++;
      setImportedSession(null);
      setImportedName("");
      setFileError(false);
    }
  }, [currentSession]);
  const selectedSession = importedSession ?? currentSession;
  useEffect(() => { setComfort(null); setExtra("unknown"); setMissing("unknown"); }, [selectedSession]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE, JSON.stringify(progress)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [progress]);
  const decoded = useMemo(() => {
    if (!selectedSession) return null;
    if (typeof selectedSession !== "object") return { error: "invalid_session" as const };
    const session = selectedSession as { recordingId?: unknown; settingsDetail?: unknown };
    if (typeof session.recordingId !== "string" || !session.recordingId || session.recordingId.length > 128 || !isTuningSnapshot(session.settingsDetail)) {
      return { error: "no_settings" as const };
    }
    try {
      return { candidate: { id: session.recordingId, settings: session.settingsDetail, review: reviewSession(selectedSession) } };
    } catch {
      return { error: "invalid_session" as const };
    }
  }, [selectedSession]);
  const candidate = decoded && "candidate" in decoded ? decoded.candidate : null;
  const load = async (file: File | undefined) => {
    if (!file) return;
    const generation = ++fileGeneration.current;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("too large");
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object") throw new Error("invalid");
      const session = parsed as { recordingId?: unknown; settingsDetail?: unknown };
      if (typeof session.recordingId !== "string" || !session.recordingId || session.recordingId.length > 128 || !isTuningSnapshot(session.settingsDetail)) throw new Error("missing settings");
      reviewSession(parsed);
      if (generation !== fileGeneration.current) return;
      setImportedSession(parsed); setImportedName(file.name); setFileError(false);
    } catch { if (generation === fileGeneration.current) setFileError(true); }
  };
  const attempt = candidate && comfort ? { ...candidate, comfort, extra, missing } : null;
  const prior = [...progress.baseline, ...progress.variant];
  let issue: TuningIssue | null = null;
  if (candidate) issue = attemptIssue({ ...candidate, comfort: comfort ?? 1, extra, missing }, prior, group, progress.key, progress.parameter);
  else if (decoded && decoded.error) issue = decoded.error;
  const add = () => {
    if (!attempt || issue || full || recording) return;
    setProgress((previous) => ({ ...previous, [group]: [...previous[group], attempt] }));
    setComfort(null); setExtra("unknown"); setMissing("unknown");
  };
  const remove = () => setProgress((previous) => previous.variant.length ? { ...previous, variant: previous.variant.slice(0, -1) } : { ...previous, baseline: previous.baseline.slice(0, -1) });
  const avg = (items: TuningAttempt[], get: (a: TuningAttempt) => number) => (items.reduce((sum, a) => sum + get(a), 0) / items.length).toFixed(2);
  const panel = (items: TuningAttempt[], name: string) => <div class="practice-key">
    <strong>{name} · {items.length} {t.of}</strong>
    {items.length ? <>
      <span>{t.selectedValue}: <strong>{items[0]!.settings.keys[progress.key][progress.parameter].toFixed(2)} mm</strong></span>
      <span>{t.accuracy}: <strong>{avg(items, (a) => a.review.score!.accuracy!)}%</strong></span>
      <span>{t.misses}: <strong>{avg(items, (a) => a.review.score!.misses!)}</strong></span>
      <span>{t.comfortAvg}: <strong>{avg(items, (a) => a.comfort)} / 5</strong></span>
      <span class="note">{t.perAttempt}: {items.map((a) => `${a.review.score!.accuracy!.toFixed(2)}% / ${a.review.score!.misses} / ${a.comfort}/5`).join(" · ")}</span>
      <span>{t.flags}: {t.extraShort} {items.filter((a) => a.extra === "yes").length}/{items.length} ({t.unknownShort}: {items.filter((a) => a.extra === "unknown").length}) · {t.missingShort} {items.filter((a) => a.missing === "yes").length}/{items.length} ({t.unknownShort}: {items.filter((a) => a.missing === "unknown").length})</span>
    </> : <span class="note">—</span>}
  </div>;
  const choices = (label: string, value: Answer, set: (value: Answer) => void) => <div class="tuning-field"><span>{label}</span><div class="practice-actions">{(["unknown", "yes", "no"] as const).map((item) => <Chip key={item} active={value === item} onClick={() => set(item)}>{t[item]}</Chip>)}</div></div>;
  return <Panel title={t.title} description={t.hint}>
    <p>{t.introduction}</p>
    <div class="tuning-selectors">
      <div class="tuning-field"><strong>{t.key}</strong><div class="practice-actions">{(["Z", "X"] as const).map((key) => <Chip key={key} disabled={prior.length > 0 || recording} active={progress.key === key} onClick={() => setProgress((p) => ({ ...p, key }))}>{key}</Chip>)}</div></div>
      <div class="tuning-field"><strong>{t.parameter}</strong><div class="practice-actions">{(["rt_press", "rt_release"] as const).map((parameter) => <Chip key={parameter} disabled={prior.length > 0 || recording} active={progress.parameter === parameter} onClick={() => setProgress((p) => ({ ...p, parameter }))}>{parameter === "rt_press" ? t.press : t.release}</Chip>)}</div></div>
    </div>
    <div class="tuning-progress" aria-label={t.complete}>
      <span class={group === "baseline" ? "is-active" : ""}>{t.baseline} · {progress.baseline.length}/3</span>
      <span class={group === "variant" && !full ? "is-active" : ""}>{t.variant} · {progress.variant.length}/3</span>
      <span class={full ? "is-active" : ""}>{t.results}</span>
    </div>
    {!full ? <>
      <p>{group === "baseline" ? progress.baseline.length ? t.nextBaseline : t.first : progress.variant.length ? t.nextVariant : t.change}</p>
      {group === "variant" ? <div class="practice-actions"><Button disabled={recording} onClick={() => onTune(progress.key === "Z" ? 29 : 27, "rapid")}>{t.tune}: {progress.key}</Button><span class="note">{t.noAutomatic}</span></div> : null}
      {recording ? <p role="status">{t.recording}</p> : candidate ? <div class="tuning-rating">
        <span class="note">{t.setting}: {candidate.review.settings ?? t.unknownSettings}</span>
        {issue ? <p role="status" class="tuning-warning">{t[issue]}</p> : <>
          <div class="tuning-field"><strong>{t.comfort}</strong><div class="practice-actions">{[1, 2, 3, 4, 5].map((value) => <Chip key={value} active={comfort === value} onClick={() => setComfort(value)}>{value}</Chip>)}<span class="note">1 — {t.low}, 5 — {t.high}</span></div></div>
          {choices(t.extra, extra, setExtra)}{choices(t.missing, missing, setMissing)}
          <div class="practice-actions"><Button variant="primary" disabled={!comfort} onClick={add}>{t.add}</Button>{!comfort ? <span class="note">{t.ratingRequired}</span> : null}</div>
        </>}
      </div> : <p role="status" class={issue ? "tuning-warning" : "note"}>{issue ? t[issue] : t.waiting}</p>}
      <div class="practice-actions">
        <label class="session-file"><span class="btn btn--ghost">{t.importFile}</span><input type="file" disabled={recording} accept=".json,application/json" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void load(file); }} /></label>
        {importedName ? <span class="note">{t.imported}: {importedName}</span> : null}
      </div>
      {fileError ? <p role="alert" class="tuning-warning">{t.badFile}</p> : null}
    </> : null}
    {prior.length ? <div class="practice-keys">{panel(progress.baseline, t.original)}{panel(progress.variant, t.changed)}</div> : null}
    {full ? <p class="note">{t.resultNote}</p> : null}
    <div class="practice-actions">
      {prior.length ? <Button disabled={recording} onClick={remove}>{t.removeLast}</Button> : null}
      {prior.length ? resetting ? <><Button variant="danger" disabled={recording} onClick={() => { setProgress(empty()); setResetting(false); }}>{t.confirm}</Button><Button onClick={() => setResetting(false)}>{t.cancel}</Button></> : <Button disabled={recording} onClick={() => setResetting(true)}>{t.reset}</Button> : null}
    </div>
    <p class="note">{storageError ? t.storageError : t.persistence}</p>
  </Panel>;
}
