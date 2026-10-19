/**
 * Keeps the screen awake during a transfer (plan §4). A sleeping tab can be
 * frozen mid-transfer, which kills the connection. The Wake Lock API is not
 * available everywhere (and never in jsdom), so this degrades to a no-op.
 */
export interface WakeLockHandle {
  release(): Promise<void>;
}

export async function acquireWakeLock(): Promise<WakeLockHandle | null> {
  const wakeLock = typeof navigator === 'undefined' ? undefined : navigator.wakeLock;
  if (!wakeLock?.request) return null;
  try {
    const sentinel = await wakeLock.request('screen');
    return { release: () => sentinel.release() };
  } catch {
    return null;
  }
}
