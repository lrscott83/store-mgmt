import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { Client } from 'pg';
import { assertStoresFeature } from './support/store-fixture';
import { readBearerToken } from './support/auth-storage';
import { E2E_API_URL } from './support/backend-url';

/**
 * [owner-multistores-store-creation] E2E Playwright — the owner's "+ Tienda"
 * flow at /management/my-stores (frontend half of the change; backend matrix is
 * OwnerCreateStoreTests.cs).
 *
 * Covers the MultiStores gate on the SELECTED store (billing-filtered
 * storeModuleIds — store-switcher parity), the name-only CreateStoreModal and
 * the owner-branch contract: body ownerId is the zero-Guid, approved=true,
 * moduleIds=[] — the backend derives the caller's own owner and inherits the
 * selected store's modules.
 *
 * Matrix MC-01, MC-02, MC-04. NEVER touches existing specs (CLAUDE.md E2E
 * rule) — this is a brand-new file. Analysis-based: the FE E2E suite is NOT
 * runnable locally in this environment (Playwright drives the real app against
 * the real backend); assertions follow the byte pattern of owner-stores.spec.ts
 * and store-create-security.spec.ts so CI can execute it unchanged.
 *
 * The button's NEGATIVE case (owner WITHOUT MultiStores → button hidden) is NOT
 * E2E here by design: the owner-admin persona is born with every
 * availableToStore module (register delivers all, incl. 14) and the auth-store
 * treats a valid cached session as authoritative, so degrading the store via
 * direct DB seeding would NOT refresh the session's storeModuleIds until the
 * user re-mints — a flaky, CI-uncertain assertion. That gate is pinned
 * deterministically in vitest (my-stores.test.tsx create-store flow: hidden
 * without 14, visible with 14).
 *
 * Cost: one real login per test (owner-admin persona), under the LoginPolicy
 * ceiling. Direct-DB reads follow the owner-stores.spec.ts pattern.
 */

test.use({ persona: 'owner-admin' });

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const DEFAULT_DB_URL = 'postgresql://postgres:postgres@localhost:5432/smca_test';

/** Reads the StoreModule ids of one store straight from the DB. */
async function readStoreModules(storeId: string): Promise<number[]> {
  const connectionString = process.env['E2E_DB_URL'] ?? DEFAULT_DB_URL;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query(
      'SELECT "ModuleId" FROM "StoreModule" WHERE "StoreId" = $1 ORDER BY "ModuleId"',
      [storeId],
    );
    return result.rows.map((r) => r.ModuleId as number);
  } finally {
    await client.end();
  }
}

/** Pins the created-store precondition through the real API. */
async function readMyStores(page: Page): Promise<Array<{ id: string; name: string }>> {
  const token = await readBearerToken(page);
  const response = await page.request.get(`${E2E_API_URL}/v1/stores/my-stores`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok()) {
    throw new Error(`owner-store-create: GET my-stores failed (${response.status()})`);
  }
  const body = (await response.json()) as { data?: Array<{ id: string; name: string }> };
  return body.data ?? [];
}

test('MC-01 — the + Tienda button shows only with MultiStores on the selected store', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;
  await assertStoresFeature(page);

  // The owner-admin persona's store is on the PAID plan at birth with every
  // availableToStore module (register delivers them all, incl. 14) and the
  // billing state is AlDia — so the auth store's storeModuleIds must contain 14,
  // the same shape store-switcher.tsx/configurations.tsx gate on.
  await page.goto('/management/my-stores');

  await expect(page.getByTestId(`owner-store-card-${selectedStoreId}`)).toBeVisible();
  const createButton = page.getByTestId('my-stores-create-button');
  await expect(createButton).toBeVisible();
  await expect(createButton).toContainText('Tienda');
});

test('MC-02 — creating a store posts the owner-branch contract and inherits modules', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;
  await assertStoresFeature(page);

  const selectedStoreModuleIds = await readStoreModules(selectedStoreId);
  // Own store on the paid plan owns every availableToStore module incl. MultiStores (14).
  expect(selectedStoreModuleIds).toContain(14);

  // Intercept ALL /v1/stores traffic to capture the create POST (byte pattern of
  // store-create-security.spec.ts).
  const capturedRequests: Array<{ method: string; url: string; postData?: string }> = [];
  await page.route('**/v1/stores/**', (route) => {
    capturedRequests.push({
      method: route.request().method(),
      url: route.request().url(),
      postData: route.request().postData() ?? undefined,
    });
    route.continue();
  });

  await page.goto('/management/my-stores');
  await page.getByTestId('my-stores-create-button').click();

  const modal = page.getByTestId('owner-store-create-modal');
  await expect(modal).toBeVisible();
  // The modal reuses the existing create title (no new copy needed).
  await expect(modal).toContainText('Crear una tienda');

  const newName = `e2e-owner-store-create-${Date.now()}`;
  const preCreateCount = capturedRequests.length;
  await page.getByTestId('owner-store-name-input').fill(newName);
  await page.getByTestId('owner-store-create-save').click();

  // The POST arrives with the owner-branch contract payload: zero-Guid ownerId
  // (server derives), approved=true and NO moduleIds (server inherits).
  await expect
    .poll(() => {
      const create = capturedRequests
        .slice(preCreateCount)
        .find((r) => r.method === 'POST' && r.url.endsWith('/v1/stores'));
      if (!create?.postData) return null;
      try {
        return JSON.parse(create.postData) as Record<string, unknown>;
      } catch {
        return null;
      }
    }, {
      timeout: 15_000,
      message: 'Expected a POST /v1/stores with the owner-branch payload',
    })
    .toEqual({
      ownerId: '00000000-0000-0000-0000-000000000000',
      name: newName,
      address: '',
      description: '',
      approved: true,
      moduleIds: [],
    });

  // The modal closes and the new store appears in the listing.
  await expect(modal).not.toBeVisible();
  await expect(page.getByTestId(`owner-store-card-${selectedStoreId}`)).toBeVisible();

  // Pin the created store through the real API + DB.
  const created = (await readMyStores(page)).find((s) => s.name === newName);
  expect(created).toBeTruthy();
  if (!created) return; // unreachable — guard for the type checker
  // Inherited the SELECTED store's full module set (incl. MultiStores 14).
  expect(await readStoreModules(created.id)).toEqual(selectedStoreModuleIds);
});

test('MC-04 — the owner-branch 403 pins: a non-owner body is rejected by the API', async ({
  signedInPage,
}) => {
  const { page } = signedInPage;
  const token = await readBearerToken(page);

  // The UI never sends a foreign ownerId (its payload is the zero-Guid), but the
  // backend contract pins it: an owner admin posting a DIFFERENT ownerId gets
  // 403 Forbidden from the handler (CreateStoreCommand owner branch), matching
  // the backend matrix OwnerCreateStoreTests. This proves the gate is server-side
  // too, not just the button hiding.
  const response = await page.request.post(`${E2E_API_URL}/v1/stores`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      ownerId: '11111111-1111-1111-1111-111111111111',
      name: `e2e-owner-store-create-forbidden-${Date.now()}`,
      address: '',
      description: '',
      approved: true,
      moduleIds: [],
    },
  });
  expect(response.status()).toBe(403);
});