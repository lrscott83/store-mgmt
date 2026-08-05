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
 */

const API_URL = process.env['API_URL'];

test.beforeAll(() => {
  expect(
    API_URL,
    'API_URL is not set. Define it in frontend-react/.env (e.g. API_URL=http://localhost:5000).',
  ).toBeTruthy();
});

test('the API answers its health endpoint', async ({ request }) => {
  // `Program.cs:161` — `app.UseHealthChecks("/health")`, unauthenticated, plain text.
  const response = await request.get(`${API_URL}/health`);

  expect(response.status(), `GET ${API_URL}/health did not return 200`).toBe(200);
  expect((await response.text()).trim()).toBe('Healthy');
});

test('the API serves its v1 routes and rejects an unauthenticated caller', async ({ request }) => {
  // A reachable-but-protected endpoint: proves routing and the auth middleware are
  // both alive, not just that some process is listening on the port. `/v1/auth/me`
  // carries no rate-limit policy (those cover login and register only,
  // `RateLimitPolicies.cs:15-35`), so this is safe to run repeatedly.
  const response = await request.get(`${API_URL}/v1/auth/me`);

  expect(response.status(), 'an unauthenticated call to /v1/auth/me should be rejected').toBe(401);
});
