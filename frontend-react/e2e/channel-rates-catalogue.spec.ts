/**
 * channel-rates-catalogue — NEW E2E (payment-channels-and-multipayment, 2026-09-23).
 *
 * Pins the "Tasas por canal" page catalogue and its module-16 gate:
 *   - the method selector only offers methods that EXIST for the chosen currency
 *     (no Zelle+CUP, no Efectivo+MLC); changing currency re-pins the method;
 *   - registering a rate for a named channel renders that channel's label in the
 *     append-only history;
 *   - WITH module 16 the page is offered in the menu and reachable; WITHOUT it
 *     the menu entry is absent and the route is gated (denied).
 *
 * The positive half needs module 16, so it mints a PRIVATE identity (real
 * register + login) and enables the module through the direct-DB precondition
 * fixture. The negative half uses the shared `owner-admin` persona, whose
 * self-registered store is on the Pago birth plan and therefore has NO module 16.
 * No existing spec or support file is modified.
 */

import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { LoginPage } from './support/login-page';
import { RegisterPage } from './support/register-page';
import { newTestIdentity } from './support/identity';
import { readSelectedStoreId } from './support/session';
import { enableMultiPaymentsModule, MULTIPAYMENTS_MODULE_ID } from './support/multipayments-fixture';

const CHANNEL_RATES_PATH = '/management/channel-rates';
const CHANNEL_RATES_LINK = `a[href="${CHANNEL_RATES_PATH}"]`;
const SIDEBAR_TOGGLE = 'Alternar barra lateral';
const SIDEBAR_LABEL = 'Navegación principal';

async function storeModuleIds(page: Page): Promise<number[]> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) throw new Error('channel-rates-catalogue: localStorage.currentUser is empty.');
  const parsed = JSON.parse(raw) as { storeModuleIds?: number[] };
  return parsed.storeModuleIds ?? [];
}

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

test.describe.serial('channel-rates catalogue (módulo 16) — solo canales reales', () => {
  test.describe.configure({ timeout: 180_000 });

  test('solo ofrece canales reales, registrar pinta el label y el menú muestra la página', async ({
    page,
  }) => {
    const identity = newTestIdentity();
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.fillValidForm(identity);
    await registerPage.acceptTerms.check();
    await registerPage.submit();
    await page.waitForURL(/\/login$/);

    const loginPage = new LoginPage(page);
    await loginPage.fill(identity);
    await loginPage.submit();
    await page.waitForURL(/\/sales\/products$/);
    const storeId = await readSelectedStoreId(page);

    await enableMultiPaymentsModule(page, storeId);
    await dropDekAndCiphertext(page);
    const moduleIds = await storeModuleIds(page);
    if (!moduleIds.includes(MULTIPAYMENTS_MODULE_ID)) {
      throw new Error(
        `channel-rates-catalogue: session lacks module ${MULTIPAYMENTS_MODULE_ID} ` +
          `(storeModuleIds=[${moduleIds.join(',')}]).`,
      );
    }

    // WITH module 16 the menu entry is offered.
    await openSidebar(page);
    await expect(page.locator(CHANNEL_RATES_LINK)).toBeVisible();

    await page.goto(CHANNEL_RATES_PATH);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('channel-rate-value')).toBeVisible();

    // CUP offers only Efectivo + Transferencia (no Zelle).
    expect(await optionTexts(page, 'channel-rate-method')).toEqual([
      'Efectivo (CUP)',
      'Transferencia (CUP)',
    ]);

    // USD offers Efectivo + Zelle + Transferencia.
    await page.getByTestId('channel-rate-currency').selectOption('1'); // USD
    expect(await optionTexts(page, 'channel-rate-method')).toEqual([
      'Efectivo (USD)',
      'Zelle (USD)',
      'Transferencia (USD)',
    ]);

    // MLC moves only by Transferencia (Efectivo is not a channel there).
    await page.getByTestId('channel-rate-currency').selectOption('4'); // MLC
    expect(await optionTexts(page, 'channel-rate-method')).toEqual(['Transferencia (MLC)']);

    // Register a rate for a NAMED channel: Transferencia (CUP).
    await page.getByTestId('channel-rate-currency').selectOption('0'); // CUP
    await page.getByTestId('channel-rate-method').selectOption('2'); // Transferencia
    await page.getByTestId('channel-rate-value').fill('50');
    await page.getByTestId('channel-rate-submit').click();
    await expect(page.getByTestId('channel-rate-saved')).toBeVisible();

    const historyRows = page.locator('[data-testid^="channel-rate-row-"]');
    await expect(historyRows).toHaveCount(1);
    await expect(historyRows.first()).toContainText('Transferencia (CUP)');
    await expect(historyRows.first()).toContainText('CUP');
  });
});

test.describe('channel-rates gate sin módulo 16', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin' });

  test('el menú no ofrece la página y la ruta queda gateada', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await openSidebar(page);
    await expect(page.locator(CHANNEL_RATES_LINK)).toHaveCount(0);

    // D11/D12: without module 16 the route is denied through the app's existing
    // gate mechanism — the session is closed and the user lands on /login.
    await page.goto(CHANNEL_RATES_PATH);
    await expect(page).toHaveURL(/\/login$/);
  });
});
