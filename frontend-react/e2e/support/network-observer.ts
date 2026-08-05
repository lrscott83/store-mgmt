import type { Page, Request as PlaywrightRequest } from '@playwright/test';
import { E2E_API_URL } from './backend-url';

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
 */
export class RegisterRateLimitError extends Error {}

type Outcome =
  | { kind: 'response'; capture: RegisterResponseCapture }
  | { kind: 'failed'; message: string };

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
  try {
    // Filtered by path, not host, on purpose (design.md §3): this is what
    // lets the observer also see a request misdirected to the dev server,
    // which is exactly the case diagnostic 3 needs to catch.
    return new URL(url).pathname.endsWith(REGISTER_PATH_SUFFIX);
  } catch {
    return false;
  }
}

/**
 * The guard: every register request must go to the backend this run
 * actually asked for (`E2E_API_URL`, `playwright.config.ts`), not wherever an
 * already-running dev server happened to be pointed at.
 *
 * This matters because of `reuseExistingServer: true`
 * (`playwright.config.ts`): it is kept `true` on purpose so the two existing
 * specs (`smoke.spec.ts`, `api-health.spec.ts`) keep running exactly as they
 * do today — but the consequence is that if a dev server was ALREADY running
 * on :3333 before Playwright started, Playwright reuses it as-is and the
 * `API_URL` this config tries to inject into `webServer.env` never reaches
 * that process. The app then silently talks to whatever backend that other
 * dev server was configured for — writing real Owner+Store rows there.
 *
 * Deliberately does not need `page.route()` to enforce anything (design.md
 * §3 already rejected that mechanism for a different reason): this only
 * OBSERVES the request that already left and fails loud if its destination
 * is wrong. Only applies to requests that actually happened — a
 * client-validation test that makes no request (`expectNoAttempt()`) is
 * untouched by this check.
 */
function wrongBackendMessage(actualUrl: string): string {
  return (
    `La petición de registro salió a ${actualUrl}, pero el backend esperado para esta ` +
    `corrida es ${E2E_API_URL}. Esto pasa cuando ya había un dev server corriendo en ` +
    ':3333 ANTES de arrancar Playwright, con otro API_URL (por ejemplo, tu .env de ' +
    'desarrollo) — con reuseExistingServer:true, Playwright lo reutiliza tal cual está, y ' +
    'nunca llega a inyectarle el backend correcto. Parná ese dev server (Ctrl+C en su ' +
    'terminal) y volvé a correr la suite: Playwright va a levantar el suyo propio, ya ' +
    'apuntando al backend correcto.'
  );
}

export function installRegisterNetworkObserver(page: Page): RegisterNetworkObserver {
  const attempts: RegisterAttempt[] = [];
  const outcomes: Outcome[] = [];
  let waiters: Array<(outcome: Outcome) => void> = [];

  function pushOutcome(outcome: Outcome): void {
    outcomes.push(outcome);
    const pending = waiters;
    waiters = [];
    pending.forEach((resolve) => resolve(outcome));
  }

  page.on('request', (request: PlaywrightRequest) => {
    if (!isRegisterRequest(request.method(), request.url())) return;
    let postData: Record<string, unknown> | null = null;
    try {
      postData = request.postDataJSON() as Record<string, unknown> | null;
    } catch {
      postData = null;
    }
    attempts.push({ url: request.url(), postData });

    // The guard (see wrongBackendMessage() above). Pushed as a 'failed'
    // outcome as soon as the request is observed — before any response
    // arrives — so `waitForResponse()` throws this instead of whatever the
    // wrong backend happens to answer.
    if (!request.url().startsWith(E2E_API_URL)) {
      pushOutcome({ kind: 'failed', message: wrongBackendMessage(request.url()) });
    }
  });

  page.on('requestfailed', (request) => {
    if (!isRegisterRequest(request.method(), request.url())) return;
    const errorText = request.failure()?.errorText ?? 'unknown network error';
    pushOutcome({
      kind: 'failed',
      message:
        `The backend did not respond at ${request.url()} (${errorText}). Start it with: ` +
        'dotnet run --project backend/src/SMCA.WebApi --launch-profile http',
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
        pushOutcome({
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
      const misdirected = !first.url.startsWith(E2E_API_URL);
      throw new Error(
        `Expected zero requests to a URL ending in ${REGISTER_PATH_SUFFIX}, but observed ` +
          `${attempts.length} (first: ${first.url}).` +
          (misdirected
            ? ` ${wrongBackendMessage(first.url)}`
            : ' The client-side guard that should have blocked this submit did not run.')
      );
    },

    waitForResponse: async () => {
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
        throw new RegisterRateLimitError(
          'Registration quota exhausted for this IP: 10 registrations per 10-minute window ' +
            '(RateLimitPolicies.cs:26-35). Wait up to 10 minutes — the limiter releases permits ' +
            'at roughly 1 per minute (SegmentsPerWindow=10). This failure does NOT indicate an ' +
            'app defect.'
        );
      }

      // Defensive fallback: normally the guard on the 'request' event above
      // already pushed a 'failed' outcome (consumed before this one) for any
      // request that did not go to E2E_API_URL. This only fires if a
      // 'response' outcome somehow arrived first — same message either way.
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
  };
}
