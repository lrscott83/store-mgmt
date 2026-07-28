// Zero-import leaf module (design D1) — plain `setTimeout`/`clearTimeout`
// wrapper. Statically imported by `app-layout.tsx` (design D5: a dynamic
// import inside the idle-lock effect would race cleanup, letting a timer
// arm after unmount).
export interface IdleTimer {
  start(): void;
  stop(): void;
  notifyActivity(): void;
}

const ONE_HOUR_MS = 3_600_000;

export function createIdleTimer(onIdle: () => void, timeoutMs: number = ONE_HOUR_MS): IdleTimer {
  let handle: ReturnType<typeof setTimeout> | null = null;

  function clear(): void {
    if (handle !== null) {
      clearTimeout(handle);
      handle = null;
    }
  }

  function arm(): void {
    clear();
    handle = setTimeout(onIdle, timeoutMs);
  }

  return {
    start(): void {
      arm();
    },
    stop(): void {
      clear();
    },
    notifyActivity(): void {
      // Only re-arm if the timer is currently running — matches the
      // start()/stop() lifecycle (no accidental resurrection after stop()).
      if (handle !== null) {
        arm();
      }
    },
  };
}
