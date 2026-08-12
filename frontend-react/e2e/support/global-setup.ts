/**
 * Playwright global setup.
 *
 * Runs once, after the webServer plugin has started or adopted the dev server
 * and before any spec executes, and refuses the run when that server is wired
 * to a different backend than this suite targets. See `dev-server-guard.ts`
 * for what it checks and why the check lives in the CSP header.
 */
import { assertDevServerBackend } from './dev-server-guard';

export default async function globalSetup(): Promise<void> {
  await assertDevServerBackend();
}
