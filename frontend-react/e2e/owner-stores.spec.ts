import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { Client } from 'pg';
import { assertStoresFeature } from './support/store-fixture';
import { installPlanChangeObserver } from './support/plan-change-observer';
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

/**
 * Seeds a SECOND store for the same owner (reference store's OwnerId/TenantId,
 * direct DB INSERT) in the INACTIVE state. Plan E-02 originally asked for an
 * inactive second store, and it is the only safe shape for the badge assertion:
 * flipping the owner's ONLY store inactive would kill their StoresAdmin claim
 * (backend pins this — MyStoresTests "an owner whose ONLY store is inactive
 * loses the StoresAdmin claim"), and `load()` would fail the listing right at
 * the point E-02 wants to see the card. Same OwnerId/TenantId means the global
 * teardown's Owner→User `e2e-%` sweep cleans the new row automatically.
 */
async function seedInactiveSecondStore(referenceStoreId: string): Promise<string> {
  const connectionString = process.env['E2E_DB_URL'] ?? DEFAULT_DB_URL;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const owner = await client.query('SELECT "OwnerId", "TenantId" FROM "Store" WHERE "Id" = $1', [
      referenceStoreId,
    ]);
    if (owner.rowCount !== 1) {
      throw new Error(`owner-stores: no Store row found to copy Owner/Tenant from (${referenceStoreId})`);
    }
    const secondStoreId = randomUUID();
    await client.query(
      `INSERT INTO "Store"
         ("Id", "Name", "Address", "Description", "Approved", "CreatedBy", "CreatedDate",
          "IsActive", "OwnerId", "PaymentStartDate", "StorePlanId", "TenantId", "UpdatedBy", "UpdatedDate")
       VALUES ($1, $2, NULL, NULL, true, '00000000-0000-0000-0000-000000000000', now(), false, $3, NULL, 2, $4, NULL, NULL)`,
      [secondStoreId, `e2e-owner-stores-inactive-${Date.now()}`, owner.rows[0].OwnerId, owner.rows[0].TenantId],
    );
    return secondStoreId;
  } catch (cause) {
    throw new Error(
      `owner-stores: seedInactiveSecondStore(${referenceStoreId}) failed — the inactive second ` +
        `store was not written: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
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

  // E-02: seed an inactive SECOND store directly in the DB, reload, and pin the
  // inactive styling + badge. The persona's own store stays ACTIVE: deactivating
  // the owner's ONLY store would kill the StoresAdmin claim (backend pins this)
  // and `load()` would fail the whole listing. A second inactive store renders
  // the badge without breaking auth.
  const inactiveStoreId = await seedInactiveSecondStore(selectedStoreId);
  await page.reload();

  await expect(page.getByTestId(`owner-store-inactive-${inactiveStoreId}`)).toBeVisible();
  // Inactive stores still appear in the listing (the key my-stores difference).
  const secondCard = page.getByTestId(`owner-store-card-${inactiveStoreId}`);
  await expect(secondCard).toBeVisible();
  // The persona's own store stays ACTIVE after the reload (auth contract).
  await expect(page.getByTestId(`owner-store-inactive-${selectedStoreId}`)).toHaveCount(0);
  await expect(card).toBeVisible();
  // Leave the second store ACTIVE for E-07: deactivating the selected store
  // through the popup must still leave the owner at least one active store
  // (same auth contract), or load() would fail after that save too.
  await setStoreActiveDirect(inactiveStoreId, true);
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

  // The popup deactivates a SECOND store, never the token's selected store. The
  // per-request permission derivation (HasUserPermissionRequirementFilter ->
  // StoreModuleRepository.GetAvailableModulesByStoreIdAsync) filters
  // sm.Store.IsActive for the token's own StoreId, so deactivating the selected
  // store drops the StoresAdmin claim mid-session (zero modules -> 403) even when
  // the owner still owns another active store. Seed + activate so the cycle
  // starts from the ACTIVE state, matching the popup toggle's "on -> off" path.
  const targetStoreId = await seedInactiveSecondStore(selectedStoreId);
  await setStoreActiveDirect(targetStoreId, true);
  await page.goto('/management/my-stores');
  await expect(page.getByTestId(`owner-store-card-${targetStoreId}`)).toBeVisible();
  await expect(page.getByTestId(`owner-store-inactive-${targetStoreId}`)).toHaveCount(0);

  // Deactivate through the popup (confirm dialog R-1 accepts). SweetAlert2 — the
  // suite's existing pattern is the .swal2-confirm class (mayorista-sale.spec.ts), not a testid.
  await page.getByTestId(`owner-store-actions-toggle-${targetStoreId}`).click();
  await page.getByTestId(`owner-store-edit-${targetStoreId}`).click();
  await page.getByTestId(`owner-store-active-toggle-${targetStoreId}`).click();
  await page.getByTestId(`owner-store-save-${targetStoreId}`).click();
  await page.locator('.swal2-confirm').click();

  // The card repaints with the inactive badge (setStoreActivation exercised for real).
  await expect(page.getByTestId(`owner-store-inactive-${targetStoreId}`)).toBeVisible();

  // Pin: the flag really flipped in the DB.
  expect((await readStoreRow(targetStoreId)).isActive).toBe(false);

  // Reactivate through the same popup (no confirm needed for activation).
  await page.getByTestId(`owner-store-actions-toggle-${targetStoreId}`).click();
  await page.getByTestId(`owner-store-edit-${targetStoreId}`).click();
  await page.getByTestId(`owner-store-active-toggle-${targetStoreId}`).click();
  await page.getByTestId(`owner-store-save-${targetStoreId}`).click();

  await expect(page.getByTestId(`owner-store-inactive-${targetStoreId}`)).toHaveCount(0);
  expect((await readStoreRow(targetStoreId)).isActive).toBe(true);
});

test('E-09 — Editar el plan popup lets the owner change the PAID store plan (AD7)', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;
  await assertStoresFeature(page);
  await page.goto('/management/my-stores');

  await page.getByTestId(`owner-store-actions-toggle-${selectedStoreId}`).click();
  await page.getByTestId(`owner-store-edit-plan-${selectedStoreId}`).click();

  const modal = page.getByTestId(`owner-store-plan-modal-${selectedStoreId}`);
  await expect(modal).toBeVisible();

  // owner-plan-change AD7 (repurposed from the old DG-7 lock, T7.3): the DG-7
  // readOnly lock is DEAD — the owner of the store changes its plan at any
  // time, in any direction. The persona's store is on the PAID plan, so the
  // paid panel is the default expanded one; expand the FREE (non-active)
  // panel — the discriminating panel where the old lock hid the action — and
  // pin that "Activar Plan" now RENDERS there (this is the assertion that
  // fails if anyone resurrects the lock).
  const freeHeader = modal.getByRole('button', { name: /Gratis/ });
  await freeHeader.click();
  await expect(freeHeader).toHaveAttribute('aria-expanded', 'true');
  await expect(modal.getByRole('button', { name: 'Activar Plan' })).toBeVisible();
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

  // Open the plan popup; the paid panel is COLLAPSED (only the active FREE
  // panel starts expanded — plan-panels.tsx). Expand it: the "Activar Plan"
  // button is available (owner-plan-change AD7 — the DG-7 readOnly lock is
  // dead; the backend ownership guard is the only authority).
  await page.getByTestId(`owner-store-actions-toggle-${selectedStoreId}`).click();
  await page.getByTestId(`owner-store-edit-plan-${selectedStoreId}`).click();
  const modal = page.getByTestId(`owner-store-plan-modal-${selectedStoreId}`);
  const paidHeader = modal.getByRole('button', { name: /Pago/ });
  await expect(paidHeader).toHaveAttribute('aria-expanded', 'false');
  await paidHeader.click();
  await expect(paidHeader).toHaveAttribute('aria-expanded', 'true');

  // owner-plan-change (T7.3): the activation goes through POST
  // /v1/stores/{id}/change-plan — pinned by the observer, not assumed. The
  // old moduleIds PUT must not fire during the plan change.
  const observer = installPlanChangeObserver(page, selectedStoreId);
  await modal.getByRole('button', { name: 'Activar Plan' }).click();

  const capture = await observer.waitForChangePlanResponse();
  expect(capture.status).toBe(200);
  expect(capture.rawBody).not.toContain('moduleIds');
  observer.expectNoStorePut();

  // Immediate activation (no Guardar footer in the modal): the parent calls
  // changeStorePlan, refreshes the session and CLOSES the popup
  // (my-stores.tsx handlePlanActivate).
  await expect(modal).not.toBeVisible();

  // After the save the card repaints as PAID: plan label + price line back.
  await expect(page.getByTestId(`owner-store-body-${selectedStoreId}`)).toContainText(
    'Plan de Pago',
    { timeout: 30_000 },
  );
  await expect(page.getByTestId(`owner-store-price-${selectedStoreId}`)).toBeVisible();

  // Restore the paid modules for any following tests (the persona default is paid).
  // The popup already activated the paid plan — nothing else to seed.
});
