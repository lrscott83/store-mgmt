import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import {
  openExpenseFormModal,
  expensePaymentOptions,
  expensePaymentSelect,
  EXPENSE_CURRENCY_SELECT,
} from './support/expense-form-modal';
import { readBearerToken } from './support/auth-storage';
import { E2E_API_URL } from './support/backend-url';
import { RegisterPage } from './support/register-page';
import { newTestIdentity } from './support/identity';
import { readSelectedStoreId } from './support/session';
import { MULTIMONEDAS_MODULE_ID, disableStoreModule } from './support/multipayments-fixture';

/**
 * store-payment-methods-config (T7, 2026-09-22) — plan/module gate over the
 * per-store config:
 *
 * The config can only REMOVE methods from the plan catalogue; plan/module rules
 * apply ON TOP (feature doc, decisión 2026-09-22). `expense-form-modal.tsx:127`
 * filters Zelle out BEFORE the config is applied when MultiMonedas is absent,
 * so on a store WITHOUT module 15 Zelle must NEVER appear in the expense modal
 * even when the config toggle is ON (the acceptance criterion "Tienda Pago:
 * Zelle NO aparece aunque esté on en config").
 *
 * ── The gate's two halves (2026-10-13) ───────────────────────────────────
 * This file used to sit on ONE half and declared the other unreachable: "no
 * persona has MultiMonedas" was true only while new stores were born on the Pago
 * plan. The birth plan is now **Superior** (owner decision 2026-10-13,
 * `store-birth-superior`), which carries MultiMonedas (15), so both halves are
 * assertable and BOTH are asserted below:
 *
 *   1. NEGATIVE — the store has module 15 REMOVED (`disableStoreModule` + a
 *      real `GET /v1/auth/me` refresh), on a PRIVATE identity minted in the test
 *      because removing a module is a server-side mutation the shared persona
 *      may never receive (e2e/README.md §"Specs que mutan estado server-side").
 *      Zelle stays absent even though the config says ON.
 *   2. POSITIVE — the shared persona, untouched, keeps module 15; selecting USD
 *      in the expense currency select brings Zelle INTO the catalogue. That is
 *      the half this file previously reported as a coverage gap.
 *
 * The modal is opened in CREATE mode and nothing is saved in either test.
 */

/** Module ids the CLIENT session currently carries (the gate's real input). */
async function sessionModuleIds(page: Page): Promise<number[]> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) throw new Error('payment-methods-plan-gate: localStorage.currentUser is empty.');
  const parsed = JSON.parse(raw) as { storeModuleIds?: number[] };
  return parsed.storeModuleIds ?? [];
}

/**
 * Rewrites `currentUser` from a REAL GET /v1/auth/me and reloads — the app
 * caches a valid profile and never re-calls /me on cold boot, so a module
 * change is invisible to the client until the cache is refreshed. Same shape as
 * configurations.spec.ts / multimonedas.spec.ts / owner-store-create.spec.ts.
 */
async function refreshSessionFromMe(page: Page): Promise<void> {
  const token = await readBearerToken(page);
  const response = await page.request.get(`${E2E_API_URL}/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok()) {
    throw new Error(`refreshSessionFromMe: GET /v1/auth/me failed (${response.status()})`);
  }
  const body = (await response.json()) as { data?: unknown };
  if (!body.data) {
    throw new Error('refreshSessionFromMe: /v1/auth/me returned no data payload');
  }
  await page.evaluate((profile) => {
    window.localStorage.setItem('currentUser', JSON.stringify(profile));
    window.localStorage.setItem(
      'current-store-id',
      (profile as { selectedStoreId?: string }).selectedStoreId ?? '',
    );
  }, body.data);
  await page.reload();
}

test.use({ persona: 'owner-admin' });

test.describe('T7 — gate de plan encima de la config', () => {
  test.describe.configure({ timeout: 120_000 });

  test('Zelle nunca aparece en el modal de gasto aunque la config lo tenga ON', async ({
    page,
  }) => {
    // PRIVATE identity: the negative half needs a store WITHOUT MultiMonedas,
    // and removing a module is a server-side mutation the shared persona may
    // never receive. Superior (the birth plan) already carries the module.
    const identity = newTestIdentity();
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.fillValidForm(identity);
    await registerPage.acceptTerms.check();
    await registerPage.submit();
    await page.waitForURL(/\/sales\/products$/);
    const storeId = await readSelectedStoreId(page);

    await disableStoreModule(page, storeId, MULTIMONEDAS_MODULE_ID);
    await refreshSessionFromMe(page);
    expect(await sessionModuleIds(page)).not.toContain(MULTIMONEDAS_MODULE_ID);

    // The config page still renders the Zelle toggle AND it is ON (default
    // catalogue — no-regression default): the config says yes...
    await page.goto('/management/configurations');
    const zelleToggle = page.getByRole('switch', { name: 'Zelle (USD)' });
    await expect(zelleToggle).toBeVisible();
    await expect(zelleToggle).toHaveAttribute('aria-checked', 'true');

    // ...and the plan/module gate still wins over it: the expense modal offers
    // exactly the CUP catalogue — Efectivo + Transferencia (CUP) — never Zelle.
    await openExpenseFormModal(page);
    expect(await expensePaymentOptions(page)).toEqual(['Efectivo', 'Transferencia (CUP)']);
    await expect(expensePaymentSelect(page).locator('option', { hasText: 'Zelle' })).toHaveCount(
      0,
    );
  });

  test('con MultiMonedas el catálogo de USD SÍ ofrece Zelle (la otra mitad del gate)', async ({
    signedInPage,
  }) => {
    const { page } = signedInPage;

    // The shared persona is born on Superior, so its store HAS module 15 — the
    // positive half needs no mutation at all, which is why it was unreachable
    // while the birth plan was Pago.
    await page.goto('/management/configurations');
    const zelleToggle = page.getByRole('switch', { name: 'Zelle (USD)' });
    await expect(zelleToggle).toBeVisible();
    await expect(zelleToggle).toHaveAttribute('aria-checked', 'true');

    await openExpenseFormModal(page);

    // The module is what adds Zelle, but only for a currency that HAS a Zelle
    // channel: CUP's catalogue is Efectivo + Transferencia
    // (paymentMethodOptionsForCurrency), so the currency is switched to USD
    // before reading the payment options.
    const currencySelect = page.getByTestId(EXPENSE_CURRENCY_SELECT);
    await expect(currencySelect).toBeVisible();
    await currencySelect.selectOption('1'); // Currency.USD

    expect(await expensePaymentOptions(page)).toEqual([
      'Efectivo',
      'Zelle',
      'Transferencia (USD)',
    ]);
  });
});
