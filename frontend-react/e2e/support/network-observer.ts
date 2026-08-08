import type { Page, Request as PlaywrightRequest } from '@playwright/test';
import { E2E_API_URL } from './backend-url';
import {
  backendUnreachableMessage,
  createOutcomeQueue,
  expectNoAttemptMessage,
  matchesPathSuffix,
  resolveCapture,
  wrongBackendMessage,
  type Outcome,
} from './network-observer-core';

const REGISTER_PATH_SUFFIX = '/v1/auth/register';

export interface RegisterAttempt {
  url: string;
  postData: Record<string, unknown> | null;
}

export interface RegisterResponseCapture {
  status: number;
  bodyText: string;
  url: string;
}

/**
 * Thrown by `waitForResponse()` when the backend answers 429 (registration
 * quota exhausted — `RateLimitPolicies.cs:26-35`).
 *
 * register.spec.ts (the default suite) never expects this: it lets the error
 * propagate as the test failure, and that message IS the human-readable
 * diagnostic REQ-10 asks for, not a raw `expect(201).toBe(429)` mismatch.
 * register-rate-limit.spec.ts is the one spec that DOES expect a 429 — it
 * catches this specific class to know the limiter tripped, then asserts the
 * UI banner (design.md §9).
 *
 * Constructed HERE, never in `network-observer-core.ts` — the core receives
 * a `rateLimitError` factory instead, so this class's identity (and its
 * 10/10min threshold text) stays entirely owned by this module
 * (`e2e-network-observer-core` REQ-4).
 */
export class RegisterRateLimitError extends Error {}

export interface RegisterNetworkObserver {
  /** All POST .../v1/auth/register requests observed so far, in order. */
  attempts(): RegisterAttempt[];
  /**
   * Asserts zero requests were observed. Call this AFTER awaiting the UI
   * effect that should have blocked the submit (design.md §3) — the
   * validation branch in register.tsx returns before ever calling
   * `authHttpService.register`, so once that effect is visible the decision
   * not to call the API has already been made; there is no race to wait out.
   */
  expectNoAttempt(): void;
  /**
   * Resolves with the next (or first already-observed) register response.
   * Diagnoses known environment failures BEFORE returning, so a test that
   * merely wanted a 201 fails with a readable message instead of a
   * confusing status mismatch or a silent timeout.
   */
  waitForResponse(): Promise<RegisterResponseCapture>;
}

function isRegisterRequest(method: string, url: string): boolean {
  if (method !== 'POST') return false;
  return matchesPathSuffix(url, REGISTER_PATH_SUFFIX);
}

export function installRegisterNetworkObserver(page: Page): RegisterNetworkObserver {
  const attempts: RegisterAttempt[] = [];
  const queue = createOutcomeQueue<RegisterResponseCapture>();

  page.on('request', (request: PlaywrightRequest) => {
    if (!isRegisterRequest(request.method(), request.url())) return;
    let postData: Record<string, unknown> | null = null;
    try {
      postData = request.postDataJSON() as Record<string, unknown> | null;
    } catch {
      postData = null;
    }
    attempts.push({ url: request.url(), postData });

    // The guard (see wrongBackendMessage() in network-observer-core.ts).
    // Pushed as a 'failed' outcome as soon as the request is observed —
    // before any response arrives — so `waitForResponse()` throws this
    // instead of whatever the wrong backend happens to answer.
    if (!request.url().startsWith(E2E_API_URL)) {
      queue.push({ kind: 'failed', message: wrongBackendMessage('registro', request.url()) });
    }
  });

  page.on('requestfailed', (request) => {
    if (!isRegisterRequest(request.method(), request.url())) return;
    const errorText = request.failure()?.errorText ?? 'unknown network error';
    queue.push({
      kind: 'failed',
      message: backendUnreachableMessage(request.url(), errorText),
    });
  });

  page.on('response', (response) => {
    if (!isRegisterRequest(response.request().method(), response.url())) return;
    // Read the body IMMEDIATELY (design.md §5): a successful registration
    // (A8) navigates to /login right after the 201 resolves, and a Response
    // read after navigation risks finding its body already discarded.
    // Capture the text now; `waitForResponse()` only ever reads what was
    // already captured here.
    void response
      .text()
      .catch(() => '')
      .then((bodyText) => {
        queue.push({
          kind: 'response',
          capture: { status: response.status(), bodyText, url: response.url() },
        });
      });
  });

  return {
    attempts: () => attempts.map((attempt) => ({ ...attempt })),

    expectNoAttempt: () => {
      if (attempts.length === 0) return;
      const first = attempts[0];
      throw new Error(
        expectNoAttemptMessage({
          suffix: REGISTER_PATH_SUFFIX,
          observedCount: attempts.length,
          firstUrl: first.url,
          subject: 'registro',
        })
      );
    },

    waitForResponse: async () => {
      const outcome: Outcome<RegisterResponseCapture> = await queue.take();
      return resolveCapture(outcome, {
        subject: 'registro',
        rateLimitError: () =>
          new RegisterRateLimitError(
            'Registration quota exhausted for this IP: 10 registrations per 10-minute window ' +
              '(RateLimitPolicies.cs:26-35). Wait up to 10 minutes — the limiter releases permits ' +
              'at roughly 1 per minute (SegmentsPerWindow=10). This failure does NOT indicate an ' +
              'app defect.'
          ),
      });
    },
  };
}
