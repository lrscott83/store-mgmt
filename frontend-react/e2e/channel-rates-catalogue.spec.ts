/**
 * channel-rates-catalogue — NEW E2E (payment-channels-and-multipayment, 2026-09-23).
 * Module gate corrected 2026-10-03.
 *
 * Pins the "Tasas por canal" page catalogue and its MODULE GATE:
 *   - the currency list omits USD on purpose (the synthetic pivot), and the
 *     method selector only offers methods that EXIST for the chosen currency
 *     (no Zelle+CUP, no Transferencia+EUR, no Efectivo+MLC); changing currency
 *     re-pins the method;
 *   - registering a rate for a named channel renders that channel's label in the
 *     append-only history;
 *   - the page is offered in the menu and reachable ONLY with module 15
 *     (MultiMonedas), and WITHOUT it the menu entry is absent and the route is
 *     denied.
 *
 * ── The gate is module 15, NOT module 16 (2026-10-03) ─────────────────────
 * This spec used to enable module 16 (MultiPayments) and expect the page, and it
 * failed forever. The menu entry carries `moduleIds: [EModules.MultiMonedas]`
 * (menu-config.ts:430-433), the sidebar drops any item whose module is missing
 * (sidebar.tsx:26-28), and the route itself demands it (channel-rates.tsx:29-32).
 * Module 16 buys nothing here: with 16 alone the link stays hidden. Channels and
 * their equivalence exist only because MultiMonedas gives the store more than one
 * currency to convert.
 *
 * So this spec now pins BOTH sides of that fact on one store: with module 16 and
 * WITHOUT module 15 the page must be absent, and adding module 15 makes it appear.
 * That pair is what no other spec asserts, and it is what would have caught the
 * original defect.
 *
 * Reaching the catalogue exposed a SECOND defect the gate had been hiding: the
 * currency list does NOT offer USD on this page (a USD-keyed row is the
 * synthetic "1 USD = 1 USD" pivot and could never convert), yet this spec had
 * been selecting USD and waiting for three channels. Fixed above.
 *
 * The positive half needs a module no Pago store has, so it mints a PRIVATE
 * identity (real register + login) and seeds it through the shared module
 * fixture. The second half uses the shared `owner-admin` persona, whose
 * self-registered store is on the Pago birth plan and therefore has neither 15
 * nor 16.
 */

import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { RegisterPage } from './support/register-page';
import { newTestIdentity } from './support/identity';
import { readSelectedStoreId } from './support/session';
import {
  CHANNEL_RATES_MODULES,
  MULTIMONEDAS_MODULE_ID,
  MULTIPAYMENTS_MODULE_ID,
  assertModulesInSession,
  enableStoreModule,
} from './support/multipayments-fixture';

const CHANNEL_RATES_PATH = '/management/channel-rates';
const CHANNEL_RATES_LINK = `a[href="${CHANNEL_RATES_PATH}"]`;
const SIDEBAR_TOGGLE = 'Alternar barra lateral';
const SIDEBAR_LABEL = 'Navegación principal';

async function dropDekAndCiphertext(page: Page): Promise<void> {
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

/** Opens the sidebar (collapsed by default) via its navbar toggle. */
async function openSidebar(page: Page): Promise<void> {
  const nav = page.locator(`nav[aria-label="${SIDEBAR_LABEL}"]`);
  if (!(await nav.getAttribute('class'))?.includes('w-64')) {
    await page.getByRole('button', { name: SIDEBAR_TOGGLE }).click();
  }
  await expect(nav).toHaveClass(/w-64/);
}

/** Option labels of a <select>, in order. */
async function optionTexts(page: Page, testId: string): Promise<string[]> {
  return page.getByTestId(testId).locator('option').allInnerTexts();
}

/** Module ids the CLIENT session currently carries. */
async function sessionModuleIds(page: Page): Promise<number[]> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) throw new Error('channel-rates-catalogue: localStorage.currentUser is empty.');
  const parsed = JSON.parse(raw) as { storeModuleIds?: number[] };
  return parsed.storeModuleIds ?? [];
}

test.describe.serial('channel-rates catalogue (gate: módulo 15 MultiMonedas)', () => {
  test.describe.configure({ timeout: 180_000 });

  test('el 15 es lo que abre la vista; con él el catálogo ofrece canales reales y el alta pinta su label', async ({
    page,
  }) => {
    const identity = newTestIdentity();
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.fillValidForm(identity);
    await registerPage.acceptTerms.check();
    await registerPage.submit();
    // Auto-login (2026-09-28): the registration opens the session itself, so the
    // explicit login that used to sit here is gone.
    await page.waitForURL(/\/sales\/products$/);
    const storeId = await readSelectedStoreId(page);

    // ── Half 1: module 16 alone does NOT buy this page ─────────────────────
    // Seed the WRONG module first and prove the page is still not offered. This
    // is the assertion the old spec was missing, and it is the one that pins
    // module 15 as the real gate.
    await enableStoreModule(page, storeId, MULTIPAYMENTS_MODULE_ID);
    await dropDekAndCiphertext(page);
    await assertModulesInSession(page, [MULTIPAYMENTS_MODULE_ID]);
    // Pin the negative precondition itself: module 15 is genuinely absent, so
    // the absent link below proves the gate instead of passing by accident.
    expect(await sessionModuleIds(page)).not.toContain(MULTIMONEDAS_MODULE_ID);
    await openSidebar(page);
    await expect(page.locator(CHANNEL_RATES_LINK)).toHaveCount(0);
    // The route's own denial is pinned by the second describe below; asserting
    // it here would logout() the session mid-test (denyAccess calls logout) and
    // force a second login to reach half 2.

    // ── Half 2: module 15 is what unlocks it ───────────────────────────────
    await enableStoreModule(page, storeId, MULTIMONEDAS_MODULE_ID);
    await dropDekAndCiphertext(page);
    await assertModulesInSession(page, CHANNEL_RATES_MODULES);

    await openSidebar(page);
    await expect(page.locator(CHANNEL_RATES_LINK)).toBeVisible();

    await page.goto(CHANNEL_RATES_PATH);
    await page.waitForLoadState('networkidle');

    // T22: registration lives in the `+ Tasa` popup (the inline card is gone),
    // so the form is only reachable after opening it.
    await page.getByTestId('channel-rate-add').click();
    await expect(page.getByTestId('channel-rate-add-dialog')).toBeVisible();
    await expect(page.getByTestId('channel-rate-buy-value')).toBeVisible();
    await expect(page.getByTestId('channel-rate-sell-value')).toBeVisible();

    // CUP offers only Efectivo + Transferencia (no Zelle).
    expect(await optionTexts(page, 'channel-rate-method')).toEqual([
      'Efectivo (CUP)',
      'Transferencia (CUP)',
    ]);

    // USD is deliberately NOT offered on this page (channel-rates.tsx:41-51):
    // a USD-keyed row is the synthetic "1 USD = 1 USD" pivot and could never
    // convert anything. This spec used to pick USD here and wait for three
    // channels — it failed, but the module gate killed it 50 lines earlier, so
    // the stale expectation went unnoticed. The rule is business logic, so it
    // is pinned instead of assumed.
    expect(await optionTexts(page, 'channel-rate-currency')).not.toContain('USD');

    // EUR moves in cash only: neither Zelle nor Transferencia exists there.
    await page.getByTestId('channel-rate-currency').selectOption('2'); // EUR
    expect(await optionTexts(page, 'channel-rate-method')).toEqual(['Efectivo (EUR)']);

    // MLC moves only by Transferencia (Efectivo is not a channel there).
    await page.getByTestId('channel-rate-currency').selectOption('4'); // MLC
    expect(await optionTexts(page, 'channel-rate-method')).toEqual(['Transferencia (MLC)']);

    // Register a rate for a NAMED channel: Transferencia (CUP). The buy/sell
    // migration (ddd41489) split the single value into two inputs.
    await page.getByTestId('channel-rate-currency').selectOption('0'); // CUP
    await page.getByTestId('channel-rate-method').selectOption('2'); // Transferencia
    await page.getByTestId('channel-rate-buy-value').fill('50');
    await page.getByTestId('channel-rate-sell-value').fill('50');
    await page.getByTestId('channel-rate-submit').click();
    await expect(page.getByTestId('channel-rate-saved')).toBeVisible();

    const historyRows = page.locator('[data-testid^="channel-rate-row-"]');
    await expect(historyRows).toHaveCount(1);
    await expect(historyRows.first()).toContainText('Transferencia (CUP)');
    await expect(historyRows.first()).toContainText('CUP');
  });
});

test.describe('channel-rates gate sin módulo 15 (tienda en plan Pago)', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin' });

  test('el menú no ofrece la página y la ruta queda gateada', async ({ signedInPage }) => {
    const { page } = signedInPage;

    // The shared persona's store is on the Pago birth plan, which carries
    // neither 15 nor 16 — the honest negative for a store that never bought
    // MultiMonedas.
    await openSidebar(page);
    await expect(page.locator(CHANNEL_RATES_LINK)).toHaveCount(0);

    // D11/D12: without module 15 the route is denied through the app's existing
    // gate mechanism — the session is closed and the user lands on /login.
    await page.goto(CHANNEL_RATES_PATH);
    await expect(page).toHaveURL(/\/login$/);
  });
});
