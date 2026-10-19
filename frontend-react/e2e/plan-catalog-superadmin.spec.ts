import { test, expect } from './support/test';
import type { Locator } from '@playwright/test';
import { mintSuperAdmin, applySuperAdminSnapshot } from './support/superadmin-session';

/**
 * plan-catalog-superadmin (plan docs/plans/2026-09-21-superadmin-plan-catalog-vip-multimonedas.md)
 *
 * NEW spec file — no existing spec is touched. Covers, on the REAL /admin/stores
 * popup (EditPlanModal + PlanPanels) fed by the REAL GET /v1/plans:
 *
 *   PCF1 — the SuperAdmin change-plan popup renders the FOUR plan panels,
 *          including VIP (previously excluded server-side for every caller).
 *   PCF2 — the Superior panel lists "Múltiples monedas" (module 15) and the
 *          VIP panel lists its exclusive modules ("Múltiples pagos" 16,
 *          "Elaboración" 17) — the exact claims that failed on the user's
 *          environment.
 *
 * ── Why PCF2 expands panels instead of clicking them (2026-10-13) ─────────
 * `PlanPanels` is a SINGLE-STATE accordion that starts with the store's ACTIVE
 * plan open (plan-panels.tsx:124,133). Since the birth plan is now Superior
 * (owner decision 2026-10-13, `store-birth-superior`), the popup opened on the
 * first card very often has Superior already open — and this test's blind
 * `click()` was COLLAPSING it, which is what made "Múltiples monedas" vanish.
 * `expandPlanPanel` opens a panel only when it is closed and then pins
 * `aria-expanded="true"`, so the assertions are about the panel's CONTENT, never
 * about which plan happened to be the active one.
 *
 * Cost: ONE SuperAdmin mint (register + 2 logins), same budget as
 * superadmin-smoke.spec.ts / owner-hard-delete.spec.ts.
 */

let superAdmin: Awaited<ReturnType<typeof mintSuperAdmin>>;

/** Opens a plan panel if it is closed, then pins that it is open. */
async function expandPlanPanel(modal: Locator, header: RegExp): Promise<void> {
  const button = modal.getByRole('button', { name: header });
  await expect(button).toBeVisible();
  if ((await button.getAttribute('aria-expanded')) !== 'true') {
    await button.click();
  }
  await expect(button).toHaveAttribute('aria-expanded', 'true');
}

test.describe.serial('Plan catalog — SuperAdmin popup (VIP visible, MultiMonedas in Superior)', () => {
  test.beforeAll(async ({ browser }) => {
    superAdmin = await mintSuperAdmin(browser);
  });

  /** Opens the first store card's change-plan popup on /admin/stores. */
  async function openChangePlanModal(page: import('@playwright/test').Page) {
    await applySuperAdminSnapshot(page, superAdmin);
    await page.goto('/admin/stores');

    // Default filter is "No Gratis" — the minted SuperAdmin's own store is on
    // the free trial, so switch to "Todos" to guarantee at least one card.
    const allFilter = page.getByRole('button', { name: 'Todos' });
    if (await allFilter.isVisible().catch(() => false)) {
      await allFilter.click();
    }

    const gear = page.locator('[data-testid^="store-actions-toggle-"]').first();
    await expect(gear).toBeVisible();
    await gear.click();
    await page.getByRole('menuitem', { name: 'Cambiar plan' }).click();

    const modal = page.locator('[data-testid^="owner-store-plan-modal-"]');
    await expect(modal).toBeVisible();
    return modal;
  }

  test('PCF1 — the popup shows the four plan panels including VIP', async ({ page }) => {
    const modal = await openChangePlanModal(page);

    await expect(modal.getByRole('button', { name: /^Gratis/ })).toBeVisible();
    await expect(modal.getByRole('button', { name: /^Pago/ })).toBeVisible();
    await expect(modal.getByRole('button', { name: /^Superior/ })).toBeVisible();
    await expect(modal.getByRole('button', { name: /^VIP/ })).toBeVisible();
  });

  test('PCF2 — Superior lists "Múltiples monedas" and "Elaboración"; VIP lists its exclusive "Múltiples pagos"', async ({
    page,
  }) => {
    const modal = await openChangePlanModal(page);

    // Superior delta vs Pago: Warehouses, MultiStores, MultiMonedas, Elaboración…
    await expandPlanPanel(modal, /^Superior/);
    await expect(modal.getByText('Múltiples monedas')).toBeVisible();
    await expect(modal.getByText('Elaboración')).toBeVisible();

    // VIP delta vs Superior: ONLY "Múltiples pagos" (module 16) — 15 and 17
    // are already in Superior (seed matrix pinned by StorePlanCatalogTests).
    await expandPlanPanel(modal, /^VIP/);
    await expect(modal.getByText('Múltiples pagos')).toBeVisible();
  });
});
