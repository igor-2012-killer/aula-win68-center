import { useEffect, useRef, useState } from "preact/hooks";
import type { Lang } from "../i18n";
import { Button, Panel } from "./ui";
import { parseTosuSnapshot, retainLastPlay, type TosuSnapshot } from "../tosu-data";

type Status = "disconnected" | "connecting" | "connected" | "stale" | "error";

const words = {
  ru: {
    title: "osu! через tosu", hint: "Локальные данные игры",
    explain: "Подключение к запущенному tosu на этом компьютере. Данные игры и нажатий не синхронизированы; результат нельзя приписать отдельной клавише.",
    connect: "Подключить tosu", disconnect: "Отключить", retry: "Подключить снова",
    disconnected: "Не подключён", connecting: "Подключение…", connected: "Подключён", stale: "Данные давно не обновлялись", error: "Нет связи с tosu. Проверьте, что он запущен на порту 24050.",
    waiting: "Ожидание данных от tosu…", invalid: "Получены данные в неизвестном формате.", state: "Состояние osu!", map: "Карта", client: "Клиент", version: "Версия клиента", accuracy: "Точность во время игры", misses: "Промахи во время игры", unavailable: "—", noPlay: "Показатели появятся во время игры.",
    statePlay: "Игра", stateMenu: "Выбор карты", stateResults: "Результат", stateOther: "Другое состояние",
    lastPlay: "Последнее наблюдение во время игры", lastPlayNote: "Последние полученные значения; это не обязательно итог карты или результат текущей записи. Сохраняются до закрытия приложения.",
    note: "Это текущие общие показатели tosu, не результат отдельной записи. Их нельзя использовать для определения ошибки конкретной клавиши.",
  },
  en: {
    title: "osu! via tosu", hint: "Local game data",
    explain: "Connect to tosu running on this computer. Game and keyboard data are not synchronized; a result cannot be assigned to an individual key.",
    connect: "Connect tosu", disconnect: "Disconnect", retry: "Reconnect",
    disconnected: "Disconnected", connecting: "Connecting…", connected: "Connected", stale: "Data has not updated recently", error: "Cannot connect to tosu. Check that it is running on port 24050.",
    waiting: "Waiting for data from tosu…", invalid: "Received data in an unknown format.", state: "osu! state", map: "Beatmap", client: "Client", version: "Client version", accuracy: "Accuracy during play", misses: "Misses during play", unavailable: "—", noPlay: "Statistics appear during play.",
    statePlay: "Playing", stateMenu: "Selecting a map", stateResults: "Results", stateOther: "Other state",
    lastPlay: "Last observed during play", lastPlayNote: "Last received values; these are not necessarily the final result or the result of the current recording. Kept until the app closes.",
    note: "These are current aggregate values from tosu, not the result of an individual recording. They cannot identify an error on a particular key.",
  },
} as const;

export function TosuPanel({ lang, onSnapshot, onConnectionChange }: { lang: Lang; onSnapshot?: (snapshot: TosuSnapshot, receivedAt: number) => void; onConnectionChange?: (connected: boolean) => void }) {
  const t = words[lang];
  const [status, setStatus] = useState<Status>("disconnected");
  const [snapshot, setSnapshot] = useState<TosuSnapshot | null>(null);
  const [lastPlay, setLastPlay] = useState<TosuSnapshot | null>(null);
  const [invalid, setInvalid] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const lastData = useRef<number | null>(null);
  const generation = useRef(0);
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;
  useEffect(() => { onConnectionChange?.(status === "connected" || status === "stale"); }, [status, onConnectionChange]);

  const disconnect = () => {
    generation.current++;
    const current = socket.current;
    socket.current = null;
    current?.close();
    lastData.current = null;
    setStatus("disconnected");
    setSnapshot(null);
    setInvalid(false);
  };

  const connect = () => {
    if (socket.current) return;
    const id = ++generation.current;
    setSnapshot(null);
    setInvalid(false);
    setStatus("connecting");
    lastData.current = null;
    let ws: WebSocket;
    try { ws = new WebSocket("ws://127.0.0.1:24050/websocket/v2"); }
    catch { setStatus("error"); return; }
    socket.current = ws;
    ws.onopen = () => {
      if (generation.current !== id) return;
      lastData.current = performance.now();
      setStatus("connected");
    };
    ws.onmessage = (event) => {
      if (generation.current !== id || typeof event.data !== "string") return;
      let parsed: TosuSnapshot | null = null;
      try { parsed = parseTosuSnapshot(JSON.parse(event.data) as unknown); } catch { /* unsupported response */ }
      if (!parsed) { setSnapshot(null); setInvalid(true); return; }
      lastData.current = performance.now();
      setSnapshot(parsed);
      onSnapshotRef.current?.(parsed, lastData.current);
      setLastPlay((previous) => retainLastPlay(previous, parsed));
      setInvalid(false);
      setStatus("connected");
    };
    ws.onerror = () => {
      if (generation.current !== id) return;
      generation.current++;
      socket.current = null;
      lastData.current = null;
      ws.close();
      setSnapshot(null);
      setStatus("error");
    };
    ws.onclose = () => {
      if (generation.current !== id) return;
      socket.current = null;
      lastData.current = null;
      setSnapshot(null);
      setStatus("error");
    };
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (lastData.current !== null && performance.now() - lastData.current > 5000) {
        setStatus((current) => current === "connected" ? "stale" : current);
      }
    }, 1000);
    return () => { clearInterval(interval); generation.current++; socket.current?.close(); socket.current = null; };
  }, []);

  const stateLabel = snapshot?.state === "play" ? t.statePlay : snapshot?.state === "selectPlay" ? t.stateMenu : snapshot?.state === "resultScreen" ? t.stateResults : t.stateOther;
  const active = status === "connected" || status === "stale" || status === "connecting";
  const canShow = (status === "connected" || status === "stale") && snapshot !== null && !invalid;

  return (
    <Panel title={t.title} description={t.hint}>
      <p class="note">{t.explain}</p>
      <div class="practice-actions">
        {active ? <Button onClick={disconnect}>{t.disconnect}</Button> : <Button variant="primary" onClick={connect}>{status === "error" ? t.retry : t.connect}</Button>}
        <span class="note" role="status">{t[status]}</span>
      </div>
      {status === "connected" && !snapshot && !invalid ? <p class="note">{t.waiting}</p> : null}
      {invalid && (status === "connected" || status === "stale") ? <p class="note">{t.invalid}</p> : null}
      {canShow ? <div class="recording-result">
        <div class="recording-stats">
          <span>{t.state}: <strong>{stateLabel}</strong></span>
          <span>{t.client}: <strong>{snapshot.client ?? t.unavailable}</strong></span>
          <span>{t.version}: <strong>{snapshot.version ?? t.unavailable}</strong></span>
        </div>
        <div class="recording-stats"><span>{t.map}: <strong>{snapshot.map ?? t.unavailable}</strong></span></div>
        {snapshot.state === "play" ? <div class="recording-stats">
          <span>{t.accuracy}: <strong>{snapshot.accuracy === null ? t.unavailable : `${snapshot.accuracy.toFixed(2)}%`}</strong></span>
          <span>{t.misses}: <strong>{snapshot.misses ?? t.unavailable}</strong></span>
        </div> : !lastPlay ? <p class="note">{t.noPlay}</p> : null}
      </div> : null}
      {lastPlay && (!canShow || snapshot?.state !== "play") ? <div class="recording-result">
          <strong>{t.lastPlay}</strong>
          <div class="recording-stats"><span>{t.map}: <strong>{lastPlay.map ?? t.unavailable}</strong></span><span>{t.accuracy}: <strong>{lastPlay.accuracy === null ? t.unavailable : `${lastPlay.accuracy.toFixed(2)}%`}</strong></span><span>{t.misses}: <strong>{lastPlay.misses ?? t.unavailable}</strong></span></div>
          <p class="note">{t.lastPlayNote}</p>
        </div> : null}
      <p class="note">{t.note}</p>
    </Panel>
  );
}
