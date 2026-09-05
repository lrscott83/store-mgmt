import { test, expect } from './support/test';
import { LoginPage } from './support/login-page';
import { plantRoster, KAT_PASSWORD } from './support/roster-fixture';
import { seedCategoryAndProduct } from './support/store-seed';

/**
 * REGRESSION GATE — logout must be silent (user-reported bug, fixed 2026-09-05):
 * clicking "Salir" on the sale screen showed the blocking dialog "No se pudo
 * abrir la información de esta tienda…" (ENCRYPTION.KEY_UNAVAILABLE) on top of
 * the login screen. Root cause (stack-pinned by the diagnostic version of
 * this spec): logout() runs clearDek()+set({user:null}) synchronously, SalePage
 * stays mounted during the /login transition, its storeId fell back to '' and
 * the three load effects re-fired WITHOUT a storeId guard, reaching the
 * repositories' storage reads with no DEK — MissingDataKeyError (a SYNC throw
 * inside the effect body, re-thrown by React as a window error, never a
 * PromiseRejectionEvent), answered by the app-wide policy with the blocking
 * dialog. Fix: the same `if (!storeId) return` guard products.tsx:85 already
 * had for this exact race.
 *
 * This spec keeps the diagnostic recorder (three channels: unhandledrejection,
 * window 'error', console.error) because that is what makes a red run
 * self-diagnosing: the failure message prints the captured name+message+stack
 * of whatever escaped, so the next regression reports its own cause.
 */

interface CapturedRejection {
  kind: 'unhandledrejection' | 'window-error' | 'console-error';
  reasonName: string | undefined;
  message: string | undefined;
  stack: string | undefined;
  time: string;
}

declare global {
  interface Window {
    __logoutRejections: CapturedRejection[];
  }
}

/** Installs the recorder on every document of this context, BEFORE any app
 * code runs — the logout navigation destroys a page.evaluate-installed
 * listener, this one survives it. Records THREE channels: promise
 * rejections (the policy listener's seam), window 'error' events (a
 * synchronous throw inside a useEffect — React re-throws those to the
 * global handler, they never become PromiseRejectionEvent), and console.error
 * (how React announces an uncaught render/effect error). */
function installRejectionRecorder(page: import('@playwright/test').Page) {
  return page.addInitScript(() => {
    interface Rec {
      kind: string;
      reasonName?: string;
      message?: string;
      stack?: string;
      time: string;
    }
    const recs: Rec[] = [];
    (window as unknown as { __logoutRejections: Rec[] }).__logoutRejections = recs;
    const push = (rec: Rec) => {
      try {
        recs.push(rec);
      } catch {
        /* storage full — keep the listeners alive */
      }
    };
    window.addEventListener('unhandledrejection', (e) => {
      const reason = (e as PromiseRejectionEvent).reason as
        | { name?: string; message?: string; stack?: string }
        | undefined;
      push({
        kind: 'unhandledrejection',
        reasonName: reason?.name,
        message: reason?.message,
        stack: reason?.stack,
        time: new Date().toISOString(),
      });
    });
    window.addEventListener('error', (e) => {
      const err = (e as ErrorEvent).error as
        | { name?: string; message?: string; stack?: string }
        | undefined
        | null;
      push({
        kind: 'window-error',
        reasonName: err?.name ?? 'ErrorEvent',
        message: (e as ErrorEvent).message,
        stack: err?.stack ?? `${(e as ErrorEvent).filename}:${(e as ErrorEvent).lineno}`,
        time: new Date().toISOString(),
      });
    });
    const origError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      try {
        push({
          kind: 'console-error',
          message: args
            .map((a) =>
              a instanceof Error ? `${a.name}: ${a.message}` : String(a).slice(0, 500),
            )
            .join(' | ')
            .slice(0, 2000),
          stack: args.find((a): a is Error => a instanceof Error)?.stack,
          time: new Date().toISOString(),
        });
      } catch {
        /* never let the spy throw */
      }
      origError(...args);
    };
  });
}

test('logout from a data screen is silent — no dialog, no unhandled rejection', async ({
  page,
}) => {
  await installRejectionRecorder(page);

  const loginPage = new LoginPage(page);
  const login = `e2e-logout-dbg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Offline-provisioned device with real encryption: roster v2 + KAT wrap.
  await loginPage.goto();
  const bundle = await plantRoster(page, { users: [{ login, wrap: 'kat' }] });
  await loginPage.fill({ login, password: KAT_PASSWORD });
  await loginPage.submit();
  await page.waitForURL(/\/sales\/products$/);

  // Encrypted data exists and the screen that reads it is mounted.
  await seedCategoryAndProduct(page, `Logout Dbg ${login}`);
  const entityKey = `lizoft.store-product-categories-${bundle.storeId}`;
  const raw = await page.evaluate((k) => window.localStorage.getItem(k), entityKey);
  expect(raw?.startsWith('enc:v1:'), 'precondition: categories entity is encrypted').toBe(true);

  // The user's real home once the store has products: /sales/new (user-home.ts).
  // sale.tsx's load effects (getAvailableProductCategories / Promise.all) have
  // NO `if (!storeId) return` guard and NO .catch — unlike products.tsx:85.
  await page.goto('/sales/new');
  const seededName = `Logout Dbg ${login}`;
  await expect(page.getByText(seededName).first()).toBeVisible();

  // The user's exact action: Salir from an authenticated data screen.
  await page.getByRole('button', { name: 'Menú de usuario' }).click();
  await page.getByRole('button', { name: 'Salir' }).click();
  await page.waitForURL(/\/login$/);

  // Give any in-flight promise a chance to reject before reading the recorder.
  await page.waitForTimeout(1500);

  const rejections = (await page.evaluate(
    () => window.__logoutRejections
  )) as CapturedRejection[];

  // The dialog the user reported — asserted soft-collapsed into the
  // rejection evidence: if the bug reproduces, this prints name+message+stack.
  const dialog = await page
    .getByText('No se pudo abrir la información de esta tienda.')
    .count();

  const evidence = rejections
    .map((r) => `[${r.time}] ${r.reasonName}: ${r.message}\n${r.stack ?? '(no stack)'}`)
    .join('\n---\n');

  expect(
    rejections,
    `BUG REPRODUCED — unhandled rejections during logout:\n${evidence}`,
  ).toEqual([]);
  expect(dialog, 'the KEY_UNAVAILABLE dialog must not appear after logout').toBe(0);
});
