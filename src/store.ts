import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { api, onState, onStatus, onTravel } from "./ipc";
import { SENSOR_COUNT, type KeyboardState } from "./types";

export interface Toast {
  id: number;
  text: string;
  tone: "ok" | "error";
}

export interface Store {
  state: KeyboardState | null;
  lang: "ru" | "en";
  selection: number[];
  selectedSet: Set<number>;
  sensors: number[];
  toasts: Toast[];
  busy: boolean;
  setLang: (lang: "ru" | "en") => void;
  toggleKey: (id: number, additive: boolean) => void;
  selectOnly: (ids: number[]) => void;
  selectMany: (ids: number[]) => void;
  clearSelection: () => void;
  notify: (text: string, tone?: "ok" | "error") => void;
  /** Run a backend call, surfacing failures as a toast. */
  run: (label: string, task: () => Promise<unknown>) => Promise<void>;
}

export function useStore(): Store {
  const [state, setState] = useState<KeyboardState | null>(null);
  const [lang, setLang] = useState<"ru" | "en">("ru");
  const [selection, setSelection] = useState<number[]>([26, 4, 22, 7]);
  const [sensors, setSensors] = useState<number[]>(() => new Array<number>(SENSOR_COUNT).fill(0));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState(false);

  const toastId = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    let disposed = false;
    const teardown: (() => void)[] = [];

    const track = (off: () => void) => {
      if (disposed) off();
      else teardown.push(off);
    };

    const guard = <T,>(factory: () => Promise<T>, apply: (value: T) => void) => {
      factory()
        .then((value) => {
          if (!disposed) apply(value);
        })
        .catch((err: unknown) => console.error(err));
    };

    guard(() => api.getState(), setState);
    guard(() => onState(setState), track);
    guard(() => onTravel((frame) => setSensors(frame)), track);
    guard(
      () =>
        onStatus((kind, detail) => {
          if (kind === "disconnected" && detail) console.warn(detail);
        }),
      track,
    );

    return () => {
      disposed = true;
      teardown.forEach((off) => off());
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  const notify = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = ++toastId.current;
    setToasts((current) => [...current.slice(-2), { id, text, tone }]);
    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 2400);
    timers.current.push(timer);
  }, []);

  const run = useCallback(
    async (label: string, task: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await task();
        notify(label, "ok");
      } catch (err) {
        notify(err instanceof Error ? err.message : String(err), "error");
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );

  const selectedSet = useMemo(() => new Set(selection), [selection]);

  const toggleKey = useCallback((id: number, additive: boolean) => {
    setSelection((current) => {
      if (!additive) return [id];
      return current.includes(id) ? current.filter((k) => k !== id) : [...current, id];
    });
  }, []);

  const selectOnly = useCallback((ids: number[]) => setSelection([...ids]), []);
  const selectMany = useCallback((ids: number[]) => setSelection([...ids]), []);
  const clearSelection = useCallback(() => setSelection([]), []);

  return {
    state,
    lang,
    selection,
    selectedSet,
    sensors,
    toasts,
    busy,
    setLang,
    toggleKey,
    selectOnly,
    selectMany,
    clearSelection,
    notify,
    run,
  };
}
