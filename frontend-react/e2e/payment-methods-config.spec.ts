import { test, expect } from './support/test';
import {
  openExpenseFormModal,
  expensePaymentOptions,
} from './support/expense-form-modal';

/**
 * store-payment-methods-config (T7, 2026-09-22) — owner-admin persona:
 *
 * The owner toggles per-store payment channels (Transferencia / Zelle, one per
 * currency) on `/management/configurations` ("Métodos de pago" section). The
 * config is consumed by the expense create/edit modal: a disabled channel leaves
 * the payment select, re-enabling restores it. Efectivo is always on and is NOT
 * toggleable.
 *
 * BIRTH PLAN (owner decision 2026-10-13): the persona's store is now born on
 * the **Superior** plan, which carries MultiMonedas (15). Two consequences, both
 * handled without touching an assertion:
 *   - the expense modal now also renders its CURRENCY select, so the payment
 *     select is no longer `combobox` #1 — `expense-form-modal.ts` now targets
 *     the LAST combobox, which is the payment select in either layout;
 *   - the payment catalogue for the default CUP currency is unchanged
 *     (`paymentMethodOptionsForCurrency(CUP)` = Efectivo + Transferencia, and
 *     Zelle is not a CUP channel at all), so the expected option lists are
 *     identical to the ones this spec pinned under the Pago birth plan.
 * Zelle's plan/module gate on a store WITHOUT MultiMonedas is covered by
 * payment-methods-plan-gate.spec.ts.
 *
 * The modal is opened in CREATE mode only — nothing is saved, so this spec
 * performs no server-side mutation (read-only persona rule, e2e/README.md).
 */

test.use({ persona: 'owner-admin' });

test.describe.serial('T7 — Métodos de pago: config + consumo en modal de gasto', () => {
  test.describe.configure({ timeout: 120_000 });

  test('la sección renderiza con Efectivo fijo y toggles Zelle/Transferencia', async ({
    signedInPage,
  }) => {
    const { page } = signedInPage;

    await page.goto('/management/configurations');

    // Section + heading (CONFIGURATIONS.PAYMENT_METHODS.TITLE)
    const section = page.getByTestId('payment-methods-config');
    await expect(section).toBeVisible();
    await expect(section.getByRole('heading', { name: 'Métodos de pago' })).toBeVisible();

    // T20: the section lists EVERY channel of the canonical catalogue, each with
    // a currency-qualified label. Efectivo (one per currency) is fixed, always on
    // and NOT toggleable (Switch disabled), with the "Siempre habilitado" note.
    const cashChannels = [
      'Efectivo (CUP)',
      'Efectivo (USD)',
      'Efectivo (EUR)',
      'Efectivo (CAD)',
      'Efectivo (MXN)',
    ];
    for (const name of cashChannels) {
      const sw = page.getByRole('switch', { name });
      await expect(sw).toBeVisible();
      await expect(sw).toBeDisabled();
      await expect(sw).toHaveAttribute('aria-checked', 'true');
    }
    await expect(section.getByText('Siempre habilitado')).toHaveCount(cashChannels.length);

    // The non-cash channels are toggleable and default ON (no-regression default).
    const toggleableChannels = [
      'Transferencia (CUP)',
      'Zelle (USD)',
      'Transferencia (USD)',
      'Transferencia (MLC)',
      'Transferencia (CLA)',
    ];
    for (const name of toggleableChannels) {
      const sw = page.getByRole('switch', { name });
      await expect(sw).toBeVisible();
      await expect(sw).toBeEnabled();
      await expect(sw).toHaveAttribute('aria-checked', 'true');
    }
  });

  test('default sin configurar: el modal de gasto ofrece Efectivo y Transferencia', async ({
    signedInPage,
  }) => {
    const { page } = signedInPage;

    await openExpenseFormModal(page);
    expect(await expensePaymentOptions(page)).toEqual(['Efectivo', 'Transferencia (CUP)']);
  });

  test('desactivar Transferencia la quita del modal; reactivarla la restaura', async ({
    signedInPage,
  }) => {
    const { page } = signedInPage;
    const transferencia = page.getByRole('switch', { name: 'Transferencia (CUP)' });

    // OFF → saved indicator + the modal stops offering Transferencia.
    await page.goto('/management/configurations');
    await transferencia.click();
    await expect(transferencia).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('payment-methods-saved')).toBeVisible();

    await openExpenseFormModal(page);
    expect(await expensePaymentOptions(page)).toEqual(['Efectivo']);

    // ON again → Efectivo + Transferencia are both offered again.
    await page.goto('/management/configurations');
    await transferencia.click();
    await expect(transferencia).toHaveAttribute('aria-checked', 'true');

    await openExpenseFormModal(page);
    expect(await expensePaymentOptions(page)).toEqual(['Efectivo', 'Transferencia (CUP)']);
  });
});