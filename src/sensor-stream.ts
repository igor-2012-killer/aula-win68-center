/** Serialize stream changes so a late start cannot override a later stop. */
export function createSensorStreamController(
  send: (enabled: boolean) => Promise<unknown>,
  onPending: (pending: boolean) => void,
  onSettled: (enabled: boolean, error: unknown | null) => void,
) {
  let queue = Promise.resolve();
  let generation = 0;
  let closed = false;
  let active = false;
  const request = (enabled: boolean): Promise<boolean> => {
    if (closed) return Promise.resolve(false);
    const current = ++generation;
    onPending(true);
    const result = queue.then(() => send(enabled)).then(
      () => {
        active = enabled;
        if (!closed && current === generation) {
          onSettled(enabled, null);
          onPending(false);
        }
        return true;
      },
      (error: unknown) => {
        if (!closed && current === generation) {
          onSettled(active, error);
          onPending(false);
        }
        return false;
      },
    );
    queue = result.then(() => undefined);
    return result;
  };
  const close = (): Promise<void> => {
    if (closed) return queue;
    closed = true;
    generation++;
    queue = queue.then(() => send(false)).then(() => undefined, () => undefined);
    return queue;
  };
  return { request, close };
}
