import type { Page, Request as PlaywrightRequest } from '@playwright/test';

const REGISTER_PATH_SUFFIX = '/v1/auth/register';

// The origin the SPA dev server itself runs on (playwright.config.ts
// `use.baseURL`). If a register POST resolves HERE instead of the backend,
// `API_URL` was never picked up — the app's own baseURL fell back to `''`
// (api-client.ts:21) and the relative path resolved against the page's own
// origin. Design.md §6, diagnostic 3.
const DEV_SERVER_ORIGIN = 'http://localhost:3333';

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
      const misdirected = new URL(first.url).origin === DEV_SERVER_ORIGIN;
      throw new Error(
        `Expected zero requests to a URL ending in ${REGISTER_PATH_SUFFIX}, but observed ` +
          `${attempts.length} (first: ${first.url}).` +
          (misdirected
            ? ' API_URL is not configured: the request went to the dev server, not the backend. ' +
              'Copy frontend-react/.env.example to frontend-react/.env.'
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

      if (new URL(capture.url).origin === DEV_SERVER_ORIGIN) {
        throw new Error(
          'API_URL is not configured: the register response came from the dev server, not the ' +
            'backend. Copy frontend-react/.env.example to frontend-react/.env.'
        );
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
