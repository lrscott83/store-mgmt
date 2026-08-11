import { describe, expect, it, vi } from 'vitest';
import {
  allowUnmockedHttpReporting,
  installHttpBlocker,
  isReportingSuppressed,
  type HttpScope,
} from './block-real-http';

// The blocker is installed once for the whole suite by `vitest.setup.ts`. It
// takes its scope as an argument precisely so THIS file can exercise it
// against a fake one, without unpatching the real globals the rest of the
// suite is relying on.
function makeScope(): HttpScope & { sentUrls: string[] } {
  const sentUrls: string[] = [];
  class FakeXHR {
    private url = '';
    open(_method: string, url: string) {
      this.url = url;
    }
    send() {
      sentUrls.push(this.url);
    }
  }
  return {
    fetch: vi.fn(async () => new Response('ok')),
    XMLHttpRequest: FakeXHR as unknown as HttpScope['XMLHttpRequest'],
    sentUrls,
  };
}

describe('installHttpBlocker', () => {
  it('rejects a fetch instead of letting it reach the network', async () => {
    const scope = makeScope();
    const blocker = installHttpBlocker(scope);

    await expect(scope.fetch('https://api.test/v1/auth/me')).rejects.toThrow(/unmocked HTTP/i);
    expect(scope.sentUrls).toEqual([]);
    blocker.uninstall();
  });

  it('throws on an XHR send instead of letting it reach the network', () => {
    const scope = makeScope();
    const blocker = installHttpBlocker(scope);

    const xhr = new scope.XMLHttpRequest();
    xhr.open('GET', 'https://api.test/v1/auth/me');

    expect(() => xhr.send()).toThrow(/unmocked HTTP/i);
    expect(scope.sentUrls).toEqual([]);
    blocker.uninstall();
  });

  it('records every attempt with its method and url, so a swallowed error still fails the test', async () => {
    const scope = makeScope();
    const blocker = installHttpBlocker(scope);

    await scope.fetch('https://api.test/v1/auth/me').catch(() => undefined);
    const xhr = new scope.XMLHttpRequest();
    xhr.open('POST', 'https://api.test/v1/auth/login');
    try {
      xhr.send();
    } catch {
      // the app under test swallows this — the recorded attempt is what remains
    }

    expect(blocker.takeAttempts()).toEqual([
      'GET https://api.test/v1/auth/me',
      'POST https://api.test/v1/auth/login',
    ]);
    blocker.uninstall();
  });

  it('empties the recorded attempts once taken, so one test never fails the next', async () => {
    const scope = makeScope();
    const blocker = installHttpBlocker(scope);

    await scope.fetch('https://api.test/v1/auth/me').catch(() => undefined);
    blocker.takeAttempts();

    expect(blocker.takeAttempts()).toEqual([]);
    blocker.uninstall();
  });

  // Kept last on purpose: the flag is module-scoped, so once this runs, the
  // per-test report is off for the rest of THIS file. Harmless — nothing here
  // reaches the network — but it would mask a later test that did.
  it('keeps reporting on until a file explicitly opts out, and blocks either way', async () => {
    expect(isReportingSuppressed()).toBe(false);

    allowUnmockedHttpReporting();

    expect(isReportingSuppressed()).toBe(true);
    const scope = makeScope();
    const blocker = installHttpBlocker(scope);
    await expect(scope.fetch('https://api.test/v1/auth/me')).rejects.toThrow(/unmocked HTTP/i);
    expect(scope.sentUrls).toEqual([]);
    blocker.uninstall();
  });

  it('restores the original fetch and XMLHttpRequest on uninstall', async () => {
    const scope = makeScope();
    const originalFetch = scope.fetch;
    const originalXhr = scope.XMLHttpRequest;

    installHttpBlocker(scope).uninstall();

    expect(scope.fetch).toBe(originalFetch);
    expect(scope.XMLHttpRequest).toBe(originalXhr);
    const xhr = new scope.XMLHttpRequest();
    xhr.open('GET', 'https://api.test/v1/auth/me');
    xhr.send();
    expect(scope.sentUrls).toEqual(['https://api.test/v1/auth/me']);
  });
});
