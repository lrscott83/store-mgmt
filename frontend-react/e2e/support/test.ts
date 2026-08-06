import { test as base, expect } from '@playwright/test';
import {
  installRegisterNetworkObserver,
  type RegisterNetworkObserver,
} from './network-observer';
import {
  installLoginNetworkObserver,
  type LoginNetworkObserver,
} from './login-network-observer';
import { createPersonaCache, restoreSignedInSession } from './session';
import type { PersonaCache, PersonaKind, SignedInSession } from './session';

/**
 * The suite's entry point (design.md §1). Every spec file imports `test`/
 * `expect` from HERE, never directly from `@playwright/test` — this was the
 * seam left open for the session fixture (`signedInPage`), wired below
 * without `register.spec.ts`/`register-rate-limit.spec.ts` having to change
 * their imports.
 */
interface RegisterFixtures {
  registerNetwork: RegisterNetworkObserver;
}

/**
 * `e2e-session-fixture` (design.md §3): `persona` is a per-test/`describe`
 * OPTION fixture (never `auto`, REQ-5) that picks which persona
 * `signedInPage` restores; `signedInPage` itself composes the worker-scoped
 * `personaCache` (the "mint once per worker" engine, `session.ts`) onto the
 * test's OWN `page` fixture — never a new one — so `registerNetwork`,
 * `loginNetwork`, and any future `auto: true` observer keep watching what
 * the test itself looks at.
 */
interface SessionFixtures {
  persona: PersonaKind;
  signedInPage: SignedInSession;
}

/** Split out (Playwright requires worker-scoped fixtures in their own generic
 * parameter of `test.extend<TestFixtures, WorkerFixtures>`). */
interface SessionWorkerFixtures {
  personaCache: PersonaCache;
}

interface LoginFixtures {
  loginNetwork: LoginNetworkObserver;
}

export const test = base.extend<
  RegisterFixtures & SessionFixtures & LoginFixtures,
  SessionWorkerFixtures
>({
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

  // Same criterion as `registerNetwork` (design.md §4): a safeguard that can
  // be forgotten is not a safeguard.
  loginNetwork: [
    async ({ page }, use) => {
      const observer = installLoginNetworkObserver(page);
      await use(observer);
    },
    { auto: true },
  ],

  // Option fixture, never `auto` — costs real network/quota, so only tests
  // that actually destructure `signedInPage` pay for it (REQ-5).
  persona: ['owner-admin', { option: true }],

  // Worker-scoped: the persona chain mints AT MOST once per worker, lazily,
  // on the first `signedInPage` resolution in that worker (design.md §3
  // "Costo amortizado").
  personaCache: [
    async ({ browser }, use) => {
      await use(createPersonaCache(browser));
    },
    { scope: 'worker' },
  ],

  // Test-scoped by necessity: it restores onto THIS test's own `page`
  // fixture (design.md §3 "Composición") — a worker-scoped fixture cannot
  // depend on a test-scoped one. The `signedInPage.page === page` invariant
  // is exactly why this fixture cannot be worker-scoped itself, even though
  // the cache it draws from (`personaCache`) is.
  signedInPage: async ({ page, personaCache, persona }, use) => {
    const session = await restoreSignedInSession(page, personaCache, persona);
    await use(session);
  },
});

export { expect };
