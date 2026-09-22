import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { Client } from 'pg';
import { assertStoresFeature } from './support/store-fixture';
import { readBearerToken } from './support/auth-storage';
import { E2E_API_URL } from './support/backend-url';

/**
 * [store-switcher-refresh] E2E Playwright — the header store SWITCHER must
 * reflect store-list changes made in this session, without a re-login.
 *
 * SWR-1: the owner creates a store at /management/my-stores → opening the
 *        switcher popup must offer the new store.
 * SWR-2: the owner deactivates one of their stores (owner's own activation
 *        endpoint) → the switcher popup must stop offering it, while the
 *        CURRENT store is still offered (never stranded).
 *
 * Root cause pinned by these tests (2026-09-21): the post-mutation session
 * refresh in my-stores.tsx used the cache-first `getUserByToken()` (auth-store
 * returns the cached profile with NO backend call on a valid session), so the
 * new/changed store never reached the session's `user.storeList` and the
 * switcher — which reads exactly that list — stayed stale until a re-login.
 * Fix under test: a real GET /v1/auth/me via softRefreshSession() after the
 * create/activation mutations.
 *
 * SETUP (why direct-DB seeding): the owner-admin persona's selected store is
 * born on the Pago plan whose module set does NOT include MultiStores (14) —
 * the registration no longer delivers every availableToStore module, so MC-01
 * itself is stale on this seed. Following store-fixture.ts (design.md D1,
 * H-15 direct-DB precedent), the spec seeds module 14 into the persona's
 * selected store, then refreshes the session's cached profile through a REAL
 * GET /v1/auth/me (page reload on a valid cache emits zero /me — e2e-session
 * REQ-1 — so the spec mints the fresh profile explicitly via the API and
 * rewrites localStorage.currentUser, the same profile the auth-store would
 * store). Billing reads `FilterForBilling` only trims on Vencido; the seeded
 * store stays AlDia, so 14 survives /me's billing filter.
 *
 * NEVER touches existing specs (CLAUDE.md E2E rule) — brand-new file. Direct-DB
 * reads/writes follow owner-store-create.spec.ts / store-fixture.ts patterns.
 */

test.use({ persona: 'owner-admin' });

test.describe.configure({ mode: 'serial', timeout: 120_000 });

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

/** OwnerStore rows of the selected store's owner, straight from the DB. */
async function readOwnerStores(
  selectedStoreId: string,
): Promise<Array<{ id: string; name: string; isActive: boolean }>> {
  return withDb(async (client) => {
    const result = await client.query(
      `SELECT s2."Id" AS id, s2."Name" AS name, s2."IsActive" AS "isActive"
         FROM "Store" s1
         JOIN "Store" s2 ON s2."OwnerId" = s1."OwnerId"
        WHERE s1."Id" = $1`,
      [selectedStoreId],
    );
    return result.rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      isActive: r.isActive as boolean,
    }));
  });
}

/** Polls GET /v1/stores/my-stores until the named store shows up (API truth). */
async function waitForStoreInApi(
  page: Page,
  name: string,
): Promise<{ id: string; name: string; isActive: boolean }> {
  const token = await readBearerToken(page);
  let store: { id: string; name: string; isActive: boolean } | null = null;
  await expect
    .poll(async () => {
      const response = await page.request.get(`${E2E_API_URL}/v1/stores/my-stores`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok()) return null;
      const body = (await response.json()) as {
        data?: Array<{ id: string; name: string; isActive?: boolean }>;
      };
      const found = (body.data ?? []).find((s) => s.name === name);
      if (found) {
        store = { id: found.id, name: found.name, isActive: found.isActive !== false };
      }
      return found ?? null;
    }, {
      timeout: 20_000,
      message: `store "${name}" never appeared in GET /v1/stores my-stores`,
    })
    .toBeTruthy();
  return store!;
}

/** Creates a store through the real UI flow and returns its API snapshot. */
async function createStoreViaUi(page: Page, name: string): Promise<{ id: string; name: string; isActive: boolean }> {
  await page.getByTestId('my-stores-create-button').click();
  const modal = page.getByTestId('owner-store-create-modal');
  await expect(modal).toBeVisible();
  await page.getByTestId('owner-store-name-input').fill(name);
  await page.getByTestId('owner-store-create-save').click();
  await expect(modal).not.toBeVisible();
  const created = await waitForStoreInApi(page, name);
  expect(created.isActive).toBe(true);
  return created;
}

/** Opens the header switcher popup and waits for the CURRENT marker. */
async function openSwitcherPopup(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Cambiar tienda' }).click();
  await expect(page.getByText('Actual')).toBeVisible();
}

test('SWR-1 — a store created this session appears in the header switcher without re-login', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;
  await assertStoresFeature(page);

  // SETUP: MultiStores (14) into the persona's selected store + fresh profile.
  await seedMultiStoresModule(selectedStoreId);
  await refreshSessionFromMe(page);

  await page.goto('/management/my-stores');
  await expect(page.getByTestId(`owner-store-card-${selectedStoreId}`)).toBeVisible();

  const created = await createStoreViaUi(page, `e2e-swr-create-${Date.now()}`);

  // THE ASSERTION UNDER TEST: the switcher popup offers the new store.
  await openSwitcherPopup(page);
  await expect(
    page.getByRole('button', { name: new RegExp(escapeRegex(created.name)) }),
    'the just-created store must be offered by the header switcher without a re-login',
  ).toBeVisible();
});

test('SWR-2 — a store deactivated this session disappears from the switcher (current store never does)', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;
  await assertStoresFeature(page);

  // SETUP (same as SWR-1 — serial mode, fresh per test).
  await seedMultiStoresModule(selectedStoreId);
  await refreshSessionFromMe(page);

  await page.goto('/management/my-stores');

  const seeded = await createStoreViaUi(page, `e2e-swr-deactivate-${Date.now()}`);

  // Deactivate through the REAL UI flow: card action menu → Edit → toggle
  // Active off → Save → confirm the deactivation dialog. This is the flow the
  // fix covers: handleEditSave refreshes the session ONLINE after the
  // activation endpoint succeeds, so the switcher's storeList self-heals
  // without a re-login. (A raw API call here would bypass the app entirely —
  // no refresh could ever fire — and the stale popup would be correct.)
  await page.getByTestId(`owner-store-actions-toggle-${seeded.id}`).click();
  await page.getByTestId(`owner-store-edit-${seeded.id}`).click();
  const activeToggle = page.getByTestId(`owner-store-active-toggle-${seeded.id}`);
  await expect(activeToggle).toBeVisible();
  await expect(activeToggle).toBeChecked();
  await activeToggle.click();
  await page.getByTestId(`owner-store-save-${seeded.id}`).click();
  // R-1 confirmation dialog (blocking-alert confirmDialog, SweetAlert2).
  const confirmButton = page.getByRole('button', { name: 'Si', exact: true });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();

  // API truth: the row is inactive now (DB read, same pattern as store-fixture).
  await expect
    .poll(async () => {
      const rows = await readOwnerStores(selectedStoreId);
      const row = rows.find((s) => s.id === seeded.id);
      return row ? row.isActive : null;
    }, { timeout: 20_000, message: 'the seeded store never became inactive in the DB' })
    .toBe(false);

  // THE ASSERTION UNDER TEST: the popup stops offering the deactivated store…
  await openSwitcherPopup(page);
  await expect(
    page.getByRole('button', { name: new RegExp(escapeRegex(seeded.name)) }),
    'a deactivated store must not be offered by the header switcher',
  ).not.toBeVisible();

  // …while the CURRENT store is always offered (never stranded).
  await expect(page.getByText('Actual')).toBeVisible();
});

/** Escapes a name for a RegExp literal (names contain no regex metachars). */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
