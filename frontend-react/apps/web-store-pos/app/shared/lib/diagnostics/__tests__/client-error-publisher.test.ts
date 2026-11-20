import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalConfig } from '~/shared/lib/config/global-config';

// ── pos-client-error-logs S1-S3 (T4) ────────────────────────────────────────
// The POS buffers diagnostics locally (`lizoft.client-log-v1`) and publishes a
// SUBSET to `POST /api/v1/store-client-errors` while the device is online and a
// session exists. Contract pinned here:
//  - only `level === 'error'` leaves the device (`warn`/`info` stay local)
//  - offline / unauthenticated runs send nothing (entries wait for the next run)
//  - entries are published oldest-first, sorted by `ts` then `message`, no
//    matter what order the ring buffer happens to hold them in
//  - at most 50 entries per request, sequential chunks
//  - `skipLoading` + `skipDiagnostics`, so a failed publish never feeds the
//    diagnostic buffer it reads from (no feedback loop)
//  - a localStorage cursor prevents re-publishing and only advances on success
//  - a corrupt / unwritable cursor degrades to "resend", never to "lose"

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { apiClient } from '~/shared/lib/http/api-client';
import {
  CLIENT_LOG_STORAGE_KEY,
  clearClientLogs,
  exportClientLogs,
  getClientLogs,
  logClientError,
  type ClientLogEntry,
  type ClientLogExport,
} from '../client-log';
import {
  CLIENT_ERROR_PUBLISH_CURSOR_KEY,
  CLIENT_ERROR_PUBLISH_ENDPOINT,
  EMPTY_STORE_ID,
  publishClientErrorLogs,
} from '../client-error-publisher';

const STORE_ID = '11111111-2222-3333-4444-555555555555';

// `appendEntry` prunes entries older than 7 days at WRITE time, so seeded `ts`
// values must be recent: a fixed epoch date would be dropped before the test
// ever got to publish it.
const T0 = Date.now() - 60_000;

const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const ONLINE_AUTHENTICATED = { online: true, authenticated: true, storeId: STORE_ID };

function bodyOf(callIndex = 0): { storeId: string | null; errors: Record<string, unknown>[] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (post.mock.calls[callIndex] as any)[1];
}

function messagesOf(callIndex = 0): unknown[] {
  return bodyOf(callIndex).errors.map((entry) => entry['message']);
}

/**
 * Writes the ring buffer verbatim, bypassing `logClientError`'s append order —
 * the only way to prove publication does not inherit the buffer's order.
 */
function seedBuffer(entries: ClientLogEntry[]): void {
  localStorage.setItem(CLIENT_LOG_STORAGE_KEY, JSON.stringify(entries));
}

beforeEach(() => {
  clearClientLogs();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  post.mockResolvedValue({ status: 204 });
});

describe('publishClientErrorLogs — S1: only error entries leave the device', () => {
  it('posts the error entry and ignores the buffered warn and info entries', async () => {
    logClientError({ level: 'warn', message: 'warn-only', ts: T0 });
    logClientError({ level: 'info', message: 'info-only', ts: T0 + 1 });
    logClientError({ level: 'error', message: 'error-only', ts: T0 + 2 });

    await publishClientErrorLogs(ONLINE_AUTHENTICATED);

    expect(post).toHaveBeenCalledTimes(1);
    const body = bodyOf();
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]!['message']).toBe('error-only');
  });

  it('never sends a warn entry, even when the buffer holds only warn/info', async () => {
    logClientError({ level: 'warn', message: 'warn-only', ts: T0 });
    logClientError({ level: 'info', message: 'info-only', ts: T0 + 1 });

    await publishClientErrorLogs(ONLINE_AUTHENTICATED);

    expect(post).not.toHaveBeenCalled();
  });
});

describe('publishClientErrorLogs — S2/S3: online and authenticated only', () => {
  it('sends nothing while offline and publishes the buffered entry on the next online run', async () => {
    logClientError({ level: 'error', message: 'offline-born', ts: T0 });

    await publishClientErrorLogs({ ...ONLINE_AUTHENTICATED, online: false });
    expect(post).not.toHaveBeenCalled();
    expect(getClientLogs()).toHaveLength(1);

    await publishClientErrorLogs(ONLINE_AUTHENTICATED);
    expect(post).toHaveBeenCalledTimes(1);
    expect(bodyOf().errors).toHaveLength(1);
  });

  it('sends nothing without a session and publishes after the next successful session', async () => {
    logClientError({ level: 'error', message: 'pre-login', ts: T0 });

    await publishClientErrorLogs({ ...ONLINE_AUTHENTICATED, authenticated: false });
    expect(post).not.toHaveBeenCalled();

    await publishClientErrorLogs(ONLINE_AUTHENTICATED);
    expect(post).toHaveBeenCalledTimes(1);
    expect(bodyOf().errors[0]!['message']).toBe('pre-login');
  });
});

describe('publishClientErrorLogs — wire body', () => {
  it('posts { storeId, errors } to the ingest endpoint with occurredAt derived from ts', async () => {
    logClientError({
      level: 'error',
      message: 'boom',
      location: 'Error: boom\n  at pricing.ts:42',
      ts: T0 + 500,
      context: { attempt: 2 },
    });

    await publishClientErrorLogs(ONLINE_AUTHENTICATED);

    const [url, body] = post.mock.calls[0] as [string, { storeId: string; errors: unknown[] }];
    expect(url).toBe(CLIENT_ERROR_PUBLISH_ENDPOINT);
    expect(body.storeId).toBe(STORE_ID);
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors[0]).toEqual(
      expect.objectContaining({
        occurredAt: new Date(T0 + 500).toISOString(),
        message: 'boom',
        location: 'Error: boom\n  at pricing.ts:42',
        count: 1,
        context: { attempt: 2 },
        appVersion: GlobalConfig.APP_VERSION,
      }),
    );
  });

  it('reuses the client-log export device source (navigator) for the device field', async () => {
    logClientError({ level: 'error', message: 'boom', ts: T0 });

    await publishClientErrorLogs(ONLINE_AUTHENTICATED);

    const device = bodyOf().errors[0]!['device'] as string;
    expect(device).toContain(navigator.userAgent);
  });

  it('derives device and appVersion from the same source as the client-log export', async () => {
    logClientError({ level: 'error', message: 'boom', ts: T0 });

    await publishClientErrorLogs(ONLINE_AUTHENTICATED);

    const exported = JSON.parse(exportClientLogs()) as ClientLogExport;
    const wire = bodyOf().errors[0]!;
    expect(wire['device']).toBe(
      `${exported.device.userAgent} | lang=${exported.device.language} | online=${exported.device.onLine}`,
    );
    expect(wire['appVersion']).toBe(exported.appVersion);
  });

  it('sends storeId null when the selected store is the empty guid (no store)', async () => {
    logClientError({ level: 'error', message: 'no-store', ts: T0 });

    await publishClientErrorLogs({ ...ONLINE_AUTHENTICATED, storeId: EMPTY_STORE_ID });

    expect(bodyOf().storeId).toBeNull();
  });

  it('requests with skipLoading and skipDiagnostics so a failed publish never feeds the buffer', async () => {
    logClientError({ level: 'error', message: 'boom', ts: T0 });

    await publishClientErrorLogs(ONLINE_AUTHENTICATED);

    expect(post.mock.calls[0]![2]).toEqual({ skipLoading: true, skipDiagnostics: true });
  });
});

describe('publishClientErrorLogs - U2: explicit ordering', () => {
  it('posts entries sorted by ts ascending, then by message', async () => {
    seedBuffer([
      { ts: T0 + 3, level: 'error', message: 'd' },
      { ts: T0, level: 'error', message: 'a' },
      { ts: T0 + 1, level: 'error', message: 'b' },
      { ts: T0 + 1, level: 'error', message: 'aa' },
    ]);

    await publishClientErrorLogs(ONLINE_AUTHENTICATED);

    expect(messagesOf()).toEqual(['a', 'aa', 'b', 'd']);
  });

  it('derives the cursor from the sorted order, not from the buffer order', async () => {
    seedBuffer([
      { ts: T0, level: 'error', message: 'c' },
      { ts: T0, level: 'error', message: 'a' },
      { ts: T0, level: 'error', message: 'b' },
    ]);

    await publishClientErrorLogs(ONLINE_AUTHENTICATED);
    expect(messagesOf()).toEqual(['a', 'b', 'c']);

    // Same three entries, different buffer order: the cursor written from the
    // sorted run already covers them, so nothing is republished.
    seedBuffer([
      { ts: T0, level: 'error', message: 'a' },
      { ts: T0, level: 'error', message: 'c' },
      { ts: T0, level: 'error', message: 'b' },
    ]);

    await publishClientErrorLogs(ONLINE_AUTHENTICATED);

    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('publishClientErrorLogs — batching', () => {
  it('splits more than 50 entries into sequential chunks of at most 50', async () => {
    for (let i = 0; i < 120; i++) {
      logClientError({ level: 'error', message: `chunk-${i}`, ts: T0 + i });
    }

    let resolveFirst!: (value: unknown) => void;
    post.mockResolvedValue({ status: 204 });
    post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const publishing = publishClientErrorLogs(ONLINE_AUTHENTICATED);
    // Entry ids are awaited before a chunk is posted, so the first POST lands on
    // a later tick: wait for it, then prove the SECOND chunk still waits for it.
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledTimes(1);

    resolveFirst({ status: 204 });
    await publishing;

    expect(post).toHaveBeenCalledTimes(3);
    expect(post.mock.calls.map((call) => (call[1] as { errors: unknown[] }).errors.length)).toEqual([
      50, 50, 20,
    ]);
  });
});

describe('publishClientErrorLogs — cursor', () => {
  it('does not re-publish entries already accepted by the backend', async () => {
    logClientError({ level: 'error', message: 'once', ts: T0 });

    await publishClientErrorLogs(ONLINE_AUTHENTICATED);
    await publishClientErrorLogs(ONLINE_AUTHENTICATED);
    await publishClientErrorLogs(ONLINE_AUTHENTICATED);

    expect(post).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(CLIENT_ERROR_PUBLISH_CURSOR_KEY)).not.toBeNull();
  });

  it('does not advance the cursor when the POST rejects, then retries the same entries', async () => {
    logClientError({ level: 'error', message: 'retry-me', ts: T0 });

    post.mockRejectedValueOnce(new Error('network down'));
    await publishClientErrorLogs(ONLINE_AUTHENTICATED);

    expect(localStorage.getItem(CLIENT_ERROR_PUBLISH_CURSOR_KEY)).toBeNull();

    await publishClientErrorLogs(ONLINE_AUTHENTICATED);

    expect(post).toHaveBeenCalledTimes(2);
    expect(bodyOf(1).errors[0]!['message']).toBe('retry-me');
    expect(localStorage.getItem(CLIENT_ERROR_PUBLISH_CURSOR_KEY)).not.toBeNull();
  });

  it('re-publishes everything when the stored cursor is not valid JSON', async () => {
    logClientError({ level: 'error', message: 'after-corruption', ts: T0 });
    localStorage.setItem(CLIENT_ERROR_PUBLISH_CURSOR_KEY, '{not json');

    await publishClientErrorLogs(ONLINE_AUTHENTICATED);

    expect(post).toHaveBeenCalledTimes(1);
    expect(messagesOf()).toEqual(['after-corruption']);
  });

  it('re-publishes everything when the stored cursor has the wrong shape', async () => {
    logClientError({ level: 'error', message: 'after-shape-drift', ts: T0 });
    localStorage.setItem(
      CLIENT_ERROR_PUBLISH_CURSOR_KEY,
      JSON.stringify({ ts: 'yesterday', count: null }),
    );

    await publishClientErrorLogs(ONLINE_AUTHENTICATED);

    expect(post).toHaveBeenCalledTimes(1);
    expect(messagesOf()).toEqual(['after-shape-drift']);
  });

  it('keeps entries resendable and does not throw when the cursor cannot be persisted', async () => {
    logClientError({ level: 'error', message: 'resend-me', ts: T0 });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    await expect(publishClientErrorLogs(ONLINE_AUTHENTICATED)).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(CLIENT_ERROR_PUBLISH_CURSOR_KEY)).toBeNull();

    setItem.mockRestore();
    await publishClientErrorLogs(ONLINE_AUTHENTICATED);

    expect(post).toHaveBeenCalledTimes(2);
    expect(bodyOf(1).errors[0]!['message']).toBe('resend-me');
  });
});

describe('publishClientErrorLogs — concurrency', () => {
  it('serialises two concurrent runs into a single POST', async () => {
    logClientError({ level: 'error', message: 'only-once', ts: T0 });

    let resolvePost!: (value: unknown) => void;
    post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        }),
    );

    const first = publishClientErrorLogs(ONLINE_AUTHENTICATED);
    const second = publishClientErrorLogs(ONLINE_AUTHENTICATED);

    // The second run returns immediately: the mutex is already held.
    await second;
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledTimes(1);

    resolvePost({ status: 204 });
    await first;

    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('publishClientErrorLogs — never throws, never recurses into the buffer', () => {
  it('resolves (no throw) on a rejected POST and leaves lizoft.client-log-v1 untouched', async () => {
    logClientError({ level: 'error', message: 'keep-me', ts: T0 });
    const before = getClientLogs();
    post.mockRejectedValue(new Error('500'));

    await expect(publishClientErrorLogs(ONLINE_AUTHENTICATED)).resolves.toBeUndefined();

    expect(getClientLogs()).toEqual(before);
    expect(JSON.parse(localStorage.getItem(CLIENT_LOG_STORAGE_KEY)!)).toHaveLength(1);
  });

  it('resolves (no throw) when the buffer cannot be read', async () => {
    post.mockResolvedValue({ status: 204 });
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    await expect(publishClientErrorLogs(ONLINE_AUTHENTICATED)).resolves.toBeUndefined();

    getItem.mockRestore();
    expect(post).not.toHaveBeenCalled();
  });
});
