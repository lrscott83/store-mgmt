/** The non-standard `beforeinstallprompt` event (Chromium PWA install flow). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Framework-agnostic capture store for `beforeinstallprompt`. Chrome fires
 * this event once, early in page load — often before React has hydrated —
 * and it cannot be re-dispatched. Wiring the listener from a `useEffect`
 * (which only runs after hydration) loses the event on that path, leaving
 * `usePwaInstall`'s `canPrompt` permanently false even though the browser
 * considers the app installable. `initPwaInstallCapture` is called from
 * `entry.client.tsx` at module scope — the earliest point client code runs —
 * so the listener exists before hydration starts. React components then read
 * the captured state via `getDeferredPrompt`/`subscribeDeferredPrompt`
 * (`useSyncExternalStore` in `usePwaInstall`).
 */

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
const subscribers = new Set<() => void>();

function notify(): void {
  subscribers.forEach((callback) => callback());
}

function onBeforeInstallPrompt(e: Event): void {
  // Prevent Chrome's mini-infobar so we control when to prompt.
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
  notify();
}

function onAppInstalled(): void {
  deferredPrompt = null;
  notify();
}

/**
 * Attaches the `beforeinstallprompt`/`appinstalled` window listeners.
 * Idempotent: safe to call multiple times (also called lazily from
 * `subscribeDeferredPrompt`, so consumers work correctly even if the
 * early-capture entry point didn't run first, e.g. in isolated unit tests).
 */
export function initPwaInstallCapture(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.addEventListener('appinstalled', onAppInstalled);
}

/** Returns the currently captured prompt event, or `null` if none was captured. */
export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

/**
 * Subscribes to changes in the captured prompt (`useSyncExternalStore`
 * subscribe function). Lazily initializes capture so subscribing alone is
 * enough to start receiving events. Returns an unsubscribe function.
 */
export function subscribeDeferredPrompt(callback: () => void): () => void {
  initPwaInstallCapture();
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

/** Fires the captured `beforeinstallprompt`; no-op when none is captured. */
export async function firePwaInstallPrompt(): Promise<void> {
  if (!deferredPrompt) return;
  await deferredPrompt.prompt();
  try {
    await deferredPrompt.userChoice;
  } finally {
    // A prompt can only be used once.
    deferredPrompt = null;
    notify();
  }
}

/**
 * Test-only reset: clears captured state, subscribers, and the initialized
 * flag (detaching window listeners) so Vitest module-global state doesn't
 * leak between test files/cases.
 */
export function resetPwaInstallPromptForTests(): void {
  if (initialized && typeof window !== 'undefined') {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.removeEventListener('appinstalled', onAppInstalled);
  }
  deferredPrompt = null;
  initialized = false;
  subscribers.clear();
}
