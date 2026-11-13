import { readStartupPolyfillReport } from './polyfills';

/**
 * Persists the polyfill startup report into the exportable diagnostic log
 * (`/diagnostics`). The report itself is captured in `polyfills.ts` at module
 * scope, before anything else evaluates, but `console.warn` alone is not
 * retrievable from a device in the field — this flush is the durable trace.
 *
 * Leaf module: it imports only `polyfills`, never the app graph, so `root.tsx`
 * can call it next to `installClientLog()`.
 */

/** The slice of a diagnostic entry this module emits. */
export interface StartupDiagnosticEntry {
  readonly level: 'warn';
  readonly message: string;
  readonly context?: Record<string, string | number | boolean | null>;
}

const STARTUP_DEGRADED_MESSAGE = '[browser-compat] polyfills degraded at startup';

/**
 * Logs once when the startup run failed or degraded, and does nothing when it
 * was clean. `log` is injected so this module never imports the log sink.
 */
export function flushStartupPolyfillDiagnostics(
  log: (entry: StartupDiagnosticEntry) => void,
): void {
  try {
    const { result, error } = readStartupPolyfillReport();
    const failed = result?.failed ?? [];
    if (failed.length === 0 && error === null) return;

    const context: Record<string, string | number | boolean | null> = {};
    for (const { api, reason } of failed) context[api] = reason;
    if (error !== null) context.startupError = error;

    log({ level: 'warn', message: STARTUP_DEGRADED_MESSAGE, context });
  } catch {
    // Diagnostics must never break boot: losing a log line is cheap, a blank
    // page on a field device is not.
  }
}
