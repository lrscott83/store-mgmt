import { expect, test } from '@playwright/test';
import { E2E_API_URL } from './support/backend-url';

/**
 * Connectivity check against the backend API.
 *
 * Runs with `playwright.api.config.ts`, which has no `webServer` and no browser
 * project: proving the API answers must not depend on the frontend dev server
 * building. Everything here uses the `request` fixture, so no browser launches.
 *
 * The base URL is `E2E_API_URL` (`e2e/support/backend-url.ts`) — the same
 * backend the rest of the E2E suite targets, so a green ping here means the
 * server the other specs will talk to is up. It deliberately does NOT read
 * `API_URL` from the developer's `frontend-react/.env`: that file holds their
 * own dev configuration, and pointing this check at one backend while the
 * suite exercises another turns a health check into a lie.
 *
 * Both endpoints below sit under the `/api` prefix that `E2E_API_URL` already
 * carries (`BaseApiController.cs:11` → `api/v1/[controller]`), so they append
 * cleanly. Note the app ALSO exposes `/health` (`Program.cs:161`
 * `app.UseHealthChecks`), but that one is registered with no path base and
 * therefore lives at the server root, OUTSIDE `/api` — appending it to
 * `E2E_API_URL` would hit a 404.
 */

const API_URL = E2E_API_URL;

test.beforeAll(() => {
  // Not a tautology: `E2E_API_URL` is overridable from the shell, and a value
  // that is relative or missing the `/api` prefix would make every request
  // below fail with a 404 that looks like a dead server instead of a typo.
  expect(API_URL, `E2E_API_URL must be an absolute http(s) URL, got: ${API_URL}`).toMatch(
    /^https?:\/\//,
  );
  expect(API_URL, `E2E_API_URL must carry the /api prefix, got: ${API_URL}`).toMatch(/\/api$/);
});

test('the API answers ping', async ({ request }) => {
  // `AuthController.cs:117-123` — `[HttpGet("ping")]`, `[AllowAnonymous]`, returns `Ok(true)`.
  // The same contract is already pinned against a real database by the existing
  // backend suite: `SMCA.WebApi.E2ETests/Auth/AuthPingTests.cs:18-21`.
  const response = await request.get(`${API_URL}/v1/auth/ping`);

  expect(response.status(), `GET ${API_URL}/v1/auth/ping did not return 200`).toBe(200);
  expect((await response.text()).trim()).toBe('true');
});

test('the API rejects an unauthenticated caller', async ({ request }) => {
  // Ping alone only proves a process is listening and one anonymous route works.
  // This asserts the auth middleware is actually engaged, which is what makes
  // every other scenario in the catalog meaningful. `/v1/auth/me` carries no
  // rate-limit policy (those cover login and register only,
  // `RateLimitPolicies.cs:15-35`), so it is safe to run repeatedly.
  const response = await request.get(`${API_URL}/v1/auth/me`);

  expect(response.status(), 'an unauthenticated call to /v1/auth/me should be rejected').toBe(401);
});
