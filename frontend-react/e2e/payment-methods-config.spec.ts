import { test, expect } from './support/test';
import {
  openExpenseFormModal,
  expensePaymentOptions,
} from './support/expense-form-modal';

/**
 * store-payment-methods-config (T7, 2026-09-22) — owner-admin persona:
 *
 * The owner toggles per-store payment methods (Transferencia / Zelle) on
 * `/management/configurations` ("Formas de pago" section). The config is
 * consumed by the expense create/edit modal: a disabled method leaves the
 * payment select, re-enabling restores it. Efectivo is always on and is NOT
 * toggleable.
 *
 * Persona: `owner-admin` — a self-registered owner whose store is on the Pago
 * birth plan (RegisterCommand.cs:71-75 grants exactly the Pago plan modules;
 * MultiMonedas is Superior/VIP-only), so the expense modal offers only
 * Efectivo + Transferencia (CUP) and Zelle is gated out by the plan (covered
 * by payment-methods-plan-gate.spec.ts).
 *
 * The modal is opened in CREATE mode only — nothing is saved, so this spec
 * performs no server-side mutation (read-only persona rule, e2e/README.md).
 */

test.use({ persona: 'owner-admin' });

test.describe.serial('T7 — Formas de pago: config + consumo en modal de gasto', () => {
  test.describe.configure({ timeout: 120_000 });

  test('la sección renderiza con Efectivo fijo y toggles Zelle/Transferencia', async ({
    signedInPage,
  }) => {
    const { page } = signedInPage;

    await page.goto('/management/configurations');

    // Section + heading (CONFIGURATIONS.PAYMENT_METHODS.TITLE)
    const section = page.getByTestId('payment-methods-config');
    await expect(section).toBeVisible();
    await expect(section.getByRole('heading', { name: 'Formas de pago' })).toBeVisible();

    // Efectivo: fixed, always on, NOT toggleable (Switch disabled).
    const efectivo = page.getByRole('switch', { name: 'Efectivo' });
    await expect(efectivo).toBeVisible();
    await expect(efectivo).toBeDisabled();
    await expect(efectivo).toHaveAttribute('aria-checked', 'true');
    await expect(section.getByText('Siempre habilitado')).toBeVisible();

    // Zelle + Transferencia: toggleable, default ON (no-regression default).
    for (const name of ['Zelle', 'Transferencia']) {
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
    const transferencia = page.getByRole('switch', { name: 'Transferencia' });

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