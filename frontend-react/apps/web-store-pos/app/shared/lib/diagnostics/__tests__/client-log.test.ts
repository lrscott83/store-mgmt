import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── client-error-log: ring buffer de diagnóstico en localStorage ────────────
// Contrato (docs/plans/2026-09-14-client-error-log-pwa-plan.md):
//  - cap 200 entradas FIFO bajo `lizoft.client-log-v1`
//  - prune de entradas > 7 días al escribir
//  - dedup: misma level+message+location consecutiva incrementa `count`
//  - redacción: `Bearer <jwt>`, `offline-session`, y valores de claves
//    token|password|offlineAuthToken|dek → [REDACTED]
//  - tolerante a quota: descarta la más vieja y reintenta; si falla de nuevo,
//    conserva el buffer en memoria (sin throw)
//  - exportClientLogs(): JSON con cabecera de metadatos del dispositivo

const LOG_KEY = 'lizoft.client-log-v1';

describe('logClientError — ring buffer y cap 200 (FIFO)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores a single entry with ts, level, message and route', async () => {
    const { logClientError, getClientLogs } = await import('../client-log');
    logClientError({ level: 'error', message: 'boom', route: '/sales/new' });

    const logs = getClientLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('error');
    expect(logs[0].message).toBe('boom');
    expect(logs[0].route).toBe('/sales/new');
    expect(typeof logs[0].ts).toBe('number');
  });

  it('keeps the newest entry last (append order)', async () => {
    const { logClientError, getClientLogs } = await import('../client-log');
    logClientError({ level: 'error', message: 'first' });
    logClientError({ level: 'warn', message: 'second' });

    const logs = getClientLogs();
    expect(logs.map((l) => l.message)).toEqual(['first', 'second']);
  });

  it('caps the buffer at 200 entries, dropping the OLDEST (FIFO)', async () => {
    const { logClientError, getClientLogs } = await import('../client-log');
    for (let i = 0; i < 205; i++) {
      logClientError({ level: 'error', message: `entry-${i}` });
    }

    const logs = getClientLogs();
    expect(logs).toHaveLength(200);
    expect(logs[0].message).toBe('entry-5'); // the first 5 entries were evicted
    expect(logs[199].message).toBe('entry-204');
  });

  it('persists to localStorage under lizoft.client-log-v1', async () => {
    const { logClientError } = await import('../client-log');
    logClientError({ level: 'error', message: 'persisted' });

    const raw = JSON.parse(localStorage.getItem(LOG_KEY)!);
    expect(Array.isArray(raw)).toBe(true);
    expect(raw[0].message).toBe('persisted');
  });
});

describe('logClientError — prune > 7 días', () => {
  beforeEach(() => {
    localStorage.clear();
    // Freeze the clock: `appendEntry` computes its own cutoff with `Date.now()`,
    // so a real clock would advance a few ms between the setup timestamp and
    // the write, spuriously pruning an entry placed exactly on the boundary.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('drops entries older than 7 days on write', async () => {
    const { logClientError, getClientLogs } = await import('../client-log');
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    localStorage.setItem(LOG_KEY, JSON.stringify([{ ts: eightDaysAgo, level: 'error', message: 'stale' }]));

    logClientError({ level: 'error', message: 'fresh' });

    const logs = getClientLogs();
    expect(logs.map((l) => l.message)).toEqual(['fresh']);
  });

  it('keeps entries exactly at 7 days (inclusive boundary)', async () => {
    const { logClientError, getClientLogs } = await import('../client-log');
    const exactlySevenDays = Date.now() - 7 * 24 * 60 * 60 * 1000;
    localStorage.setItem(LOG_KEY, JSON.stringify([{ ts: exactlySevenDays, level: 'error', message: 'edge' }]));

    logClientError({ level: 'error', message: 'new' });

    expect(getClientLogs().map((l) => l.message)).toEqual(['edge', 'new']);
  });
});

describe('logClientError — dedup consecutivo', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('collapses repeated identical entries into a count', async () => {
    const { logClientError, getClientLogs } = await import('../client-log');
    logClientError({ level: 'error', message: 'loop', location: 'stack-A' });
    logClientError({ level: 'error', message: 'loop', location: 'stack-A' });
    logClientError({ level: 'error', message: 'loop', location: 'stack-A' });

    const logs = getClientLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].count).toBe(3);
  });

  it('does not collapse different messages or non-consecutive entries', async () => {
    const { logClientError, getClientLogs } = await import('../client-log');
    logClientError({ level: 'error', message: 'a' });
    logClientError({ level: 'error', message: 'b' });
    logClientError({ level: 'error', message: 'a' });

    const logs = getClientLogs();
    expect(logs.map((l) => l.message)).toEqual(['a', 'b', 'a']);
    expect(logs[0].count).toBeUndefined();
  });
});

describe('logClientError — redacción de datos sensibles', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redacts Bearer tokens in message and location', async () => {
    const { logClientError, getClientLogs } = await import('../client-log');
    logClientError({
      level: 'error',
      message: 'request failed with Bearer eyJhbGciOiJIUzI1NiJ9.secret.sig',
      location: 'at call (Bearer eyJhbGciOiJIUzI1NiJ9.other.sig)',
    });

    const logs = getClientLogs();
    expect(logs[0].message).not.toContain('eyJ');
    expect(logs[0].message).toContain('[REDACTED]');
    expect(logs[0].location).not.toContain('eyJ');
  });

  it('redacts the offline-session sentinel and sensitive context keys', async () => {
    const { logClientError, getClientLogs } = await import('../client-log');
    logClientError({
      level: 'error',
      message: 'session offline-session leaked',
      context: { token: 'secret-token', password: 'hunter2', offlineAuthToken: 'jwt', dek: 'key-material', safe: 'ok' },
    });

    const [entry] = getClientLogs();
    expect(entry.message).toContain('[REDACTED]');
    expect(JSON.stringify(entry.context)).not.toContain('secret-token');
    expect(JSON.stringify(entry.context)).not.toContain('hunter2');
    expect(JSON.stringify(entry.context)).not.toContain('jwt');
    expect(JSON.stringify(entry.context)).not.toContain('key-material');
    expect(entry.context?.safe).toBe('ok');
  });

  it('truncates messages longer than 500 chars', async () => {
    const { logClientError, getClientLogs } = await import('../client-log');
    logClientError({ level: 'error', message: 'x'.repeat(800) });

    expect(getClientLogs()[0].message.length).toBeLessThanOrEqual(500);
  });
});

describe('logClientError — tolerancia a quota exceeded', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('never throws when setItem fails, and keeps the in-memory buffer', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { logClientError, getClientLogs } = await import('../client-log');

    expect(() => logClientError({ level: 'error', message: 'no-space' })).not.toThrow();
    // In-memory buffer still serves the entry for the session.
    expect(getClientLogs()[0].message).toBe('no-space');
    setItemSpy.mockRestore();
  });

  it('retries after evicting the oldest entry (partial failure tolerated)', async () => {
    // First write fails (quota), subsequent writes succeed — the module must
    // evict the oldest entry and retry once rather than give up entirely.
    // Seed 2 prior entries so evicting the oldest KEEPS the new one. The mock
    // delegates to the real setItem on retry (a no-op mock would leave the
    // storage raw value stale — the buffer then lives only in memory).
    const old = Date.now() - 1000;
    localStorage.setItem(
      LOG_KEY,
      JSON.stringify([
        { ts: old, level: 'warn', message: 'old-1' },
        { ts: old, level: 'warn', message: 'old-2' },
      ]),
    );
    const realSetItem = Storage.prototype.setItem;
    let calls = 0;
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      calls++;
      if (calls <= 1) throw new Error('QuotaExceededError');
      return realSetItem.call(this, key, value);
    });
    const { logClientError, getClientLogs } = await import('../client-log');

    expect(() => logClientError({ level: 'error', message: 'evict-retry' })).not.toThrow();
    setItemSpy.mockRestore();
    const logs = getClientLogs();
    expect(logs).toHaveLength(2); // old-1 evicted, old-2 + the new entry survive
    expect(logs[1].message).toBe('evict-retry');
  });
});

describe('getClientLogs — lectura tolerante', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns [] when nothing was logged or the stored JSON is corrupt', async () => {
    const { getClientLogs } = await import('../client-log');
    expect(getClientLogs()).toEqual([]);

    localStorage.setItem(LOG_KEY, 'not-json{');
    expect(getClientLogs()).toEqual([]);
  });
});

describe('clearClientLogs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('empties the buffer and the storage key', async () => {
    const { logClientError, clearClientLogs, getClientLogs } = await import('../client-log');
    logClientError({ level: 'error', message: 'to-be-cleared' });

    clearClientLogs();

    expect(getClientLogs()).toEqual([]);
    expect(localStorage.getItem(LOG_KEY)).toBeNull();
  });
});

describe('exportClientLogs — cabecera de metadatos del dispositivo', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('wraps entries with device metadata: version, userAgent, onLine, language, timestamp', async () => {
    const { logClientError, exportClientLogs } = await import('../client-log');
    logClientError({ level: 'error', message: 'exported-entry' });

    const json = exportClientLogs('store-1');
    const parsed = JSON.parse(json) as {
      appVersion: string;
      device: { userAgent: string; onLine: boolean; language: string; timestamp: string };
      selectedStoreId?: string;
      entries: { message: string }[];
    };

    expect(parsed.appVersion).toBeTruthy();
    expect(parsed.device.userAgent).toBe(navigator.userAgent);
    expect(parsed.device.language).toBeTruthy();
    expect(typeof parsed.device.onLine).toBe('boolean');
    expect(typeof parsed.device.timestamp).toBe('string');
    expect(parsed.selectedStoreId).toBe('store-1');
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].message).toBe('exported-entry');
  });

  it('produces pretty-printed JSON (readable when shared)', async () => {
    const { logClientError, exportClientLogs } = await import('../client-log');
    logClientError({ level: 'error', message: 'pretty' });

    const json = exportClientLogs();
    expect(json).toContain('\n  ');
  });
});
