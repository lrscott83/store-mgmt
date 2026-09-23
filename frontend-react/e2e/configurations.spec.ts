import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { Client } from 'pg';
import { readBearerToken } from './support/auth-storage';
import { E2E_API_URL } from './support/backend-url';

/**
 * [FC-B2] Configurations — E2E Playwright
 * docs/testing/frontend-coverage/FC-B2.md
 *
 * Verifies that `/management/configurations` gates the active-store selector
 * (store-switcher-react) on the MultiStores module (14): without the module
 * the page renders the heading and NO selector (configurations.tsx:110,164);
 * with the module seeded on the store the same page renders the select with
 * at least one option.
 *
 * Uses `owner-admin` persona (has Configurations feature). The persona is a
 * real registered owner with a selectedStoreId, so the list is non-empty.
 */

test.use({ persona: 'owner-admin' });

const DEFAULT_DB_URL = 'postgresql://postgres:postgres@localhost:5432/smca_test';
const MODULE_MULTISTORES = 14;

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env['E2E_DB_URL'] ?? DEFAULT_DB_URL });
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Inserts the MultiStores module row for the store if missing (idempotent). */
async function seedMultiStoresModule(storeId: string): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO "StoreModule"
         ("StoreId", "ModuleId", "ModulePriceIncluded", "Price", "ModulePrice",
          "ModuleDiscountPrice", "ModulePercentDiscountPrice", "TenantId", "IsActive",
          "CreatedDate", "CreatedBy", "UpdatedDate", "UpdatedBy")
       SELECT s."Id", 14, m."PriceIncluded", m."Price", m."Price",
              m."DiscountPrice", m."PercentDiscountPrice", s."TenantId", true,
              now(), '00000000-0000-0000-0000-000000000000', NULL, NULL
         FROM "Module" m, "Store" s
        WHERE m."Id" = $2 AND s."Id" = $1
          AND NOT EXISTS (
            SELECT 1 FROM "StoreModule" sm
             WHERE sm."StoreId" = $1 AND sm."ModuleId" = $2
          )`,
      [storeId, MODULE_MULTISTORES],
    );
  });
}

/**
 * Refreshes the session profile through a REAL GET /v1/auth/me and rewrites
 * localStorage.currentUser — the gate reads `user.storeModuleIds` from the
 * client session, and cold-boot makes no backend call when the cached profile
 * matches (auth-store.ts:167-177), so the seeded module is invisible until
 * the cache is rewritten. Pattern copied from owner-store-create.spec.ts.
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
    window.localStorage.setItem('current-store-id', (profile as { selectedStoreId?: string }).selectedStoreId ?? '');
  }, body.data);
  await page.reload();
}

test.describe('FC-B2 — Configurations', () => {
  test.describe.configure({ timeout: 120_000 });

  test('sin MultiStores la página muestra el heading y NO el selector de tienda activa', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await page.goto('/management/configurations');

    // The page heading (MENU.CONFIGURATIONS)
    await expect(page.getByRole('heading', { name: 'Configuraciones' })).toBeVisible();

    // The active-store selector (CONFIGURATIONS.STORE_LABEL) is gated on the
    // MultiStores module — the owner-admin persona registers WITHOUT it, so
    // configurations.tsx:164 never renders the block (absent, not disabled).
    await expect(page.getByLabel('Tienda activa')).toHaveCount(0);

    // No error overlay or blank page
    await expect(page.locator('body')).toContainText(/\w+/);
  });

  test('con MultiStores el selector de tienda activa se renderiza con opciones', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    // Seed module 14 by direct DB + refresh the cached session via a real /me
    // (owner-store-create.spec.ts pattern): the gate reads user.storeModuleIds
    // from the client session, which cold-boot takes from localStorage.
    await seedMultiStoresModule(selectedStoreId);
    await refreshSessionFromMe(page);

    await page.goto('/management/configurations');

    await expect(page.getByRole('heading', { name: 'Configuraciones' })).toBeVisible();

    const storeSelect = page.getByLabel('Tienda activa');
    await expect(storeSelect).toBeVisible();
    await expect(storeSelect.locator('option').first()).toBeVisible();
  });
});
