import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { api } from "./ipc";
import { createSensorStreamController } from "./sensor-stream";

/**
 * One sensor stream for the whole window. The keyboard diagram and the
 * Sensors tab share it, so travel stays visible while actuation is adjusted.
 */
export function useSensorStream(connected: boolean) {
  const [live, setLive] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const wanted = useRef(false);
  const reportError = useRef(false);
  const connectedRef = useRef(connected);
  connectedRef.current = connected;
  const controller = useRef<ReturnType<typeof createSensorStreamController> | null>(null);
  if (!controller.current) {
    controller.current = createSensorStreamController(api.setStreaming, setPending, (enabled, error) => {
      setLive(enabled);
      setFailed(error !== null && reportError.current);
    });
  }

  useEffect(() => {
    if (!connected && (live || pending || wanted.current)) {
      wanted.current = false;
      reportError.current = false;
      void controller.current?.request(false);
    }
  }, [connected, live, pending]);

  useEffect(
    () => () => {
      void controller.current?.close();
    },
    [],
  );

  const setStream = useCallback((next: boolean) => {
    wanted.current = next;
    reportError.current = true;
    if (next && !connectedRef.current) return;
    setFailed(false);
    void controller.current?.request(next);
  }, []);

  const stopStream = useCallback(() => {
    wanted.current = false;
    reportError.current = false;
    return controller.current?.request(false) ?? Promise.resolve(false);
  }, []);

  return { live, pending, failed, setStream, stopStream };
}
