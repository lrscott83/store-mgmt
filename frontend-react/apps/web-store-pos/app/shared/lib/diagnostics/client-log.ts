import { GlobalConfig } from '../config/global-config';

/**
 * Client-side diagnostic log (docs/plans/2026-09-14-client-error-log-pwa-plan.md).
 *
 * A FIFO ring buffer of errors/warnings/info events persisted in localStorage
 * so a device in the field can be debugged AFTER the fact: the Owner opens
 * /diagnostics and shares the export (WhatsApp/mail via navigator.share) — no
 * backend, no external service, fully offline-first.
 *
 * LEAF module (zero imports of stores/http/crypto — same purity as
 * offline-session.ts) so the global installer can mount before anything else.
 *
 * Privacy: never log request/response bodies, Authorization headers, roster
 * JWTs or DEKs. Values for sensitive keys and Bearer patterns are redacted to
 * [REDACTED] before persisting. The export is manual and explicit.
 */

export type LogLevel = 'error' | 'warn' | 'info';

export interface ClientLogEntry {
  /** Epoch ms. */
  ts: number;
  level: LogLevel;
  /** Truncated to 500 chars. */
  message: string;
  /** Error stack (first lines) or the URL/event that produced the entry. */
  location?: string;
  /** location.pathname when the entry was captured. */
  route?: string;
  /** Consecutive-duplicate collapse count (undefined = 1 occurrence). */
  count?: number;
  context?: Record<string, string | number | boolean | null>;
}

const LOG_KEY = 'lizoft.client-log-v1';
const MAX_ENTRIES = 200;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_MESSAGE_LENGTH = 500;

/** Keys whose values must never persist, plus the sentinel token pattern. */
const SENSITIVE_KEY_PATTERN = /^(${|token|password|offlineAuthToken|dek)/i;
const BEARER_PATTERN = /Bearer\s+\S+/gi;
const SENTINEL_PATTERN = /offline-session/gi;
const REDACTED = '[REDACTED]';

/** Module-scoped fallback used when localStorage writes fail (quota). */
let inMemoryBuffer: ClientLogEntry[] | null = null;

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function redactString(value: string): string {
  return truncate(value.replace(BEARER_PATTERN, `Bearer ${REDACTED}`).replace(SENTINEL_PATTERN, REDACTED), MAX_MESSAGE_LENGTH);
}

function redactContext(
  context: Record<string, string | number | boolean | null> | undefined,
): Record<string, string | number | boolean | null> | undefined {
  if (!context) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : value;
  }
  return out;
}

function readFromStorage(): ClientLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ClientLogEntry[]) : [];
  } catch {
    return [];
  }
}

function writeToStorage(entries: ClientLogEntry[]): void {
  localStorage.setItem(LOG_KEY, JSON.stringify(entries));
}

/** Evict-oldest-and-retry-once policy for quota failures. */
function persist(entries: ClientLogEntry[]): boolean {
  try {
    writeToStorage(entries);
    return true;
  } catch {
    if (entries.length === 0) return false;
    try {
      writeToStorage(entries.slice(1));
      return true;
    } catch {
      return false;
    }
  }
}

function appendEntry(entry: ClientLogEntry): void {
  let entries: ClientLogEntry[];
  try {
    entries = readFromStorage();
  } catch {
    entries = inMemoryBuffer ?? [];
  }

  // Prune entries older than MAX_AGE_MS (write-time housekeeping).
  const cutoff = Date.now() - MAX_AGE_MS;
  entries = entries.filter((e) => e.ts >= cutoff);

  // Collapse consecutive duplicates (same level+message+location) into a count.
  const last = entries[entries.length - 1];
  if (
    last &&
    last.level === entry.level &&
    last.message === entry.message &&
    last.location === entry.location
  ) {
    last.count = (last.count ?? 1) + 1;
    last.ts = entry.ts; // keep the newest occurrence timestamp
  } else {
    entries.push(entry);
  }

  // FIFO cap.
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES);
  }

  if (persist(entries)) {
    inMemoryBuffer = null;
  } else {
    // localStorage unusable (quota/private mode): serve from memory this session.
    inMemoryBuffer = entries;
  }
}

/** Public write API used by the installer and the integration call-sites. */
export function logClientError(
  entry: Omit<ClientLogEntry, 'ts'> & { ts?: number },
): void {
  try {
    appendEntry({
      ...entry,
      ts: entry.ts ?? Date.now(),
      message: redactString(entry.message),
      location: entry.location ? redactString(entry.location) : undefined,
      context: redactContext(entry.context),
      route: entry.route ?? (typeof window !== 'undefined' ? window.location.pathname : undefined),
    });
  } catch {
    // Logging must NEVER take the app down — swallow anything unexpected.
  }
}

/** Newest-last snapshot (safe copy — mutating it does not affect the buffer). */
export function getClientLogs(): ClientLogEntry[] {
  if (inMemoryBuffer) return [...inMemoryBuffer];
  try {
    return [...readFromStorage()];
  } catch {
    return [];
  }
}

/** Manual wipe (Diagnostics view "Clear" button). */
export function clearClientLogs(): void {
  inMemoryBuffer = null;
  try {
    localStorage.removeItem(LOG_KEY);
  } catch {
    // best-effort
  }
}

export interface ClientLogExport {
  appVersion: string;
  device: {
    userAgent: string;
    onLine: boolean;
    language: string;
    /** ISO timestamp of the export moment. */
    timestamp: string;
  };
  selectedStoreId?: string;
  entries: ClientLogEntry[];
}

/** Pretty JSON with a device-metadata header — the shareable artifact. */
export function exportClientLogs(selectedStoreId?: string): string {
  const payload: ClientLogExport = {
    appVersion: GlobalConfig.APP_VERSION,
    device: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      onLine: typeof navigator !== 'undefined' ? navigator.onLine : false,
      language: typeof navigator !== 'undefined' ? navigator.language : '',
      timestamp: new Date().toISOString(),
    },
    ...(selectedStoreId ? { selectedStoreId } : {}),
    entries: getClientLogs(),
  };
  return JSON.stringify(payload, null, 2);
}
