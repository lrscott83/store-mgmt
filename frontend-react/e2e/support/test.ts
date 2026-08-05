import { test as base, expect } from '@playwright/test';
import {
  installRegisterNetworkObserver,
  type RegisterNetworkObserver,
} from './network-observer';

/**
 * The suite's entry point (design.md §1). Every spec file imports `test`/
 * `expect` from HERE, never directly from `@playwright/test` — this is the
 * seam where the next scenario's session fixture (`signedInPage`, not built
 * in this change) will attach without any already-written spec having to
 * change its import.
 */
interface RegisterFixtures {
  registerNetwork: RegisterNetworkObserver;
}

export const test = base.extend<RegisterFixtures>({
  // `auto: true`: installed for every test that imports from this file, with
  // no per-test opt-in (design.md §6 — a safeguard that can be forgotten is
  // not a safeguard). It attaches its listeners before the test body runs,
  // so `registerNetwork.attempts()` / `expectNoAttempt()` / `waitForResponse()`
  // are backed by data from the very start of the test, not from whenever a
  // test happened to first mention the fixture.
  registerNetwork: [
    async ({ page }, use) => {
      const observer = installRegisterNetworkObserver(page);
      await use(observer);
    },
    { auto: true },
  ],
});

export { expect };
