import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { Client } from 'pg';
import { assertStoresFeature } from './support/store-fixture';
import { readBearerToken } from './support/auth-storage';
import { E2E_API_URL } from './support/backend-url';

/**
 * [owner-stores-cards] E2E Playwright — docs/plans/2026-09-08-owner-stores-cards-plan.md §5.4.
 *
 * Covers the owner's "Mis tiendas" cards view at /management/my-stores: one card per
 * owned store (active AND inactive) with plan type, next billing date and the paid
 * total (struck-through when discounted), plus the two gear popups — Editar
 * (name + isActive, riding PUT /v1/stores/{id} + PUT /v1/stores/{id}/activation) and
 * Editar el plan (the same plan view as store-plan.tsx inside a modal, DG-7 readOnly
 * included).
 *
 * Matrix E-01..E-10. NEVER touches existing specs (CLAUDE.md E2E rule) — this is a
 * brand-new file.
 *
 * Cost: one real login per test (owner-admin persona), well under the LoginPolicy
 * ceiling (10/min). Direct-DB seeds follow the store-plan-lock-regression pattern
 * (precondition pinning through the real API where reachable).
 */

test.use({ persona: 'owner-admin' });

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const DEFAULT_DB_URL = 'postgresql://postgres:postgres@localhost:5432/smca_test';

/** Reads one store row straight from the DB (E2E_DB_URL overrides the default). */
async function readStoreRow(storeId: string): Promise<{ isActive: boolean; name: string }> {
  const connectionString = process.env['E2E_DB_URL'] ?? DEFAULT_DB_URL;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query(
      'SELECT "IsActive", "Name" FROM "Store" WHERE "Id" = $1',
      [storeId],
    );
    if (result.rowCount !== 1) {
      throw new Error(`owner-stores: expected exactly 1 Store row for ${storeId}`);
    }
    return { isActive: result.rows[0].IsActive === true, name: result.rows[0].Name };
  } finally {
    await client.end();
  }
}

/** Sets a store's IsActive directly in the DB (seeding the inactive-card state). */
async function setStoreActiveDirect(storeId: string, isActive: boolean): Promise<void> {
  const connectionString = process.env['E2E_DB_URL'] ?? DEFAULT_DB_URL;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query(
      'UPDATE "Store" SET "IsActive" = $1 WHERE "Id" = $2',
      [isActive, storeId],
    );
    if (result.rowCount !== 1) {
      throw new Error(
        `owner-stores: setStoreActiveDirect(${storeId}, ${isActive}) touched ${result.rowCount} rows`,
      );
    }
  } finally {
    await client.end();
  }
}

/** Pins the my-stores listing precondition through the real API. */
async function readMyStores(page: Page, storeId: string): Promise<{ isActive: boolean }> {
  const token = await readBearerToken(page);
  const response = await page.request.get(`${E2E_API_URL}/v1/stores/my-stores`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok()) {
    throw new Error(`owner-stores: GET my-stores failed (${response.status()})`);
  }
  const body = (await response.json()) as {
    data?: { id: string; isActive: boolean }[];
  };
  const mine = body.data?.find((s) => s.id === storeId);
  if (!mine) {
    throw new Error(`owner-stores: store ${storeId} not in my-stores listing`);
  }
  return { isActive: mine.isActive };
}

test('E-01..E-05 — cards render plan, next due date and discounted price', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;

  // REQ-13/D9 — a silent logout must not become confusing downstream failures.
  await assertStoresFeature(page);

  // The owner-admin persona's store is on the PAID plan by default (auto-register
  // delivers every module) — pin the listing shape before rendering assertions.
  const listed = await readMyStores(page, selectedStoreId);
  expect(listed.isActive).toBe(true);

  await page.goto('/management/my-stores');

  // E-01: the own card renders with the store name and the gear.
  const card = page.getByTestId(`owner-store-card-${selectedStoreId}`);
  await expect(card).toBeVisible();
  await expect(page.getByTestId(`owner-store-actions-toggle-${selectedStoreId}`)).toBeVisible();

  // E-03: paid plan shape — "Plan de Pago" + next due date + price.
  await expect(page.getByTestId(`owner-store-body-${selectedStoreId}`)).toContainText(
    'Plan de Pago',
  );

  // E-04: next billing date line renders (paid store — the persona seed sets a
  // PaymentStartDate at birth, so a date is calculable).
  await expect(page.getByTestId(`owner-store-next-due-${selectedStoreId}`)).toBeVisible();

  // E-05: the paid total renders. When the catalog carries a discount the original
  // is struck through next to the current price; either way the price line exists.
  await expect(page.getByTestId(`owner-store-price-${selectedStoreId}`)).toBeVisible();

  // E-02: seed an inactive second store directly in the DB, reload, and pin the
  // inactive styling + badge. The persona owns exactly one store, so we flip the
  // SAME store inactive after the assertions above (serial mode keeps order).
  await setStoreActiveDirect(selectedStoreId, false);
  await page.reload();

  await expect(page.getByTestId(`owner-store-inactive-${selectedStoreId}`)).toBeVisible();
  // Inactive stores still appear in the listing (the key my-stores difference).
  await expect(card).toBeVisible();
  // Restore the active state for the following tests.
  await setStoreActiveDirect(selectedStoreId, true);
});

test('E-06 — Editar popup renames the store', async ({ signedInPage }) => {
  const { page, selectedStoreId } = signedInPage;
  await assertStoresFeature(page);
  await page.goto('/management/my-stores');

  await page.getByTestId(`owner-store-actions-toggle-${selectedStoreId}`).click();
  await page.getByTestId(`owner-store-edit-${selectedStoreId}`).click();

  const input = page.getByTestId(`owner-store-name-input-${selectedStoreId}`);
  await expect(input).toBeVisible();

  const newName = `E2E-MY-STORES-${Date.now()}`;
  await input.fill(newName);
  await page.getByTestId(`owner-store-save-${selectedStoreId}`).click();

  // The card refreshes with the new name (re-list after the save).
  await expect(page.getByTestId(`owner-store-card-${selectedStoreId}`)).toContainText(newName);

  // Precondition pin: the rename actually landed in the DB.
  const row = await readStoreRow(selectedStoreId);
  expect(row.name).toBe(newName);
});

test('E-07 — Editar popup deactivates and reactivates the store', async ({ signedInPage }) => {
  const { page, selectedStoreId } = signedInPage;
  await assertStoresFeature(page);
  await page.goto('/management/my-stores');

  // Deactivate through the popup (confirm dialog R-1 accepts).
  await page.getByTestId(`owner-store-actions-toggle-${selectedStoreId}`).click();
  await page.getByTestId(`owner-store-edit-${selectedStoreId}`).click();
  await page.getByTestId(`owner-store-active-toggle-${selectedStoreId}`).click();

  const confirmButton = page.getByTestId('confirm-dialog-confirm');
  await page.getByTestId(`owner-store-save-${selectedStoreId}`).click();
  await confirmButton.click();

  // The card repaints with the inactive badge (setStoreActivation exercised for real).
  await expect(page.getByTestId(`owner-store-inactive-${selectedStoreId}`)).toBeVisible();

  // Pin: the flag really flipped in the DB.
  expect((await readStoreRow(selectedStoreId)).isActive).toBe(false);

  // Reactivate through the same popup (no confirm needed for activation).
  await page.getByTestId(`owner-store-actions-toggle-${selectedStoreId}`).click();
  await page.getByTestId(`owner-store-edit-${selectedStoreId}`).click();
  await page.getByTestId(`owner-store-active-toggle-${selectedStoreId}`).click();
  await page.getByTestId(`owner-store-save-${selectedStoreId}`).click();

  await expect(page.getByTestId(`owner-store-inactive-${selectedStoreId}`)).toHaveCount(0);
  expect((await readStoreRow(selectedStoreId)).isActive).toBe(true);
});

test('E-09 — Editar el plan popup locks the paid store for the owner (DG-7)', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;
  await assertStoresFeature(page);
  await page.goto('/management/my-stores');

  await page.getByTestId(`owner-store-actions-toggle-${selectedStoreId}`).click();
  await page.getByTestId(`owner-store-edit-plan-${selectedStoreId}`).click();

  const modal = page.getByTestId(`owner-store-plan-modal-${selectedStoreId}`);
  await expect(modal).toBeVisible();

  // Same discriminating check as store-plan-lock-regression.spec.ts: on the FREE
  // tab, the "Activar este plan" button would render if readOnly were false. The
  // persona's store is on the PAID plan, so the DG-7 lock must hide it.
  await page.getByRole('tab', { name: /Gratis/ }).click();
  await expect(page.getByRole('button', { name: 'Activar este plan' })).toHaveCount(0);
});

test('E-08 — Editar el plan popup saves a plan change on a free store', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;
  await assertStoresFeature(page);

  // Degrade to free first (fixture pins both halves: free-only modules AND a
  // non-null paymentStartDate — the real "no paid module selected" shape).
  const { degradeStoreToFreePlan } = await import('./support/store-fixture');
  await degradeStoreToFreePlan(page, selectedStoreId);

  await page.goto('/management/my-stores');

  // Free shape on the card (E-03 free half): no date line, no price line.
  await expect(page.getByTestId(`owner-store-body-${selectedStoreId}`)).toContainText(
    'Plan Gratis',
  );
  await expect(page.getByTestId(`owner-store-next-due-${selectedStoreId}`)).toHaveCount(0);
  await expect(page.getByTestId(`owner-store-price-${selectedStoreId}`)).toHaveCount(0);

  // Open the plan popup; on the paid tab the activation button IS available now.
  await page.getByTestId(`owner-store-actions-toggle-${selectedStoreId}`).click();
  await page.getByTestId(`owner-store-edit-plan-${selectedStoreId}`).click();
  await page.getByRole('tab', { name: /Pago/ }).click();
  await page.getByRole('button', { name: 'Activar este plan' }).click();

  // Save rides the full module-set update (same shape as the plan view).
  await page.getByTestId(`owner-plan-save-${selectedStoreId}`).click();

  // After the save the card repaints as PAID: plan label + price line back.
  await expect(page.getByTestId(`owner-store-body-${selectedStoreId}`)).toContainText(
    'Plan de Pago',
    { timeout: 30_000 },
  );
  await expect(page.getByTestId(`owner-store-price-${selectedStoreId}`)).toBeVisible();

  // Restore the paid modules for any following tests (the persona default is paid).
  // The popup already activated the paid plan — nothing else to seed.
});
