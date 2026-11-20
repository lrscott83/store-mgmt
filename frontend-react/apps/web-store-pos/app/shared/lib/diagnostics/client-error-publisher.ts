import { apiClient } from '~/shared/lib/http/api-client';
import {
  formatClientDeviceDescriptor,
  getClientAppVersion,
  getClientLogs,
  type ClientLogEntry,
} from './client-log';

/**
 * Client side of `POST /api/v1/store-client-errors` (pos-client-error-logs
 * S1-S3). Reads the local diagnostic ring buffer (`lizoft.client-log-v1`),
 * takes ONLY the `level === 'error'` entries and publishes them in batches
 * while the device is online and a session exists.
 *
 * Framework-agnostic on purpose — the effect that decides WHEN to run lives in
 * `use-client-error-publisher.ts`, exactly like the store-usage tracker split.
 *
 * Invariants:
 * - `warn`/`info` never leave the device; an offline usage-send failure never
 *   reaches this module (it is never written to the buffer at all).
 * - `skipLoading` + `skipDiagnostics`: a publish failure must not drive the
 *   global overlay, and must never be written back into the buffer it reads
 *   from (that would be a self-feeding loop).
 * - Publication order is explicit - `ts`, then `message` - never the ring
 *   buffer's own order, so the cursor means the same thing on every device.
 * - A cursor in its own localStorage key stops republishing. It advances ONLY
 *   after the backend accepted the chunk, so a failed chunk is retried. A
 *   corrupt or unwritable cursor degrades to "resend", never to "lose".
 * - Publishing never throws: the caller is a fire-and-forget effect.
 */

export const CLIENT_ERROR_PUBLISH_INTERVAL_MS = 60_000;
export const MAX_ERRORS_PER_REQUEST = 50;
export const CLIENT_ERROR_PUBLISH_ENDPOINT = '/v1/store-client-errors';
export const CLIENT_ERROR_PUBLISH_CURSOR_KEY = 'lizoft.client-error-publish-cursor-v1';
// Same all-zero sentinel store-usage-tracker.ts uses for "no store assigned".
export const EMPTY_STORE_ID = '00000000-0000-0000-0000-000000000000';

export interface PublishClientErrorLogsOptions {
  /** `useOnlineStatus()` — entries buffered offline go out on the next online run. */
  online: boolean;
  /** `useAuthStore().isAuthenticated` — the ingest endpoint is authenticated. */
  authenticated: boolean;
  /** `user.selectedStoreId` at send time; absent/empty guid is published as `null`. */
  storeId?: string | null;
}

interface PublishCursor {
  /** High-water mark: newest entry `ts` the backend has accepted. */
  ts: number;
  /** How many entries with exactly that `ts` were already accepted. */
  count: number;
}

interface ErrorEntryPayload {
  occurredAt: string;
  message: string;
  route?: string;
  location?: string;
  count: number;
  context?: ClientLogEntry['context'];
  appVersion: string;
  device: string;
}

/** Module-scoped run mutex: mount + online flip + interval must not overlap. */
let publishing = false;

function readCursor(): PublishCursor {
  try {
    const raw = localStorage.getItem(CLIENT_ERROR_PUBLISH_CURSOR_KEY);
    if (!raw) return { ts: 0, count: 0 };
    const parsed = JSON.parse(raw) as Partial<PublishCursor>;
    return {
      ts: typeof parsed.ts === 'number' && parsed.ts > 0 ? parsed.ts : 0,
      count: typeof parsed.count === 'number' && parsed.count > 0 ? parsed.count : 0,
    };
  } catch {
    return { ts: 0, count: 0 };
  }
}

function writeCursor(cursor: PublishCursor): void {
  try {
    localStorage.setItem(CLIENT_ERROR_PUBLISH_CURSOR_KEY, JSON.stringify(cursor));
  } catch {
    // Quota/private mode: the entries get retried, which is the safe direction.
  }
}

/** Locale-independent ordering: `ts` first, then `message`. */
function compareEntries(a: ClientLogEntry, b: ClientLogEntry): number {
  if (a.ts !== b.ts) return a.ts - b.ts;
  if (a.message === b.message) return 0;
  return a.message < b.message ? -1 : 1;
}

/** Error entries in publication order — `getClientLogs()` order is NOT relied on. */
function sortedErrorEntries(): ClientLogEntry[] {
  return getClientLogs()
    .filter((entry) => entry.level === 'error')
    .sort(compareEntries);
}

/** Error entries past the cursor, in publication order. */
function pendingErrorEntries(cursor: PublishCursor): ClientLogEntry[] {
  const pending: ClientLogEntry[] = [];
  let skippedAtCursorCount = 0;

  for (const entry of sortedErrorEntries()) {
    if (entry.ts < cursor.ts) continue;
    // Only the cursor's OWN count of same-`ts` entries is skipped; the sorted
    // order makes this independent of the order the buffer happens to hold.
    if (entry.ts === cursor.ts && skippedAtCursorCount < cursor.count) {
      skippedAtCursorCount += 1;
      continue;
    }
    pending.push(entry);
  }

  return pending;
}

function advanceCursor(published: ClientLogEntry[]): void {
  const last = published[published.length - 1];
  if (!last) return;

  const current = readCursor();
  const atLastTs = published.filter((entry) => entry.ts === last.ts).length;
  if (last.ts === current.ts) {
    writeCursor({ ts: current.ts, count: current.count + atLastTs });
  } else {
    writeCursor({ ts: last.ts, count: atLastTs });
  }
}

function toWireEntry(entry: ClientLogEntry): ErrorEntryPayload {
  return {
    occurredAt: new Date(entry.ts).toISOString(),
    message: entry.message,
    route: entry.route,
    location: entry.location,
    count: entry.count ?? 1,
    context: entry.context,
    appVersion: getClientAppVersion(),
    device: formatClientDeviceDescriptor(),
  };
}

function normalizeStoreId(storeId: string | null | undefined): string | null {
  if (!storeId || storeId === EMPTY_STORE_ID) return null;
  return storeId;
}

/**
 * Publishes every buffered error entry past the cursor, in sequential chunks of
 * at most {@link MAX_ERRORS_PER_REQUEST}. Resolves when done (or when skipped);
 * never rejects.
 */
export async function publishClientErrorLogs(
  options: PublishClientErrorLogsOptions,
): Promise<void> {
  if (!options.online || !options.authenticated) return;
  if (publishing) return;

  publishing = true;
  try {
    const storeId = normalizeStoreId(options.storeId);
    const pending = pendingErrorEntries(readCursor());

    for (let i = 0; i < pending.length; i += MAX_ERRORS_PER_REQUEST) {
      const chunk = pending.slice(i, i + MAX_ERRORS_PER_REQUEST);
      try {
        const errors = chunk.map(toWireEntry);
        await apiClient.post(
          CLIENT_ERROR_PUBLISH_ENDPOINT,
          { storeId, errors },
          { skipLoading: true, skipDiagnostics: true },
        );
      } catch {
        // Cursor untouched: this chunk (and anything after it) is retried later.
        return;
      }
      advanceCursor(chunk);
    }
  } catch {
    // Publishing must never take the app down.
  } finally {
    publishing = false;
  }
}
