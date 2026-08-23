import { test, expect } from './support/test';
import { LoginPage } from './support/login-page';
import { newTestIdentity } from './support/identity';
import { LoginRateLimitError } from './support/login-network-observer';

// `AUTH.TOO_MANY_ATTEMPTS` at es.ts:85 — NOT `REGISTRATION.TOO_MANY_ATTEMPTS`
// at es.ts:128, which is a different key with different copy.
const TOO_MANY_ATTEMPTS_TEXT = 'Demasiados intentos. Esperá un momento antes de volver a intentar.';

// Verified trap #4 / constants that SHRINK, never get copied from the
// sibling (design.md ��8): `LoginPolicy` is 40 attempts / 1 minute / 3
// segments �?" NOT `RegisterPolicy`'s 50/10min/10. MAX_ATTEMPTS = 42, not 41:
// PermitLimit=40 (raised 15 -> 30 on 2026-08-23 for H-12) plus 2 of margin in case a
// segment releases mid-loop.
const MAX_ATTEMPTS = 42;

// Isolated by TAG, not by config or a dedicated Playwright `project` — same
// reasoning as register-rate-limit.spec.ts (design.md §8/§9):
// `playwright.config.ts`'s single `projects` entry has no `testMatch`, so a
// second project would run every spec twice, including `smoke.spec.ts` and
// `api-health.spec.ts`. `package.json`'s scripts already exist and already
// filter by this tag — `package.json` is NOT touched.
test.describe('login — rate limit (REQ-8)', { tag: '@rate-limit' }, () => {
  // Spec-level timeout (design.md §8) — 90s: the login window is much
  // shorter than the register sibling's, so the whole loop resolves sooner —
  // but 17 attempts still need more than the default 30s.
  test.setTimeout(90_000);

  test('a flood of bad logins eventually shows the too-many-attempts banner', async ({
    page,
    loginNetwork,
  }) => {
    // Credentials from `newTestIdentity()` are NEVER registered — the
    // server answers `succeeded:false` and consumes a rate-limit permit
    // anyway, because the limiter is middleware that runs in the pipeline
    // BEFORE the endpoint (Program.cs:157, design.md §8). This spec leaves
    // ZERO rows in the database — an improvement over the register sibling,
    // which leaves one.
    const identity = newTestIdentity();
    const loginPage = new LoginPage(page);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await loginPage.goto();
      await loginPage.fill(identity);
      await loginPage.submit();

      try {
        const response = await loginNetwork.waitForLoginResponse();
        // An unregistered login is Auth.InvalidCredentials, which
        // LoginCommand.MapErrorToStatusCode maps to 401 — not a 200 with a
        // `succeeded:false` body. A genuine failure at this point is any OTHER
        // status: it would mean the flood is being rejected for a reason this
        // spec never anticipated, and counting it as an attempt would be wrong.
        expect(response.status).toBe(401);
      } catch (err) {
        if (err instanceof LoginRateLimitError) {
          // The limiter tripped — this IS the scenario under test, not an
          // environment failure. Assert the banner and stop.
          await expect(page.getByText(TOO_MANY_ATTEMPTS_TEXT)).toBeVisible();
          return;
        }
        throw err;
      }
    }

    // A genuine failure: the loop exhausted MAX_ATTEMPTS without ever seeing
    // a 429. R8 (design.md §11) is the leading suspect — a CORS failure on
    // the 429 response itself would surface here as an ordinary
    // network/unexpected-error outcome, never as a readable 429. This would
    // be a backend finding, not a bug in this test.
    throw new Error(
      `Sent ${MAX_ATTEMPTS} login attempts and never observed a 429 (rate limit). Either the ` +
        'limiter is misconfigured, or the 429 response failed CORS and surfaced as a different ' +
        'failure — see design.md §11, risk R8.'
    );
  });
});
