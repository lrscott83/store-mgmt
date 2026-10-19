import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { Client } from 'pg';
import { assertStoresFeature } from './support/store-fixture';
import { readBearerToken } from './support/auth-storage';
import { E2E_API_URL } from './support/backend-url';
import {
  MODISTORES_MODULE_ID,
  MULTIPAYMENTS_MODULE_ID,
  enableStoreModule,
} from './support/multipayments-fixture';

/**
 * [owner-multistores-store-creation] E2E Playwright — the owner's "+ Tienda"
 * flow at /management/my-stores (frontend half of the change; backend matrix is
 * OwnerCreateStoreTests.cs).
 *
 * Covers the MultiStores gate on the SELECTED store (billing-filtered
 * storeModuleIds — store-switcher parity), the name-only CreateStoreModal and
 * the owner-branch contract: body ownerId is the zero-Guid, approved=true, and
 * NO `moduleIds` at all — the backend derives the caller's own owner and births
 * the store on the **Superior** plan with that plan's catalog (decisión del
 * propietario 2026-10-13: "Cuando se crea debe ser en el plan Superior y no el
 * de Pago"; commit `store-birth-superior`, 2026-10-11, which replaced the
 * `store-birth-pago-only` contract this spec used to pin — including dropping
 * `moduleIds: []` from the create payload, see `store-http-service.ts:35-45`).
 * The store's selected store is irrelevant for the birth.
 *
 * Matrix MC-01, MC-02, MC-04. NEVER touches existing specs (CLAUDE.md E2E
 * rule) — this is a brand-new file. Analysis-based: the FE E2E suite is NOT
 * runnable locally in this environment (Playwright drives the real app against
 * the real backend); assertions follow the byte pattern of owner-stores.spec.ts
 * and store-create-security.spec.ts so CI can execute it unchanged.
 *
 * SETUP (2026-10-13): both tests used to seed module 14 into the selected store
 * because the Pago birth plan did not carry it. Superior DOES carry it, so the
 * seed is now an explicit, API-pinned no-op (`enableStoreModule`) rather than
 * an assumption — the + Tienda button gate is still pinned on a session that
 * demonstrably holds 14, and the cached session is still refreshed through a
 * real GET /v1/auth/me. Assertions are untouched.
 *
 * The button's NEGATIVE case (owner WITHOUT MultiStores → button hidden) stays
 * out of E2E by design: that gate is pinned deterministically in vitest
 * (my-stores.test.tsx create-store flow: hidden without 14, visible with 14).
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

/** Reads the Superior birth plan (PlanId=3) catalog straight from the DB. */
async function readSuperiorPlanModuleIds(): Promise<number[]> {
  const connectionString = process.env['E2E_DB_URL'] ?? DEFAULT_DB_URL;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query(
      'SELECT "ModuleId" FROM "StorePlanModule" WHERE "PlanId" = $1 ORDER BY "ModuleId"',
      [SUPERIOR_PLAN_ID],
    );
    return result.rows.map((r) => r.ModuleId as number);
  } finally {
    await client.end();
  }
}

const SUPERIOR_PLAN_ID = 3; // StorePlanType.Superior (CreateStoreService.cs:45)
const MODULE_MULTISTORES = MODISTORES_MODULE_ID;
const MODULE_MULTIPAYMENTS = MULTIPAYMENTS_MODULE_ID;

/**
 * Refreshes the session profile through a REAL GET /v1/auth/me and rewrites
 * localStorage.currentUser — the auth-store's own update contract (updateUser
 * preserves expiresIn and rewrites TOKEN/CURRENT_USER/AUTH_MODEL).
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

/** Module ids the CLIENT session currently carries (the gate's real input). */
async function sessionModuleIds(page: Page): Promise<number[]> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) throw new Error('owner-store-create: localStorage.currentUser is empty.');
  const parsed = JSON.parse(raw) as { storeModuleIds?: number[] };
  return parsed.storeModuleIds ?? [];
}

test('MC-01 — the + Tienda button shows only with MultiStores on the selected store', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;
  await assertStoresFeature(page);

  // SETUP: the + Tienda button gate reads `user.storeModuleIds`, which cold-boot
  // takes from localStorage. Superior (the birth plan since 2026-10-13) already
  // carries MultiStores, so this is an explicit API-pinned no-op rather than an
  // assumption, and the session is still refreshed through a real /me. The
  // session is then asserted to really hold 14 — the gate is pinned against a
  // state that exists, not against a plan that is hoped to carry it.
  await enableStoreModule(page, selectedStoreId, MODULE_MULTISTORES);
  await refreshSessionFromMe(page);
  expect(await sessionModuleIds(page)).toContain(MODULE_MULTISTORES);

  await page.goto('/management/my-stores');

  await expect(page.getByTestId(`owner-store-card-${selectedStoreId}`)).toBeVisible();
  const createButton = page.getByTestId('my-stores-create-button');
  await expect(createButton).toBeVisible();
  await expect(createButton).toContainText('Tienda');
});

test('MC-02 — creating a store posts the owner-branch contract and is born with the Superior plan modules', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;
  await assertStoresFeature(page);

  // SETUP (same as MC-01 — serial mode): build the module set explicitly +
  // refresh the session before reading it, so the birth pin below runs against a
  // store that demonstrably holds MultiStores.
  await enableStoreModule(page, selectedStoreId, MODULE_MULTISTORES);
  await refreshSessionFromMe(page);

  // Precondition pin: the selected store really holds 14 (the create-button
  // gate runs against this set — MC-01 pins it). The BIRTH contract below no
  // longer derives anything from this set.
  expect(await readStoreModules(selectedStoreId)).toContain(MODULE_MULTISTORES);

  // Intercept ALL /v1/stores traffic to capture the create POST (byte pattern of
  // store-create-security.spec.ts). RegExp, NOT the `**/v1/stores/**` glob: the
  // create POST URL has NOTHING after /v1/stores and a trailing `/**` glob
  // requires a `/` — the POST was never captured and the poll below timed out
  // on null (latent plumbing bug: MC-02 used to die earlier, on toContain(14)).
  const capturedRequests: Array<{ method: string; url: string; postData?: string }> = [];
  await page.route(/\/v1\/stores(?:\/|$)/, (route) => {
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
  // (server derives), approved=true and NO moduleIds at all — since
  // `store-birth-superior` (2026-10-11) the create request names no modules,
  // because the server owns the born plan and its catalog
  // (store-http-service.ts:35-45). `toEqual` on the parsed body pins the
  // ABSENCE of moduleIds too: any extra key would fail the comparison.
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
    });

  // The modal closes and the new store appears in the listing.
  await expect(modal).not.toBeVisible();
  await expect(page.getByTestId(`owner-store-card-${selectedStoreId}`)).toBeVisible();

  // Pin the created store through the real API + DB.
  const created = (await readMyStores(page)).find((s) => s.name === newName);
  expect(created).toBeTruthy();
  if (!created) return; // unreachable — guard for the type checker
  // BIRTH CONTRACT (decisión del propietario 2026-10-13, commit
  // `store-birth-superior`): every new store is born with the Superior plan
  // catalog — nothing is inherited from the selected store. The catalog is read
  // straight from the DB and both discriminating modules are pinned explicitly:
  // 14 (MultiStores) is PRESENT because Superior carries it, and 16
  // (MultiPayments) is ABSENT because it stays VIP-only. Those two pins are what
  // would fail if the birth plan silently regressed to Pago.
  const createdModuleIds = await readStoreModules(created.id);
  expect(createdModuleIds).toEqual(await readSuperiorPlanModuleIds());
  expect(createdModuleIds).toContain(MODULE_MULTISTORES);
  expect(createdModuleIds).not.toContain(MODULE_MULTIPAYMENTS);
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