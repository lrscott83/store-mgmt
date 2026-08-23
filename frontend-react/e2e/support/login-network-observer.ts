import type { Page, Request as PlaywrightRequest } from '@playwright/test';
import { E2E_API_URL } from './backend-url';
import {
  backendUnreachableMessage,
  createDeferred,
  createOutcomeQueue,
  expectNoAttemptMessage,
  matchesPathSuffix,
  resolveCapture,
  wrongBackendMessage,
  type Deferred,
  type Outcome,
} from './network-observer-core';

// Debt PAID (was: "Duplicated from network-observer.ts on purpose... extract
// a shared core when a THIRD observer appears (rule of three)" at the old
// local `wrongBackendMessage()` in this file) — see
// `network-observer-core.ts` for the shared implementation both this module
// and `network-observer.ts` now import.
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
 * Verified trap #2: these are the LOGIN thresholds — 15 attempts per minute,
 * sliding window of 3 segments (raised 15 -> 30 on 2026-08-23) — NOT
 * `RegisterPolicy`'s 50/10min/10. Never copy the sibling's constants into
 * this file.
 *
 * Constructed HERE, never in `network-observer-core.ts` — same reasoning as
 * `RegisterRateLimitError` in `network-observer.ts` (`e2e-network-observer-core`
 * REQ-4): the core receives a `rateLimitError` factory instead, so this
 * class's identity and its own 15/1min threshold text stay owned by this
 * module alone, never merged with the register sibling's.
 */
export class LoginRateLimitError extends Error {}

type EventKind = 'login' | 'me';
type EventPhase = 'request' | 'response';

interface ObservedEvent {
  kind: EventKind;
  phase: EventPhase;
  at: number;
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
  /**
   * S1-04. Cuenta EXACTA de `GET .../v1/auth/me` observados en este test.
   * Absoluto, sin reset (design.md D2): restaurar una persona cuesta 0 /me
   * (session.ts:135-143 + auth-store.ts:125).
   */
  expectMeRequestCount(expected: number): void;
}

function isLoginRequest(method: string, url: string): boolean {
  if (method !== 'POST') return false;
  return matchesPathSuffix(url, LOGIN_PATH_SUFFIX);
}

function isMeRequest(method: string, url: string): boolean {
  if (method !== 'GET') return false;
  return matchesPathSuffix(url, ME_PATH_SUFFIX);
}

function isProductApiRequest(url: string): boolean {
  if (!url.startsWith(E2E_API_URL)) return false;
  try {
    return PRODUCT_API_PATTERN.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function installLoginNetworkObserver(page: Page): LoginNetworkObserver {
  const events: ObservedEvent[] = [];
  const loginAttempts: Array<{ url: string }> = [];
  const productApiRequests: Array<{ url: string }> = [];
  const queue = createOutcomeQueue<LoginResponseCapture>();
  let loginRequestDeferred: Deferred<void> | null = null;
  let meRequestDeferred: Deferred<void> | null = null;
  let loginRequestSeen = false;
  let meRequestSeen = false;

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

      // Guard (see wrongBackendMessage() in network-observer-core.ts):
      // pushed as soon as the request is observed, before any response
      // arrives, so waitForLoginResponse() throws this instead of whatever
      // the wrong backend happens to answer.
      if (!url.startsWith(E2E_API_URL)) {
        queue.push({ kind: 'failed', message: wrongBackendMessage('login', url) });
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
    queue.push({
      kind: 'failed',
      message: backendUnreachableMessage(url, errorText),
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
      // network-observer.ts:101-117): a successful login navigates right
      // after this resolves, and a body read after navigation risks finding
      // it already discarded. Only the capture is deferred — never the
      // timestamp.
      void response
        .text()
        .catch(() => '')
        .then((bodyText) => {
          queue.push({
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
      const outcome: Outcome<LoginResponseCapture> = await queue.take();
      return resolveCapture(outcome, {
        subject: 'login',
        rateLimitError: () =>
          new LoginRateLimitError(
            'Login quota exhausted for this IP: 40 login attempts per 1-minute sliding window, ' +
              '3 segments (RateLimitPolicies.cs:15-24, LoginPolicy, PermitLimit=40). Wait roughly ' +
              'a minute — the window releases permits gradually, not all at once. This failure ' +
              'does NOT indicate an app defect.'
          ),
      });
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
      throw new Error(
        expectNoAttemptMessage({
          suffix: LOGIN_PATH_SUFFIX,
          observedCount: loginAttempts.length,
          firstUrl: first.url,
          subject: 'login',
        })
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

    expectMeRequestCount: (expected: number) => {
      const meRequests = events.filter((e) => e.kind === 'me' && e.phase === 'request');
      if (meRequests.length !== expected) {
        throw new Error(
          `Expected exactly ${expected} GET .../v1/auth/me request(s), observed ${meRequests.length}.`
        );
      }
    },
  };
}
