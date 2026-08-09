import type { Frame, Request } from '@playwright/test';
import { test, expect } from './support/test';

/**
 * DIAGNOSTIC PROBE for P-3 (docs/testing/e2e-stage-1/S1-04.md) — it asserts
 * nothing about the app. It exists to answer ONE open question that reading
 * the source has failed to answer three times:
 *
 *   WHO pushes the second navigation during a cold boot of `/login` when
 *   `AUTH_MODEL` is present but expired?
 *
 * What is already known, and does NOT need re-deriving:
 * - `login.spec.ts`'s T8 fails ONLY in the full suite. Run alone, that file
 *   passes. So the cause is load-dependent — a race, not a logic error.
 * - The failure reports `documents: 1` against two navigations, which by T8's
 *   own instrumentation means the CLIENT ROUTER pushed the second one; nothing
 *   forced a hard reload.
 * - `logout()`'s redirect is guarded on `/login` (auth-store.ts:366-369) and
 *   `guestOnlyLoader` returns `null` for an unauthenticated visitor
 *   (loaders.ts:42-58). Neither explains the push.
 *
 * A `framenavigated` event says a navigation happened; it never says who asked
 * for it. React Router pushes through `history.pushState`, so wrapping that —
 * BEFORE any app module evaluates — and capturing `new Error().stack` names
 * the caller by file and line. That is the whole point of this file.
 *
 * ## Run it WITH the full suite
 *
 *     pnpm exec playwright test
 *
 * Running this file alone is expected to report nothing: the bug does not
 * reproduce without the parallel load. That is the finding, not a failure.
 *
 * ## Costs ZERO real logins — deliberately
 *
 * Minting a persona costs a real registration + a real login (`session.ts:197-209`).
 * A third file minting `owner-admin` is precisely what put `login.spec.ts` in
 * the red once already, by spending the 5-per-minute-per-IP login ceiling
 * (see the commit that serialized `store-plan-activation.spec.ts`). A probe
 * that reproduces the bug by CAUSING a different one is worthless.
 *
 * It does not need one: the boot under study never reaches a backend call.
 * `getUserByToken()` checks the expiry FIRST (auth-store.ts:117-122) and
 * routes an expired session straight through `logout()`, so a synthetic
 * `AUTH_MODEL` with a past `expiresIn` reproduces the precondition exactly.
 *
 * ## Two fidelity deltas from T8, stated rather than hidden
 *
 * 1. No `currentUser`/`token` in storage. Only the expired branch runs, and it
 *    reads neither — but if this probe reproduces nothing while T8 keeps
 *    failing, this is the first difference to close.
 * 2. T8 arrives from the persona's home path (its `goto('/login')` with a live
 *    session is bounced by `guestOnlyLoader`), so its session history is one
 *    entry deeper. History depth is itself a plausible input to a router race.
 */

// Mirrors `global-config.ts:3` — `import.meta.env['APP_VERSION'] ?? '1.0.0'`.
// Nothing in this repo defines APP_VERSION (not vite.config.ts, not
// playwright.config.ts, no .env), so the fallback is what the app uses here.
// The guess is not trusted: the precondition below fails loudly if the app
// never read the key this writes.
const AUTH_MODEL_KEY = `${process.env['APP_VERSION'] ?? '1.0.0'}-authf496fc5a9f17`;

// A race needs repetition to be caught. Each iteration is one cold boot, and
// they are cheap: no network, no login, no seeding round-trip.
const ITERATIONS = 8;

interface NavPush {
  kind: 'pushState' | 'replaceState' | 'popstate';
  url: string;
  pathnameAtCall: string;
  readyState: string;
  atMs: number;
  stack: string;
}

interface Iteration {
  i: number;
  navigations: string[];
  documents: number;
  pushes: NavPush[];
  authModelAfter: string | null;
}

test.describe('P-3 probe — who pushes the extra /login navigation', () => {
  // Eight cold boots, each waiting for networkidle, under whatever load the
  // rest of the suite is putting on the single Vite dev server.
  test.describe.configure({ timeout: 180_000 });

  test('records the stack of every history push during an expired-session boot', async ({
    page,
  }, testInfo) => {
    // Installed before any navigation, so it is in place for every document
    // this test loads. It re-runs per navigation, which is what we want: each
    // boot reports its own pushes, with times relative to that boot's start.
    await page.addInitScript(() => {
      const entries: unknown[] = [];
      (window as unknown as Record<string, unknown>)['__t8NavProbe'] = entries;
      const t0 = performance.now();

      const record = (kind: string, url: unknown) => {
        entries.push({
          kind,
          url: String(url ?? ''),
          pathnameAtCall: window.location.pathname,
          readyState: document.readyState,
          atMs: Math.round(performance.now() - t0),
          // The frames above this wrapper are the answer: the app module or
          // router internal that asked for the navigation.
          stack: new Error().stack ?? '(no stack)',
        });
      };

      const originalPush = window.history.pushState;
      const originalReplace = window.history.replaceState;

      window.history.pushState = function (...args: unknown[]) {
        record('pushState', args[2]);
        return (originalPush as (...a: unknown[]) => void).apply(window.history, args);
      } as typeof window.history.pushState;

      window.history.replaceState = function (...args: unknown[]) {
        record('replaceState', args[2]);
        return (originalReplace as (...a: unknown[]) => void).apply(window.history, args);
      } as typeof window.history.replaceState;

      // A back/forward entry would show up here and nowhere else — worth one
      // line to rule it out rather than assume it away.
      window.addEventListener('popstate', () => record('popstate', window.location.href));
    });

    // An origin is needed before localStorage can be written to.
    await page.goto('/login');

    const seedExpiredSession = async (): Promise<void> => {
      await page.evaluate((key) => {
        window.localStorage.setItem(
          key,
          JSON.stringify({ authToken: 'p3-probe-token', expiresIn: Date.now() - 1 })
        );
      }, AUTH_MODEL_KEY);
    };

    const readAuthModel = async (): Promise<string | null> =>
      page.evaluate((key) => window.localStorage.getItem(key), AUTH_MODEL_KEY);

    const iterations: Iteration[] = [];

    for (let i = 1; i <= ITERATIONS; i++) {
      await seedExpiredSession();

      const navigations: string[] = [];
      let documents = 0;
      const onNavigated = (frame: Frame) => {
        if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname);
      };
      const onRequest = (request: Request) => {
        if (request.resourceType() === 'document') documents++;
      };
      page.on('framenavigated', onNavigated);
      page.on('request', onRequest);
      await page.goto('/login');
      await page.waitForLoadState('networkidle');
      page.off('framenavigated', onNavigated);
      page.off('request', onRequest);

      const pushes = (await page.evaluate(
        () => (window as unknown as Record<string, unknown>)['__t8NavProbe'] ?? []
      )) as NavPush[];

      iterations.push({
        i,
        navigations,
        documents,
        pushes,
        authModelAfter: await readAuthModel(),
      });
    }

    // PRECONDITION, asserted before any conclusion is drawn from the numbers
    // above (CLAUDE.md: pin the state that triggers the behavior, or you
    // cannot tell "measured correctly" from "measured nothing"). `logout()`
    // removes AUTH_MODEL (auth-store.ts:356). If the key survives the boot,
    // the app never read what this probe wrote — wrong version prefix — and
    // every iteration measured a plain anonymous boot instead of the
    // expired-session one. That would be a probe bug wearing the costume of
    // a clean result.
    const unread = iterations.filter((it) => it.authModelAfter !== null);
    expect(
      unread.length,
      `The app never consumed AUTH_MODEL at key "${AUTH_MODEL_KEY}" — it survived ` +
        `${unread.length}/${ITERATIONS} boots. The version prefix is likely wrong ` +
        `(global-config.ts:3), so this probe measured anonymous boots, not expired-session ones.`
    ).toBe(0);

    const reproduced = iterations.filter((it) => it.navigations.length > 1);

    const report = {
      reproducedIn: `${reproduced.length}/${ITERATIONS}`,
      iterations: iterations.map((it) => ({
        i: it.i,
        navigations: it.navigations,
        documents: it.documents,
        pushes: it.pushes,
      })),
    };

    await testInfo.attach('p3-navigation-probe.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });

    // Printed as well as attached: the whole point is to be pasteable straight
    // out of the terminal, without opening the HTML report.
    console.log(`\n===== P-3 PROBE — reproduced in ${reproduced.length}/${ITERATIONS} boots =====`);
    for (const it of iterations) {
      console.log(
        `\n[boot ${it.i}] navigations=${JSON.stringify(it.navigations)} documents=${it.documents} pushes=${it.pushes.length}`
      );
      for (const push of it.pushes) {
        console.log(
          `  ${push.kind} -> ${push.url || '(same url)'} @${push.atMs}ms  ` +
            `pathname=${push.pathnameAtCall} readyState=${push.readyState}`
        );
        console.log(
          push.stack
            .split('\n')
            .slice(1, 8)
            .map((line) => `      ${line.trim()}`)
            .join('\n')
        );
      }
    }
    console.log('\n===== end P-3 probe =====\n');

    // No assertion on `reproduced`. This file gathers evidence; it does not
    // own the behavior. T8 in `login.spec.ts` is the test that asserts REQ-8,
    // and a probe that could turn the suite red would just be a second flake
    // sitting next to the first one.
  });
});
