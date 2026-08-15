import { test, expect } from './support/test';
import { RegisterPage } from './support/register-page';
import { newTestIdentity } from './support/identity';
import { RegisterRateLimitError } from './support/network-observer';

const TOO_MANY_ATTEMPTS_TEXT =
  'Demasiados intentos de registro. Por favor, espere unos minutos antes de volver a intentar.'; // es.ts:126-127

// Robust against a window already partially consumed by a recent
// `pnpm test:e2e` run (design.md §9): the loop cuts as soon as a 429
// arrives, whichever attempt number that turns out to be — it does not
// assume the window starts empty.
//
// RegisterPolicy PermitLimit raised 10 -> 50 (RateLimitPolicies.cs,
// 2026-08-15): the loop must now submit 50 requests to consume the quota
// (attempt 1 registers; attempts 2-50 are duplicate 400s that still burn a
// permit, design.md §9) plus one more to actually observe the 429.
const MAX_ATTEMPTS = 51;

// Isolated by TAG, not by config or a dedicated Playwright `project`
// (design.md §9): `playwright.config.ts`'s single `projects` entry has no
// `testMatch`, so a second project would run every spec twice — including
// `smoke.spec.ts` and `api-health.spec.ts`, which is exactly the "changes
// how an existing test runs" outcome the project rule forbids. A tag lives
// entirely inside this new file; `package.json`'s `test:e2e` excludes it
// with `--grep-invert`, and `test:e2e:rate-limit` is the only script that
// selects it.
test.describe('register — rate limit (REQ-9)', { tag: '@rate-limit' }, () => {
  // Spec-level timeout (design.md §9: "a nivel spec, no en la config") — up
  // to 51 sequential submissions plus page loads take several minutes (each
  // attempt is a full goto + form fill + submit + response wait), so the
  // timeout is scaled well past the default 30s.
  test.setTimeout(480_000);

  test('a duplicate-login flood eventually shows the too-many-attempts banner', async ({
    page,
    registerNetwork,
  }) => {
    const identity = newTestIdentity();
    const registerPage = new RegisterPage(page);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await registerPage.goto();
      // Attempt 1 is a fresh registration (201, 1 real DB row). Every
      // attempt after that reuses the SAME login on purpose: a 400-by-
      // duplicate still consumes a rate-limit permit, because the limiter
      // runs in the pipeline BEFORE the endpoint (Program.cs:157) —
      // design.md §9. That keeps this spec's data footprint to 1 row
      // instead of 11.
      await registerPage.fillValidForm(identity);
      await registerPage.acceptTerms.check();
      await registerPage.submit();

      try {
        const response = await registerNetwork.waitForResponse();
        // A genuine failure at this point: neither 201 nor 400 — some other
        // status this spec never anticipated.
        expect([201, 400]).toContain(response.status);
      } catch (err) {
        if (err instanceof RegisterRateLimitError) {
          // The limiter tripped — this IS the scenario under test, not an
          // environment failure. Assert the UI banner and stop.
          await expect(page.getByText(TOO_MANY_ATTEMPTS_TEXT)).toBeVisible();
          return;
        }
        throw err;
      }
    }

    // A genuine failure: the loop exhausted MAX_ATTEMPTS without ever seeing
    // a 429. R1 (design.md §11) is the leading suspect if this happens: a
    // CORS failure on the 429 response itself would surface here as an
    // ordinary network/unexpected-error outcome, never as a readable 429 —
    // check the browser console/network tab, this is a backend finding, not
    // a bug in this test.
    throw new Error(
      `Sent ${MAX_ATTEMPTS} registration attempts and never observed a 429 (rate limit). ` +
        'Either the limiter is misconfigured, or the 429 response failed CORS and surfaced as ' +
        'a different failure — see design.md §11, risk R1.'
    );
  });
});
