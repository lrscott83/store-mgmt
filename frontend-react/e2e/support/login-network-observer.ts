import type { Page, Request as PlaywrightRequest } from '@playwright/test';
import { E2E_API_URL } from './backend-url';

const LOGIN_PATH_SUFFIX = '/v1/auth/login';
const ME_PATH_SUFFIX = '/v1/auth/me';
// D5 (REQ-13): scoped to product-service traffic, not "any other request" —
// login.tsx:136 arms the usage tracker on every successful login, and that
// tracker may fire its own POST during the same navigation. Blocking on
// "nothing else happened" would fail D5 for telemetry D5 never claims
// anything about.
const PRODUCT_API_PATTERN = /product/i;

export interface LoginResponseCapture {
  status: number;
  bodyText: string;
  url: string;
}

/**
 * Thrown by `waitForLoginResponse()` when the backend answers 429 — login
 * quota exhausted (`RateLimitPolicies.cs:15-24`, `LoginPolicy`).
 *
 * Verified trap #2: these are the LOGIN thresholds — 5 attempts per minute,
 * sliding window of 3 segments — NOT `RegisterPolicy`'s 10/10min/10. Never
 * copy the sibling's constants into this file.
 */
export class LoginRateLimitError extends Error {}

type EventKind = 'login' | 'me';
type EventPhase = 'request' | 'response';

interface ObservedEvent {
  kind: EventKind;
  phase: EventPhase;
  at: number;
}

type Outcome =
  | { kind: 'response'; capture: LoginResponseCapture }
  | { kind: 'failed'; message: string };

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

export interface LoginNetworkObserver {
  /**
   * Resolves once the `POST .../v1/auth/login` request has been observed
   * (already-observed requests resolve immediately). A1's FIRST sample
   * anchors here, never on a timeout.
   */
  waitForLoginRequest(): Promise<void>;
  /**
   * Resolves once the `GET .../v1/auth/me` request has been observed. A1's
   * SECOND sample anchors here.
   */
  waitForMeRequest(): Promise<void>;
  /**
   * Resolves with the login response body, captured at the moment the
   * `response` event fired — never re-read after navigation (design.md §4,
   * same reasoning as the register sibling's `waitForResponse()`).
   */
  waitForLoginResponse(): Promise<LoginResponseCapture>;
  /**
   * REQ-2 (A2). Asserts the CAUSAL claim, not just "both happened": exactly
   * one login request, at least one `/me` request, and the `/me` request's
   * timestamp is >= the login response's timestamp — auth-store.ts:197-230
   * only calls `getUserByToken()` (which fires `/me`) after the login
   * response has already been handled.
   */
  expectLoginThenMe(): void;
  /**
   * REQ-4/REQ-5 (A4/A5). Call this AFTER awaiting the UI effect that should
   * have blocked the submit — login.tsx's validation (:94-98) and offline
   * (:124-127) branches both `return` before calling anything, so once that
   * effect is visible the decision not to call is already made.
   */
  expectNoLoginAttempt(): void;
  /**
   * REQ-13 (D5). Asserts zero requests observed whose pathname matches
   * `/product/i` under `E2E_API_URL` — resolveUserHomePath resolves from the
   * offline product service, never the API.
   */
  expectNoProductApiCall(): void;
}

function isLoginRequest(method: string, url: string): boolean {
  if (method !== 'POST') return false;
  try {
    return new URL(url).pathname.endsWith(LOGIN_PATH_SUFFIX);
  } catch {
    return false;
  }
}

function isMeRequest(method: string, url: string): boolean {
  if (method !== 'GET') return false;
  try {
    return new URL(url).pathname.endsWith(ME_PATH_SUFFIX);
  } catch {
    return false;
  }
}

function isProductApiRequest(url: string): boolean {
  if (!url.startsWith(E2E_API_URL)) return false;
  try {
    return PRODUCT_API_PATTERN.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * Duplicated from `network-observer.ts:87-97` on purpose (design.md §4,
 * §9) — modifying that file would put two EXISTING specs (`register.spec.ts`,
 * `register-rate-limit.spec.ts`) at regression risk for a cosmetic DRY gain.
 * Debt is declared: extract a shared core when a THIRD observer appears
 * (rule of three), gated on `register.spec.ts` staying green.
 */
function wrongBackendMessage(actualUrl: string): string {
  return (
    `La petición de login salió a ${actualUrl}, pero el backend esperado para esta corrida ` +
    `es ${E2E_API_URL}. Esto pasa cuando ya había un dev server corriendo en :3333 ANTES de ` +
    "arrancar Playwright, con otro API_URL (por ejemplo, tu .env de desarrollo) — con " +
    'reuseExistingServer:true, Playwright lo reutiliza tal cual está, y nunca llega a ' +
    'inyectarle el backend correcto. Parná ese dev server (Ctrl+C en su terminal) y volvé a ' +
    'correr la suite: Playwright va a levantar el suyo propio, ya apuntando al backend correcto.'
  );
}

export function installLoginNetworkObserver(page: Page): LoginNetworkObserver {
  const events: ObservedEvent[] = [];
  const loginAttempts: Array<{ url: string }> = [];
  const productApiRequests: Array<{ url: string }> = [];
  const outcomes: Outcome[] = [];
  let waiters: Array<(outcome: Outcome) => void> = [];
  let loginRequestDeferred: Deferred<void> | null = null;
  let meRequestDeferred: Deferred<void> | null = null;
  let loginRequestSeen = false;
  let meRequestSeen = false;

  // An outcome is delivered to exactly ONE consumer: a waiter if someone is
  // already blocked on it, the queue otherwise. Never both.
  //
  // Doing both — queueing AND resolving every waiter — double-counts. The waiter
  // returns the outcome while a copy stays in the queue, so the NEXT
  // waitForLoginResponse() shifts that stale copy and returns immediately, and
  // the observer falls one response behind for the rest of the run. In a loop
  // that only cares about the LAST response, being one behind loses it entirely.
  function pushOutcome(outcome: Outcome): void {
    const waiter = waiters.shift();
    if (waiter) {
      waiter(outcome);
      return;
    }
    outcomes.push(outcome);
  }

  page.on('request', (request: PlaywrightRequest) => {
    const method = request.method();
    const url = request.url();

    if (isProductApiRequest(url)) {
      productApiRequests.push({ url });
    }

    if (isLoginRequest(method, url)) {
      events.push({ kind: 'login', phase: 'request', at: Date.now() });
      loginAttempts.push({ url });
      loginRequestSeen = true;
      loginRequestDeferred?.resolve();

      // Guard (see wrongBackendMessage() above): pushed as soon as the
      // request is observed, before any response arrives, so
      // waitForLoginResponse() throws this instead of whatever the wrong
      // backend happens to answer.
      if (!url.startsWith(E2E_API_URL)) {
        pushOutcome({ kind: 'failed', message: wrongBackendMessage(url) });
      }
      return;
    }

    if (isMeRequest(method, url)) {
      events.push({ kind: 'me', phase: 'request', at: Date.now() });
      meRequestSeen = true;
      meRequestDeferred?.resolve();
    }
  });

  page.on('requestfailed', (request) => {
    const method = request.method();
    const url = request.url();
    if (!isLoginRequest(method, url) && !isMeRequest(method, url)) return;
    const errorText = request.failure()?.errorText ?? 'unknown network error';
    pushOutcome({
      kind: 'failed',
      message:
        `The backend did not respond at ${url} (${errorText}). Start it with: ` +
        'dotnet run --project backend/src/SMCA.WebApi --launch-profile http',
    });
  });

  page.on('response', (response) => {
    const method = response.request().method();
    const url = response.url();

    if (isLoginRequest(method, url)) {
      // Record the arrival SYNCHRONOUSLY, before the body is drained. `at` must
      // mark when the response reached the browser — the instant the app can
      // resume and fire GET /me — not when this process finished reading it.
      // Stamping inside the .then() below charged the body read to the response
      // and made a correctly-ordered flow look inverted by a few milliseconds:
      // /me went out (stamped on arrival) while the login response was still
      // being drained (stamped on completion). Pushing the event here also keeps
      // `events` in true delivery order, which expectLoginThenMe() relies on.
      events.push({ kind: 'login', phase: 'response', at: Date.now() });

      // The body still has to be read IMMEDIATELY (same reasoning as
      // network-observer.ts:141-157): a successful login navigates right after
      // this resolves, and a body read after navigation risks finding it already
      // discarded. Only the capture is deferred — never the timestamp.
      void response
        .text()
        .catch(() => '')
        .then((bodyText) => {
          pushOutcome({
            kind: 'response',
            capture: { status: response.status(), bodyText, url },
          });
        });
      return;
    }

    if (isMeRequest(method, url)) {
      events.push({ kind: 'me', phase: 'response', at: Date.now() });
    }
  });

  return {
    waitForLoginRequest: async () => {
      if (loginRequestSeen) return;
      loginRequestDeferred ??= createDeferred<void>();
      await loginRequestDeferred.promise;
    },

    waitForMeRequest: async () => {
      if (meRequestSeen) return;
      meRequestDeferred ??= createDeferred<void>();
      await meRequestDeferred.promise;
    },

    waitForLoginResponse: async () => {
      const outcome =
        outcomes.shift() ??
        (await new Promise<Outcome>((resolve) => {
          waiters.push(resolve);
        }));

      if (outcome.kind === 'failed') {
        throw new Error(outcome.message);
      }

      const { capture } = outcome;

      if (capture.status === 429) {
        throw new LoginRateLimitError(
          'Login quota exhausted for this IP: 5 login attempts per 1-minute sliding window, ' +
            '3 segments (RateLimitPolicies.cs:15-24, LoginPolicy). Wait roughly a minute — the ' +
            'window releases permits gradually, not all at once. This failure does NOT indicate ' +
            'an app defect.'
        );
      }

      if (!capture.url.startsWith(E2E_API_URL)) {
        throw new Error(wrongBackendMessage(capture.url));
      }

      if (capture.status === 404) {
        throw new Error(
          'API_URL points at the wrong base — is /api missing? (BaseApiController.cs:11). ' +
            `Expected something like http://localhost:5019/api. Got a 404 from ${capture.url}.`
        );
      }

      return capture;
    },

    expectLoginThenMe: () => {
      const loginRequests = events.filter((e) => e.kind === 'login' && e.phase === 'request');
      const loginResponses = events.filter((e) => e.kind === 'login' && e.phase === 'response');
      const meRequests = events.filter((e) => e.kind === 'me' && e.phase === 'request');

      if (loginRequests.length !== 1) {
        throw new Error(
          `Expected exactly one POST .../v1/auth/login, observed ${loginRequests.length}.`
        );
      }
      if (loginResponses.length !== 1) {
        throw new Error(
          `Expected exactly one response for POST .../v1/auth/login, observed ${loginResponses.length}.`
        );
      }
      if (meRequests.length === 0) {
        throw new Error('Expected at least one GET .../v1/auth/me, observed none.');
      }

      const loginResponse = loginResponses[0];
      const firstMeRequest = meRequests[0];
      // The causal claim, not merely "both occurred" (design.md §4): /me
      // must start on or after the login response arrived —
      // auth-store.ts:197 awaits the login response, writes AUTH_MODEL, and
      // ONLY THEN calls getUserByToken() (:230), which fires GET /v1/auth/me.
      if (firstMeRequest.at < loginResponse.at) {
        throw new Error(
          `GET .../v1/auth/me started at ${firstMeRequest.at}, before the login response ` +
            `arrived at ${loginResponse.at}. Expected /me to start AFTER the login response, ` +
            'not merely at some point during the flow (auth-store.ts:197,230).'
        );
      }
    },

    expectNoLoginAttempt: () => {
      if (loginAttempts.length === 0) return;
      const first = loginAttempts[0];
      const misdirected = !first.url.startsWith(E2E_API_URL);
      throw new Error(
        `Expected zero requests to a URL ending in ${LOGIN_PATH_SUFFIX}, but observed ` +
          `${loginAttempts.length} (first: ${first.url}).` +
          (misdirected
            ? ` ${wrongBackendMessage(first.url)}`
            : ' The client-side guard that should have blocked this submit did not run.')
      );
    },

    expectNoProductApiCall: () => {
      if (productApiRequests.length === 0) return;
      const urls = productApiRequests.map((r) => r.url).join(', ');
      throw new Error(
        `Expected zero requests matching /product/i under ${E2E_API_URL}, but observed ` +
          `${productApiRequests.length}: ${urls}. resolveUserHomePath must resolve from the ` +
          'offline product service, never the API (user-home.ts:2,24).'
      );
    },
  };
}
