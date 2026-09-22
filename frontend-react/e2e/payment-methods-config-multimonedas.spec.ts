import { test, expect } from './support/test';
import { openExpenseFormModal } from './support/expense-form-modal';
import {
  mintMultiMonedasOwner,
  multimonedasPaymentOptions,
} from './support/store-multimonedas-fixture';

/**
 * store-payment-methods-config (T7 — MultiMonedas-POSITIVE half, 2026-09-22):
 *
 * With the MultiMonedas module (15) active on the store, the plan gate stops
 * blocking Zelle in the expense modal. This spec proves, END TO END:
 *
 *   1. `/management/configurations` shows the Zelle toggle (always true), AND
 *      the expense modal actually OFFERS Zelle when the expense currency is
 *      USD — the plan gate no longer removes it.
 *   2. Toggling Zelle OFF removes it from the USD payment catalog in the
 *      modal; toggling back ON restores it.
 *
 * The plan-gate invariant stays intact: this spec NEVER touches the Pago
 * persona (payment-methods-plan-gate.spec.ts). It mints a PRIVATE owner whose
 * store is upgraded to Superior through the app's own `change-plan` endpoint
 * (SuperAdmin caller — the only legitimate path to Superior/VIP,
 * ChangeStorePlanCommandHandler.cs:97-101). See
 * `support/store-multimonedas-fixture.ts` for the mint.
 *
 * Payment catalog with USD (domain `paymentMethodOptionsForCurrency` +
 * `salePaymentMethodLabel`, sale-payment-method-compat.ts:54-66):
 *   - all methods enabled → ['Efectivo', 'Zelle', 'Transferencia (USD)']
 *   - Zelle disabled by config → ['Efectivo', 'Transferencia (USD)']
 *
 * The modal's CurrencySelect only renders with module 15 in the session
 * (currency-select.tsx:40-42) — its visibility is asserted before every
 * payment-catalog read so the payment combobox index (2) is guaranteed.
 */

test.describe.serial('T7 — Formas de pago con MultiMonedas: Zelle en USD', () => {
  test.describe.configure({ timeout: 180_000 });
  // One test on purpose (same pattern as store-plan-activation.spec.ts:11-15):
  // the mint costs 2 registrations + 3 logins and its identity is private —
  // splitting would re-mint per test and spend the login budget on setup.

  test('Zelle visible en USD con el módulo activo; apagado lo quita; reactivado lo restaura', async ({
    page,
    browser,
  }) => {
    // Mint: private owner, store upgraded to Superior via the app's own API;
    // page lands signed in as the owner with module 15 in the session.
    await mintMultiMonedasOwner(page, browser);

    // 1. Config section renders with the Zelle toggle ON (config section is
    //    plan-independent; Efectivo stays fixed and disabled).
    await page.goto('/management/configurations');
    const section = page.getByTestId('payment-methods-config');
    await expect(section).toBeVisible();
    await expect(section.getByRole('heading', { name: 'Formas de pago' })).toBeVisible();

    const efectivo = page.getByRole('switch', { name: 'Efectivo' });
    await expect(efectivo).toBeVisible();
    await expect(efectivo).toBeDisabled();
    await expect(efectivo).toHaveAttribute('aria-checked', 'true');
    await expect(section.getByText('Siempre habilitado')).toBeVisible();

    const zelle = page.getByRole('switch', { name: 'Zelle' });
    await expect(zelle).toBeVisible();
    await expect(zelle).toBeEnabled();
    await expect(zelle).toHaveAttribute('aria-checked', 'true');

    // 1b. PLAN GATE IS OFF: the currency select renders (module 15 active) and
    //     the Zelle removal the plan gate used to do is gone — Zelle is
    //     offered for USD.
    await openExpenseFormModal(page);
    const currency = page.getByTestId('expense-currency-select');
    await expect(currency).toBeVisible();
    // Currency.USD = 1 (domain enums/index.ts:116); default is CUP (0).
    await currency.selectOption('1');
    expect(await multimonedasPaymentOptions(page)).toEqual([
      'Efectivo',
      'Zelle',
      'Transferencia (USD)',
    ]);

    // 2a. Zelle OFF → saved indicator, and the modal stops offering Zelle for USD.
    await page.goto('/management/configurations');
    await zelle.click();
    await expect(zelle).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('payment-methods-saved')).toBeVisible();

    await openExpenseFormModal(page);
    await expect(page.getByTestId('expense-currency-select')).toBeVisible();
    await page.getByTestId('expense-currency-select').selectOption('1');
    expect(await multimonedasPaymentOptions(page)).toEqual(['Efectivo', 'Transferencia (USD)']);

    // 2b. Zelle ON again → restored in the modal.
    await page.goto('/management/configurations');
    await zelle.click();
    await expect(zelle).toHaveAttribute('aria-checked', 'true');

    await openExpenseFormModal(page);
    await expect(page.getByTestId('expense-currency-select')).toBeVisible();
    await page.getByTestId('expense-currency-select').selectOption('1');
    expect(await multimonedasPaymentOptions(page)).toEqual([
      'Efectivo',
      'Zelle',
      'Transferencia (USD)',
    ]);
  });
});