import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalConfig } from '~/shared/lib/config/global-config';

// ── pos-client-error-logs S1-S3 (T4) ────────────────────────────────────────
// The POS buffers diagnostics locally (`lizoft.client-log-v1`) and publishes a
// SUBSET to `POST /api/v1/store-client-errors` while the device is online and a
// session exists. Contract pinned here:
//  - only `level === 'error'` leaves the device (`warn`/`info` stay local)
//  - offline / unauthenticated runs send nothing (entries wait for the next run)
//  - at most 50 entries per request, sequential chunks
//  - `skipLoading` + `skipDiagnostics`, so a failed publish never feeds the
//    diagnostic buffer it reads from (no feedback loop)
//  - a localStorage cursor prevents re-publishing and only advances on success

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { apiClient } from '~/shared/lib/http/api-client';
import { getClientLogs, logClientError } from '../client-log';
import { publishClientErrorLogs } from '../client-error-publisher';

const STORE_ID = '11111111-2222-3333-4444-555555555555';
const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';
const ENDPOINT = '/v1/store-client-errors';
const CURSOR_KEY = 'lizoft.client-error-publish-cursor-v1';
const LOG_KEY = 'lizoft.client-log-v1';

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

describe('publishClientErrorLogs — S1: only error entries leave the device', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    post.mockResolvedValue({ status: 204 });
  });

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
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    post.mockResolvedValue({ status: 204 });
  });

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
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    post.mockResolvedValue({ status: 204 });
  });

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
    expect(url).toBe(ENDPOINT);
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

  it('sends storeId null when the selected store is the empty guid (no store)', async () => {
    logClientError({ level: 'error', message: 'no-store', ts: T0 });

    await publishClientErrorLogs({ ...ONLINE_AUTHENTICATED, storeId: EMPTY_GUID });

    expect(bodyOf().storeId).toBeNull();
  });

  it('requests with skipLoading and skipDiagnostics so a failed publish never feeds the buffer', async () => {
    logClientError({ level: 'error', message: 'boom', ts: T0 });

    await publishClientErrorLogs(ONLINE_AUTHENTICATED);

    expect(post.mock.calls[0]![2]).toEqual({ skipLoading: true, skipDiagnostics: true });
  });
});

describe('publishClientErrorLogs — batching', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

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
    // The second chunk must wait for the first response — sequential, not parallel.
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
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    post.mockResolvedValue({ status: 204 });
  });

  it('does not re-publish entries already accepted by the backend', async () => {
    logClientError({ level: 'error', message: 'once', ts: T0 });

    await publishClientErrorLogs(ONLINE_AUTHENTICATED);
    await publishClientErrorLogs(ONLINE_AUTHENTICATED);
    await publishClientErrorLogs(ONLINE_AUTHENTICATED);

    expect(post).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(CURSOR_KEY)).not.toBeNull();
  });

  it('does not advance the cursor when the POST rejects, then retries the same entries', async () => {
    logClientError({ level: 'error', message: 'retry-me', ts: T0 });

    post.mockRejectedValueOnce(new Error('network down'));
    await publishClientErrorLogs(ONLINE_AUTHENTICATED);

    expect(localStorage.getItem(CURSOR_KEY)).toBeNull();

    await publishClientErrorLogs(ONLINE_AUTHENTICATED);

    expect(post).toHaveBeenCalledTimes(2);
    expect(bodyOf(1).errors[0]!['message']).toBe('retry-me');
    expect(localStorage.getItem(CURSOR_KEY)).not.toBeNull();
  });
});

describe('publishClientErrorLogs — never throws, never recurses into the buffer', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('resolves (no throw) on a rejected POST and leaves lizoft.client-log-v1 untouched', async () => {
    logClientError({ level: 'error', message: 'keep-me', ts: T0 });
    const before = getClientLogs();
    post.mockRejectedValue(new Error('500'));

    await expect(publishClientErrorLogs(ONLINE_AUTHENTICATED)).resolves.toBeUndefined();

    expect(getClientLogs()).toEqual(before);
    expect(JSON.parse(localStorage.getItem(LOG_KEY)!)).toHaveLength(1);
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
