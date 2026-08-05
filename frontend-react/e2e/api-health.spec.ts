import { expect, test } from '@playwright/test';

/**
 * Connectivity check against the backend API.
 *
 * Runs with `playwright.api.config.ts`, which has no `webServer` and no browser
 * project: proving the API answers must not depend on the frontend dev server
 * building. Everything here uses the `request` fixture, so no browser launches.
 *
 * The base URL comes from `API_URL` in `frontend-react/.env` (the same variable
 * the app itself is built with, `app/shared/lib/http/api-client.ts:21`). It is
 * read at run time here rather than hardcoded, so this file carries no
 * environment-specific value.
 *
 * Both endpoints below sit under the `/api` prefix that `API_URL` already
 * carries (`BaseApiController.cs:11` → `api/v1/[controller]`), so they append
 * cleanly. Note the app ALSO exposes `/health` (`Program.cs:161`
 * `app.UseHealthChecks`), but that one is registered with no path base and
 * therefore lives at the server root, OUTSIDE `/api` — appending it to
 * `API_URL` would hit a 404.
 */

const API_URL = process.env['API_URL'];

test.beforeAll(() => {
  expect(
    API_URL,
    'API_URL is not set. Define it in frontend-react/.env (e.g. API_URL=https://localhost:44320/api).',
  ).toBeTruthy();
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
