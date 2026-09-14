import { logClientError } from './client-log';

/**
 * Global capture hooks for the client-error-log ring buffer
 * (docs/plans/2026-09-14-client-error-log-pwa-plan.md §3.2).
 *
 * Mounted ONCE at boot (root.tsx) BEFORE the render so errors during
 * initialization are captured too. Wraps console.error/console.warn (the
 * original still runs — nothing that prints today disappears) and listens to
 * window 'error' / 'unhandledrejection' plus 'online'/'offline' transitions
 * (knowing WHEN a device lost connectivity is gold for debugging offline
 * issues). Returned uninstaller restores everything — used by tests.
 *
 * The unhandledrejection listener deliberately does NOT claim the event
 * (no preventDefault): this buffer is an observer, not an error policy —
 * the decryption-failure policy keeps its priority.
 */

let installed = false;

let originalConsoleError: typeof console.error | null = null;
let originalConsoleWarn: typeof console.warn | null = null;

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg) ?? String(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

function onError(event: ErrorEvent): void {
  logClientError({
    level: 'error',
    message: event.message || 'Unknown script error',
    location: [event.filename, `${event.lineno}:${event.colno}`].filter(Boolean).join(':'),
  });
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason;
  const message =
    reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'Unknown rejection reason';
  logClientError({
    level: 'error',
    message: `Unhandled rejection: ${message}`,
    location: reason instanceof Error ? reason.stack : undefined,
  });
}

function onOffline(): void {
  logClientError({ level: 'info', message: 'Sin conexión (evento offline del navegador)' });
}

function onOnline(): void {
  logClientError({ level: 'info', message: 'Conexión restaurada (evento online del navegador)' });
}

/** Mount the global hooks. Idempotent — a second call is a no-op. */
export function installClientLog(): void {
  if (installed) return;
  installed = true;

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  originalConsoleError = console.error.bind(console);
  originalConsoleWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    logClientError({ level: 'error', message: formatArgs(args) });
    originalConsoleError?.(...args);
  };
  console.warn = (...args: unknown[]) => {
    logClientError({ level: 'warn', message: formatArgs(args) });
    originalConsoleWarn?.(...args);
  };
}

/** Restore every hook to its original state (tests / hot reload). */
export function uninstallClientLog(): void {
  if (!installed) return;
  installed = false;

  window.removeEventListener('error', onError);
  window.removeEventListener('unhandledrejection', onUnhandledRejection);
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);

  if (originalConsoleError) console.error = originalConsoleError;
  if (originalConsoleWarn) console.warn = originalConsoleWarn;
  originalConsoleError = null;
  originalConsoleWarn = null;
}
