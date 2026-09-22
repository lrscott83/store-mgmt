import { test, expect } from './support/test';
import {
  openExpenseFormModal,
  expensePaymentOptions,
} from './support/expense-form-modal';

/**
 * store-payment-methods-config (T7, 2026-09-22) — plan/module gate over the
 * per-store config:
 *
 * The config can only REMOVE methods from the plan catalogue; plan/module
 * rules apply ON TOP (feature doc, decisión 2026-09-22). The only persona
 * available to this suite is `owner-admin`, whose store was self-registered
 * and therefore sits on the Pago birth plan — and RegisterCommand.cs:71-75
 * grants exactly the Pago plan modules, keeping Superior/VIP-only modules
 * (incl. MultiMonedas 15) out. `expense-form-modal.tsx:127` filters Zelle out
 * BEFORE the config is applied when MultiMonedas is absent, so Zelle must
 * NEVER appear in the expense modal for this store, even when the config
 * toggle is ON (the acceptance criterion "Tienda Pago: Zelle NO aparece
 * aunque esté on en config").
 *
 * COVERAGE GAP (reported, not forced): the MultiMonedas-POSITIVE half — Zelle
 * IS offered + config toggle removes it — is not assertable with the current
 * harness: no persona has MultiMonedas, and no existing seeding helper ADDS
 * paid modules (`store-fixture.ts` only degrades to the free plan; the direct
 * DB seeder is private). Adding module 15 via direct-DB would mutate the
 * shared worker-scoped persona (README e2e/README.md "Specs que mutan estado
 * server-side" contamination warning) and the session's cached
 * `storeModuleIds` would not reflect it until a fresh /me. That half stays a
 * manual-check item / follow-up question.
 */

test.use({ persona: 'owner-admin' });

test.describe('T7 — gate de plan encima de la config (tienda Pago, sin MultiMonedas)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('Zelle nunca aparece en el modal de gasto aunque la config lo tenga ON', async ({
    signedInPage,
  }) => {
    const { page } = signedInPage;

    // Precondition pinning: the Pago store's config page still renders the
    // Zelle toggle AND it is ON (default catalogue — no-regression default).
    await page.goto('/management/configurations');
    const zelleToggle = page.getByRole('switch', { name: 'Zelle' });
    await expect(zelleToggle).toBeVisible();
    await expect(zelleToggle).toHaveAttribute('aria-checked', 'true');

    // The plan gate must win over the config: the expense modal offers
    // exactly the Pago-catalogue methods for CUP — never Zelle.
    await openExpenseFormModal(page);
    expect(await expensePaymentOptions(page)).toEqual(['Efectivo', 'Transferencia (CUP)']);
    await expect(page.getByRole('combobox').nth(1).locator('option', { hasText: 'Zelle' }))
      .toHaveCount(0);
  });
});