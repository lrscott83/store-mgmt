/**
 * Single source of truth for the backend the E2E suite targets.
 *
 * Deliberately independent of `frontend-react/.env`: that file holds the
 * developer's own dev configuration (whatever backend they normally point at),
 * and the register suite creates real Owner+Store rows on every successful run
 * — it must never inherit an arbitrary dev API_URL and write into a shared
 * database.
 *
 * Zero-config default targets the local backend started with
 * `dotnet run --project backend/src/SMCA.WebApi --launch-profile http`
 * (port from launchSettings.json:11). Override via the `E2E_API_URL` shell
 * variable to point the suite elsewhere.
 *
 * The `/api` suffix is part of the value: the backend routes
 * `api/v1/[controller]` (BaseApiController.cs:11) while the frontend requests
 * `/v1/...` (auth-http-service.ts:41), so the prefix has to live here.
 *
 * This module is imported by `playwright.config.ts` (to inject `API_URL` into
 * the dev server it spawns), by `e2e/support/network-observer.ts` (the
 * wrong-backend guard) and by `e2e/api-health.spec.ts`. It holds no Playwright
 * imports on purpose, so importing it never pulls a config module into a spec.
 */
export const E2E_API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:5019/api';
