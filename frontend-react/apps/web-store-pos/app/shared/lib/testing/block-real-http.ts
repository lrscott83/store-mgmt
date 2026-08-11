// Test-only. Makes a real HTTP request from a unit test impossible, and — more
// importantly — impossible to miss.
//
// Why this exists: `auth-store.ts`'s cold-boot hydration fires an unawaited
// `/me` request. Under vitest there is no backend, so Vite's own middleware
// answers 404 — the exact status `isSessionRejection` treats as "the server
// says this session is over", because the backend returns 404 for
// AccountInactive. The store then logs itself out, mid-test, at whatever
// moment that response happens to land. The result is not a test that fails;
// it is a test that fails SOMETIMES, in a different file than the one that
// made the call.
//
// Blocking the request is only half the job: application code catches its own
// network errors (correctly — offline-first is the product), so a thrown
// blocker error is swallowed and the test still passes silently. That is why
// every attempt is also RECORDED. `vitest.setup.ts` drains the recording after
// each test and fails it there, whether or not the error survived.

export interface HttpScope {
  fetch: typeof fetch;
  XMLHttpRequest: typeof XMLHttpRequest;
}

export interface HttpBlocker {
  /** Returns the attempts made since the last call, and clears them. */
  takeAttempts(): string[];
  /** Restores the original `fetch` and `XMLHttpRequest`. */
  uninstall(): void;
}

let reportingSuppressed = false;

/**
 * Opts the CALLING TEST FILE out of the per-test "this test made an unmocked
 * request" failure. Requests are still blocked — this only silences the
 * report.
 *
 * There is exactly one shape that earns this: a file whose subject is
 * fire-and-forget by design. `auth-store.ts`'s `initialize()` deliberately
 * does not await its `/me` refresh, so the tests that pin its synchronous
 * behaviour leave a tail behind that resolves in whatever test happens to be
 * running next. The report names that later test, which did nothing wrong, and
 * no amount of mocking in the guilty test can change where the tail lands.
 *
 * Do NOT reach for this because a test is inconvenient to mock. The blocking
 * is what protects correctness; the report is what finds new offenders.
 */
export function allowUnmockedHttpReporting(): void {
  reportingSuppressed = true;
}

export function isReportingSuppressed(): boolean {
  return reportingSuppressed;
}

function blockedError(method: string, url: string): Error {
  return new Error(
    `unmocked HTTP request from a unit test: ${method} ${url}\n` +
      'Unit tests must not reach the network. There is no backend under vitest, so this ' +
      'request gets whatever the dev server answers (usually a 404) — and a 404 from /me is ' +
      'a real session verdict this app acts on, which ends the session mid-test.\n' +
      "Mock the module that issues it, e.g. vi.mock('~/shared/lib/http/auth-http-service', ...) — " +
      'see app/shared/lib/stores/__tests__/auth-store.test.ts for the established shape.'
  );
}

/**
 * Replaces `scope.fetch` and `scope.XMLHttpRequest` with recording versions
 * that refuse to reach the network. Takes its scope as an argument (defaulting
 * to the global one) so its own test can exercise it against a fake without
 * unpatching the real globals every other test file depends on.
 */
export function installHttpBlocker(scope: HttpScope = globalThis as unknown as HttpScope): HttpBlocker {
  const attempts: string[] = [];
  const originalFetch = scope.fetch;
  const OriginalXhr = scope.XMLHttpRequest;

  scope.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const url = input instanceof Request ? input.url : String(input);
    attempts.push(`${method} ${url}`);
    return Promise.reject(blockedError(method, url));
  }) as typeof fetch;

  // Subclassing rather than patching the prototype: axios uses XHR under
  // jsdom, and a subclass leaves the original prototype untouched for anything
  // that captured it before we ran.
  class BlockedXhr extends (OriginalXhr as unknown as { new (): XMLHttpRequest }) {
    private blockedMethod = 'GET';
    private blockedUrl = '';

    open(method: string, url: string | URL, ...rest: unknown[]) {
      this.blockedMethod = method;
      this.blockedUrl = String(url);
      // Still call through: axios reads `readyState` and friends, and an
      // `open()` that did nothing would fail in a confusing, unrelated way.
      return (super.open as (...args: unknown[]) => void)(method, url, ...rest);
    }

    send() {
      attempts.push(`${this.blockedMethod} ${this.blockedUrl}`);
      throw blockedError(this.blockedMethod, this.blockedUrl);
    }
  }

  scope.XMLHttpRequest = BlockedXhr as unknown as typeof XMLHttpRequest;

  return {
    takeAttempts: () => attempts.splice(0, attempts.length),
    uninstall: () => {
      scope.fetch = originalFetch;
      scope.XMLHttpRequest = OriginalXhr;
    },
  };
}
