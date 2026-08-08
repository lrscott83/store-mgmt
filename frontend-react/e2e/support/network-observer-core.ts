import { E2E_API_URL } from './backend-url';

/**
 * D1 (design.md, `e2e-network-observer-core`): the machinery genuinely
 * identical between `network-observer.ts` and `login-network-observer.ts`
 * before this file existed — extracted verbatim, generic over the capture
 * shape `C`, and blind to rate-limit thresholds or error classes (REQ-4:
 * those stay in each observer's own module, never here).
 */

export type Outcome<C> = { kind: 'response'; capture: C } | { kind: 'failed'; message: string };

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

/**
 * Generic version of the one-shot deferred both observers use to let a
 * `waitFor*Request()` caller block until the FIRST matching request arrives,
 * or resolve immediately if it already has.
 */
export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

export interface OutcomeQueue<C> {
  /**
   * Delivers an outcome to exactly ONE consumer: a waiter if someone is
   * already blocked on `take()`, the internal queue otherwise. Never both.
   *
   * Doing both — queueing AND resolving every waiter — double-counts. The
   * waiter returns the outcome while a copy stays in the queue, so the NEXT
   * `take()` shifts that stale copy and returns immediately, and the
   * observer falls one response behind for the rest of the run.
   *
   * What that cost, historically (register.spec.ts, before this queue had a
   * name of its own): REQ-9's flood asserts the 429 the limiter answers
   * with. An early 429 is still caught while one behind, so this stayed
   * invisible for as long as the quota happened to be partly spent when the
   * spec started. Against a clean window the 429 lands on the LAST attempt,
   * being one behind loses it, and the spec reports "never observed a 429"
   * — accusing a limiter that had answered correctly. Verified 2026-08-07:
   * the trace showed POST register 429 while the loop reported none.
   */
  push(outcome: Outcome<C>): void;
  /** Resolves the next outcome — immediately if one is already queued,
   * otherwise waits for the next `push()`. */
  take(): Promise<Outcome<C>>;
}

export function createOutcomeQueue<C>(): OutcomeQueue<C> {
  const outcomes: Array<Outcome<C>> = [];
  const waiters: Array<(outcome: Outcome<C>) => void> = [];

  return {
    push(outcome: Outcome<C>): void {
      const waiter = waiters.shift();
      if (waiter) {
        waiter(outcome);
        return;
      }
      outcomes.push(outcome);
    },
    take(): Promise<Outcome<C>> {
      const queued = outcomes.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise<Outcome<C>>((resolve) => {
        waiters.push(resolve);
      });
    },
  };
}

/**
 * Matches a request's pathname against a fixed suffix —
 * `network-observer.ts`'s `isRegisterRequest` and
 * `login-network-observer.ts`'s `isLoginRequest`/`isMeRequest` all reduce to
 * this plus their own HTTP method check. Filtered by path, not host, on
 * purpose (design.md D1): this is what lets an observer also see a request
 * misdirected to the dev server, which is exactly the case the wrong-backend
 * diagnostic below needs to catch.
 */
export function matchesPathSuffix(url: string, suffix: string): boolean {
  try {
    return new URL(url).pathname.endsWith(suffix);
  } catch {
    return false;
  }
}

export type ObserverSubject = 'registro' | 'login' | 'tienda';

/**
 * The guard: every request must go to the backend this run actually asked
 * for (`E2E_API_URL`, `playwright.config.ts`), not wherever an
 * already-running dev server happened to be pointed at.
 *
 * This matters because of `reuseExistingServer: true`
 * (`playwright.config.ts`): it is kept `true` on purpose so the existing
 * specs keep running exactly as they do today — but the consequence is that
 * if a dev server was ALREADY running on :3333 before Playwright started,
 * Playwright reuses it as-is and the `API_URL` this config tries to inject
 * into `webServer.env` never reaches that process. The app then silently
 * talks to whatever backend that other dev server was configured for —
 * writing real rows there.
 *
 * `subject` is the ONE parameter that varies between the observers
 * (design.md D1) — the resulting text is byte-identical otherwise, the
 * `Parná` typo included.
 *
 * That typo is preserved deliberately, but NOT because a doc quotes it
 * literally: `e2e/README.md:69,99` paraphrases this message and elides the
 * clause the typo lives in. It is preserved because the S1-03 core
 * extraction was contractually byte-for-byte, and changing user-visible
 * copy inside a refactor is how a "pure" refactor stops being one. Fix it
 * on purpose or not at all.
 */
export function wrongBackendMessage(subject: ObserverSubject, actualUrl: string): string {
  return (
    `La petición de ${subject} salió a ${actualUrl}, pero el backend esperado para esta ` +
    `corrida es ${E2E_API_URL}. Esto pasa cuando ya había un dev server corriendo en ` +
    ':3333 ANTES de arrancar Playwright, con otro API_URL (por ejemplo, tu .env de ' +
    'desarrollo) — con reuseExistingServer:true, Playwright lo reutiliza tal cual está, y ' +
    'nunca llega a inyectarle el backend correcto. Parná ese dev server (Ctrl+C en su ' +
    'terminal) y volvé a correr la suite: Playwright va a levantar el suyo propio, ya ' +
    'apuntando al backend correcto.'
  );
}

/**
 * Message for a `requestfailed` event (backend unreachable) — identical
 * between both observers (`network-observer.ts:151-155` ≡
 * `login-network-observer.ts:211-216`, pre-refactor line numbers).
 */
export function backendUnreachableMessage(url: string, errorText: string): string {
  return (
    `The backend did not respond at ${url} (${errorText}). Start it with: ` +
    'dotnet run --project backend/src/SMCA.WebApi --launch-profile http'
  );
}

/**
 * Message for an unexpected 404 — identical between both observers
 * (`network-observer.ts:222-227` ≡ `login-network-observer.ts:294-299`,
 * pre-refactor line numbers).
 */
export function apiBaseMissingMessage(url: string): string {
  return (
    'API_URL points at the wrong base — is /api missing? (BaseApiController.cs:11). ' +
    `Expected something like http://localhost:5019/api. Got a 404 from ${url}.`
  );
}

/**
 * Message for `expectNoAttempt()`/`expectNoLoginAttempt()` — identical
 * structure between both observers, parametrized by the path suffix, the
 * observed count, the first offending URL, and the subject.
 */
export function expectNoAttemptMessage(params: {
  suffix: string;
  observedCount: number;
  firstUrl: string;
  subject: ObserverSubject;
}): string {
  const misdirected = !params.firstUrl.startsWith(E2E_API_URL);
  return (
    `Expected zero requests to a URL ending in ${params.suffix}, but observed ` +
    `${params.observedCount} (first: ${params.firstUrl}).` +
    (misdirected
      ? ` ${wrongBackendMessage(params.subject, params.firstUrl)}`
      : ' The client-side guard that should have blocked this submit did not run.')
  );
}

interface CaptureLike {
  status: number;
  url: string;
}

/**
 * `resolveCapture` — the order `failed → 429 → wrong origin → 404` is the
 * one place both `waitForResponse()`/`waitForLoginResponse()` agreed on
 * before this file existed (`network-observer.ts:199-229` ≡
 * `login-network-observer.ts:275-299`, pre-refactor line numbers). Receives
 * `rateLimitError` as a factory so the caller's own class
 * (`RegisterRateLimitError`/`LoginRateLimitError`, with its own threshold
 * text) gets constructed in ITS OWN module — this core never constructs or
 * imports either class (REQ-4).
 */
export function resolveCapture<C extends CaptureLike>(
  outcome: Outcome<C>,
  opts: { subject: ObserverSubject; rateLimitError: () => Error }
): C {
  if (outcome.kind === 'failed') {
    throw new Error(outcome.message);
  }

  const { capture } = outcome;

  if (capture.status === 429) {
    throw opts.rateLimitError();
  }

  // Defensive fallback: normally the guard on the 'request' event already
  // pushed a 'failed' outcome (consumed before this one) for any request
  // that did not go to E2E_API_URL. This only fires if a 'response' outcome
  // somehow arrived first — same message either way.
  if (!capture.url.startsWith(E2E_API_URL)) {
    throw new Error(wrongBackendMessage(opts.subject, capture.url));
  }

  if (capture.status === 404) {
    throw new Error(apiBaseMissingMessage(capture.url));
  }

  return capture;
}
