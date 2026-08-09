import type { Frame, Page, Request, TestInfo } from '@playwright/test';
import { test, expect } from './support/test';

/**
 * DIAGNOSTIC PROBE for P-3 (docs/testing/e2e-stage-1/S1-04.md) — it asserts
 * nothing about the app. It exists to answer ONE open question that reading
 * the source failed to answer three times:
 *
 *   WHO pushes the second navigation during a cold boot of `/login` when
 *   `AUTH_MODEL` is present but expired?
 *
 * ## The answer, from this probe's first run
 *
 * React Router itself, hydrating its own history — no app code is involved:
 *
 *     replaceState -> (same url) @178ms pathname=/login readyState=complete
 *       at getUrlBasedHistory   (chunk-KAPRZRHU.js:722)
 *       at createBrowserHistory (chunk-KAPRZRHU.js:589)
 *       at createHydratedRouter (react-router_dom.js:155)
 *       at HydratedRouter       (react-router_dom.js:195)
 *
 * Zero pushes from app code across all eight boots. `logout()`'s pathname
 * guard (auth-store.ts:366-369) does exactly what it claims.
 *
 * ## What the two tests below are for
 *
 * That push appeared in 1 of 8 boots, and the reason is the mechanism itself:
 * `createBrowserHistory` calls `replaceState` only when the current history
 * entry does not yet carry the router's state key. A same-URL `goto` is a
 * reload — it REUSES the history entry along with that state — so only the
 * first boot in a context pays it.
 *
 * Which turns the whole thing into a falsifiable prediction, and that is what
 * splits this file into two tests:
 *
 * - `same-URL reload boots` reproduces the original measurement. Expect the
 *   push in roughly 1 of 8.
 * - `cross-URL boots` visits `/register` before each measured `goto('/login')`,
 *   so every boot lands on a FRESH history entry. If the mechanism above is
 *   the real one, the push must appear in 8 of 8.
 *
 * A 1/8 there would refute it and the hunt reopens. Nothing here is asserted:
 * the counts are printed, and the difference between the two blocks is the
 * evidence.
 *
 * ## Why this matters for T8 (login.spec.ts:516) — NOT modified, untouchable
 *
 * T8's two measurements start from different places. `withLogout` arrives from
 * the persona's home path, because its `goto('/login')` with a live session is
 * bounced by `guestOnlyLoader` — a cross-URL navigation, fresh entry, pays the
 * replaceState. `withoutLogout` starts already on `/login` — a reload, same
 * entry, pays nothing. The control is not a control, and `logout()` is not the
 * variable being measured. Whether the bounce to home has landed before the
 * next `goto` is asynchronous, which is why the file passes alone and fails
 * under the parallel load of the full suite.
 *
 * ## Run it WITH the full suite
 *
 *     pnpm exec playwright test --grep-invert @rate-limit --reporter=list
 *
 * `--reporter=list` is required: the configured `html` reporter does not print
 * a passing test's stdout, so without it the probe runs and shows nothing.
 *
 * ## Costs ZERO real logins — deliberately
 *
 * Minting a persona costs a real registration + a real login
 * (session.ts:197-209), and a third file minting `owner-admin` is precisely
 * what spent the 5-per-minute-per-IP ceiling and put `login.spec.ts` in the
 * red once already. A probe that reproduces one bug by causing another is
 * worthless.
 *
 * It does not need one: `getUserByToken()` checks the expiry FIRST
 * (auth-store.ts:117-122) and routes an expired session straight through
 * `logout()`, so a synthetic `AUTH_MODEL` with a past `expiresIn` reproduces
 * the precondition exactly, without a backend call ever being reached.
 */

// Mirrors `global-config.ts:3` — `import.meta.env['APP_VERSION'] ?? '1.0.0'`.
// Nothing in this repo defines APP_VERSION (not vite.config.ts, not
// playwright.config.ts, no .env), so the fallback is what the app uses here.
// The guess is not trusted — see `assertTheAppConsumedTheSeed` below.
const AUTH_MODEL_KEY = `${process.env['APP_VERSION'] ?? '1.0.0'}-authf496fc5a9f17`;

// A race needs repetition to be caught. Each iteration is one cold boot, and
// they are cheap: no network, no login, no seeding round-trip.
const ITERATIONS = 8;

const PROBE_GLOBAL = '__t8NavProbe';

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

/**
 * Wraps the history API before any app module evaluates. `addInitScript`
 * re-runs on every navigation, which is exactly right: each boot reports its
 * own pushes, timed from that boot's start.
 */
async function installNavProbe(page: Page): Promise<void> {
  await page.addInitScript((globalName) => {
    const entries: unknown[] = [];
    (window as unknown as Record<string, unknown>)[globalName as string] = entries;
    const t0 = performance.now();

    const record = (kind: string, url: unknown) => {
      entries.push({
        kind,
        url: String(url ?? ''),
        pathnameAtCall: window.location.pathname,
        readyState: document.readyState,
        atMs: Math.round(performance.now() - t0),
        // The frames above this wrapper are the answer: whoever asked for the
        // navigation, named by file and line.
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

    // A back/forward entry would show up here and nowhere else — one line to
    // rule it out rather than assume it away.
    window.addEventListener('popstate', () => record('popstate', window.location.href));
  }, PROBE_GLOBAL);
}

async function seedExpiredSession(page: Page): Promise<void> {
  await page.evaluate((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({ authToken: 'p3-probe-token', expiresIn: Date.now() - 1 })
    );
  }, AUTH_MODEL_KEY);
}

/** One measured cold boot of `/login`, with the history pushes it produced. */
async function measureBoot(page: Page, i: number): Promise<Iteration> {
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
    (globalName) => (window as unknown as Record<string, unknown>)[globalName as string] ?? [],
    PROBE_GLOBAL
  )) as NavPush[];

  return {
    i,
    navigations,
    documents,
    pushes,
    authModelAfter: await page.evaluate((key) => window.localStorage.getItem(key), AUTH_MODEL_KEY),
  };
}

/**
 * PRECONDITION, asserted before any conclusion is drawn from the counts
 * (CLAUDE.md: pin the state that triggers the behavior, or you cannot tell
 * "measured correctly" from "measured nothing"). `logout()` removes
 * AUTH_MODEL (auth-store.ts:356). If the key survives a boot, the app never
 * read what this probe wrote — wrong version prefix — and every iteration
 * measured a plain anonymous boot instead of an expired-session one. That
 * would be a probe bug wearing the costume of a clean result.
 */
function assertTheAppConsumedTheSeed(iterations: Iteration[]): void {
  const unread = iterations.filter((it) => it.authModelAfter !== null);
  expect(
    unread.length,
    `The app never consumed AUTH_MODEL at key "${AUTH_MODEL_KEY}" — it survived ` +
      `${unread.length}/${iterations.length} boots. The version prefix is likely wrong ` +
      `(global-config.ts:3), so this probe measured anonymous boots, not expired-session ones.`
  ).toBe(0);
}

async function report(
  label: string,
  expectation: string,
  iterations: Iteration[],
  testInfo: TestInfo
): Promise<void> {
  const withPush = iterations.filter((it) => it.pushes.length > 0);

  await testInfo.attach(`p3-${label}.json`, {
    body: JSON.stringify({ label, expectation, iterations }, null, 2),
    contentType: 'application/json',
  });

  // Printed as well as attached: the point is to be pasteable straight out of
  // the terminal, without opening the HTML report.
  console.log(`\n===== P-3 PROBE [${label}] — history pushes in ${withPush.length}/${ITERATIONS} boots =====`);
  console.log(`expectation: ${expectation}`);
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
  console.log(`\n===== end P-3 probe [${label}] =====\n`);
}

test.describe('P-3 probe — who pushes the extra /login navigation', () => {
  // Eight cold boots per test, each waiting for networkidle, under whatever
  // load the rest of the suite puts on the single Vite dev server.
  test.describe.configure({ timeout: 180_000 });

  test('same-URL reload boots (baseline — expect the push in ~1 of 8)', async ({
    page,
  }, testInfo) => {
    await installNavProbe(page);
    // An origin is needed before localStorage can be written to. Every measured
    // boot below then targets this same URL, so each is a RELOAD: the history
    // entry — and the router state stamped onto it — survives.
    await page.goto('/login');

    const iterations: Iteration[] = [];
    for (let i = 1; i <= ITERATIONS; i++) {
      await seedExpiredSession(page);
      iterations.push(await measureBoot(page, i));
    }

    assertTheAppConsumedTheSeed(iterations);
    await report(
      'same-url-reload',
      'the router stamps its state once; only the first boot should push',
      iterations,
      testInfo
    );
  });

  test('cross-URL boots (prediction — the push in 8 of 8)', async ({ page }, testInfo) => {
    await installNavProbe(page);
    await page.goto('/login');

    const iterations: Iteration[] = [];
    for (let i = 1; i <= ITERATIONS; i++) {
      // `/register` is public and anonymous — it costs nothing and mints
      // nothing. Its only job is to make the NEXT `goto('/login')` a real
      // cross-URL navigation onto a fresh history entry, which is the shape
      // T8's `withLogout` run has and its control does not.
      await page.goto('/register');
      await seedExpiredSession(page);
      iterations.push(await measureBoot(page, i));
    }

    assertTheAppConsumedTheSeed(iterations);
    await report(
      'cross-url',
      'every boot lands on a fresh history entry, so every boot should push — ' +
        'anything less than 8/8 REFUTES the mechanism and the hunt reopens',
      iterations,
      testInfo
    );
  });

  // Neither test asserts the push counts. This file gathers evidence; it does
  // not own the behavior. T8 in `login.spec.ts` owns REQ-8, and a probe that
  // could turn the suite red would just be a second flake next to the first.
});
