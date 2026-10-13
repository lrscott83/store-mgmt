import type { Page } from '@playwright/test';
import { RegisterPage } from './register-page';
import { newTestIdentity } from './identity';
import { readSelectedStoreId } from './session';
import { MULTIMONEDAS_MODULE_ID, disableStoreModule } from './multipayments-fixture';

/**
 * Constructed NEGATIVE precondition: an owner whose store has NO MultiMonedas
 * (module 15).
 *
 * ── Why this exists (birth plan Superior, owner decision 2026-10-13) ────────
 * `store-birth-superior` (2026-10-11) replaced `store-birth-pago-only`: a newly
 * registered store is born on **Superior** and therefore ALREADY carries module
 * 15. Every surface that only renders WITHOUT MultiMonedas — the dashboard's
 * legacy "Moneda: CUP/USD + tasa" selector (`dashboard.tsx:257`) and the
 * "(CUP)"-suffixed payment-method labels (`orders.tsx:632`,
 * `today-orders.tsx:160`, via `paymentMethodKeyToLabel(key, !multiMonedas)`) —
 * used to be reachable by accident, through the plan. Now the precondition has
 * to be BUILT (S2 of `odd/tasks/e2e-birth-plan-superior.md`).
 *
 * ── Why a PRIVATE identity ─────────────────────────────────────────────────
 * `disableStoreModule` deletes a `StoreModule` row: a server-side mutation. The
 * shared personas are a worker-scoped cache reused by every spec that lands in
 * that worker, so mutating one would contaminate them
 * (`e2e/README.md` §"Specs que mutan estado server-side"). Every call here
 * registers its own throwaway `e2e-*` owner, which `global-teardown` sweeps.
 *
 * Same seam as `channel-rates-catalogue.spec.ts`; the helpers here are simply
 * the three steps that seam repeats, in one place.
 */

/**
 * Refreshes the client session AFTER a server-side module change so the app
 * re-reads `/me` instead of hydrating from the cached profile.
 *
 * `auth-store` does NOT re-fetch `/me` on reload while the cached profile is
 * valid — the caveat both `enableStoreModule` and `disableStoreModule`
 * document. This drops `currentUser`, the device DEK and every ciphertext entity
 * key (`enc:v1:` prefix), then reloads, so the next render sees the module set
 * the database actually holds.
 *
 * Only ciphertext keys are dropped: PLAINTEXT entity keys (the pre-encryption
 * format several specs seed by hand) survive, so a spec can refresh the session
 * and still keep its seeded fixtures.
 */
export async function refreshSessionAfterModuleChange(page: Page): Promise<void> {
  await page.evaluate(() => {
    const remove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key === 'currentUser' || key === 'lizoft.device-dek') {
        remove.push(key);
        continue;
      }
      if (key.startsWith('lizoft.store-')) {
        const value = localStorage.getItem(key);
        if (value && value.startsWith('enc:v1:')) remove.push(key);
      }
    }
    for (const key of remove) localStorage.removeItem(key);
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
}

/**
 * Mirror of `assertModulesInSession` for a CONSTRUCTED NEGATIVE: the refreshed
 * session must NOT carry any of `moduleIds`.
 *
 * Without this guard a stale session makes a negative gate assertion pass by
 * accident, and a positive one fail for the wrong reason.
 */
export async function assertModulesAbsentFromSession(
  page: Page,
  moduleIds: readonly number[],
): Promise<void> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) {
    throw new Error(
      'assertModulesAbsentFromSession — localStorage.currentUser is empty. Refresh the session ' +
        '(drop the cached profile and reload) before running this guard.',
    );
  }
  let user: { storeModuleIds?: number[] };
  try {
    user = JSON.parse(raw) as typeof user;
  } catch (cause) {
    throw new Error(
      'assertModulesAbsentFromSession — localStorage.currentUser is not valid JSON: ' +
        `${cause instanceof Error ? cause.message : String(cause)}.`,
    );
  }
  const observed = user.storeModuleIds ?? [];
  const present = moduleIds.filter((id) => observed.includes(id));
  if (present.length > 0) {
    throw new Error(
      `the client session still carries module(s) ${present.join(',')} — observed ` +
        `[${observed.join(',')}]. The negative precondition was not actually written: the ` +
        'session was not refreshed after the change, so this gate assertion would be deciding ' +
        'nothing.',
    );
  }
}

/**
 * Registers a private owner, removes module 15 from its store, refreshes the
 * session and PINS the result. Returns the store id, which is what the offline
 * entity keys are scoped by.
 */
export async function mintStoreWithoutMultiMonedas(page: Page): Promise<string> {
  const identity = newTestIdentity();
  const registerPage = new RegisterPage(page);
  await registerPage.goto();
  await registerPage.fillValidForm(identity);
  await registerPage.acceptTerms.check();
  await registerPage.submit();
  // Auto-login (2026-09-28): the registration opens the session itself.
  await page.waitForURL(/\/sales\/products$/);
  const storeId = await readSelectedStoreId(page);

  // `disableStoreModule` pins the direct-DB delete through the real API and
  // throws loudly if module 15 survived it.
  await disableStoreModule(page, storeId, MULTIMONEDAS_MODULE_ID);

  await refreshSessionAfterModuleChange(page);
  await assertModulesAbsentFromSession(page, [MULTIMONEDAS_MODULE_ID]);

  return storeId;
}
