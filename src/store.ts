import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { api, onState, onStatus, onTravel } from "./ipc";
import { SENSOR_COUNT, type KeyboardState } from "./types";

export interface Toast {
  id: number;
  text: string;
  tone: "ok" | "error";
}

export type LinkState = "connecting" | "online" | "reconnecting" | "offline";

export interface Store {
  state: KeyboardState | null;
  lang: "ru" | "en";
  selection: number[];
  selectedSet: Set<number>;
  sensors: number[];
  toasts: Toast[];
  busy: boolean;
  link: { state: LinkState; detail: string | null };
  setLang: (lang: "ru" | "en") => void;
  toggleKey: (id: number, additive: boolean) => void;
  selectMany: (ids: number[]) => void;
  clearSelection: () => void;
  notify: (text: string, tone?: "ok" | "error") => void;
  /**
   * Run a backend call, surfacing failures as a toast and succeeding silently.
   * Resolves to whether the call went through, so callers can roll a control
   * back when the keyboard refused the write.
   */
  run: (task: () => Promise<unknown>) => Promise<boolean>;
  /** Ask the backend to reconnect, then re-read the state. */
  reconnect: () => Promise<void>;
}

export function useStore(): Store {
  const [state, setState] = useState<KeyboardState | null>(null);
  const [lang, setLang] = useState<"ru" | "en">("ru");
  const [selection, setSelection] = useState<number[]>([]);
  const [sensors, setSensors] = useState<number[]>(() => new Array<number>(SENSOR_COUNT).fill(0));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ state: LinkState; detail: string | null }>({
    state: "connecting",
    detail: null,
  });

  const toastId = useRef(0);
  const timers = useRef<number[]>([]);
  // The sensor stream arrives faster than React state should change. Frames
  // are coalesced: only the latest one is applied, once per animation frame.
  const pendingFrame = useRef<number[] | null>(null);
  const frameHandle = useRef<number | null>(null);

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
        .catch((err: unknown) => {
          // Booting without the keyboard must not dead-lock on "Connecting…":
          // surface the failure so the reconnect button has a context.
          console.error(err);
          if (!disposed) {
            setLink({
              state: "offline",
              detail: err instanceof Error ? err.message : String(err),
            });
          }
        });
    };

    const applyState = (next: KeyboardState) => {
      setState(next);
      setLink((current) => ({
        state: next.reconnecting
          ? "reconnecting"
          : next.connected
            ? "online"
            : "offline",
        detail: next.connected ? null : (next.last_error ?? current.detail),
      }));
    };

    guard(() => api.getState(), applyState);
    guard(() => onState(applyState), track);
    guard(
      () =>
        onTravel((frame) => {
          pendingFrame.current = frame;
          if (frameHandle.current == null) {
            frameHandle.current = requestAnimationFrame(() => {
              frameHandle.current = null;
              if (pendingFrame.current) setSensors(pendingFrame.current);
            });
          }
        }),
      track,
    );
    guard(
      () =>
        onStatus((kind, detail) => {
          setLink((current) => ({
            state:
              kind === "connected"
                ? "online"
                : kind === "reconnecting"
                  ? "reconnecting"
                  : "offline",
            detail: detail ?? (kind === "connected" ? null : current.detail),
          }));
        }),
      track,
    );

    return () => {
      disposed = true;
      teardown.forEach((off) => off());
      timers.current.forEach(clearTimeout);
      timers.current = [];
      if (frameHandle.current != null) cancelAnimationFrame(frameHandle.current);
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
    async (task: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await task();
        return true;
      } catch (err) {
        // Errors are loud; successes are silent. A keyboard control panel
        // commits on every slider release, so a success toast per commit is
        // spam, while a silent failure leaves the control showing a value the
        // hardware does not hold.
        notify(err instanceof Error ? err.message : String(err), "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );

  const reconnect = useCallback(async () => {
    setLink((current) => ({ state: "reconnecting", detail: current.detail }));
    await run(async () => {
      await api.reconnect();
      setState(await api.getState());
    });
  }, [run]);

  const selectedSet = useMemo(() => new Set(selection), [selection]);

  const toggleKey = useCallback((id: number, additive: boolean) => {
    setSelection((current) => {
      if (!additive) return [id];
      return current.includes(id) ? current.filter((k) => k !== id) : [...current, id];
    });
  }, []);

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
    link,
    setLang,
    toggleKey,
    selectMany,
    clearSelection,
    notify,
    run,
    reconnect,
  };
}
