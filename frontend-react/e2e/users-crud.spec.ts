import { test, expect } from './support/test';
import { E2E_API_URL } from './support/backend-url';
import { readBearerToken } from './support/auth-storage';
import { newTestIdentity } from './support/identity';
import type { TestIdentity } from './support/identity';

/**
 * [S3-03] Listar, editar, activar y dar de baja usuarios
 * (`docs/testing/e2e-stage-1/S3-03.md`).
 *
 * Covers the key UI assertions of that scenario. Uses a fresh StoreUser
 * created via the API (POST /v1/storeusers has no rate limit) to exercise
 * the full lifecycle without touching the OwnerAdmin's own session.
 *
 * Login budget: 1 real login for `owner-admin`. The StoreUser is created
 * via the API from the owner's captured session — zero extra logins.
 *
 * Literal Spanish copy asserted below is cited from
 * `apps/web-store-pos/app/shared/lib/i18n/es.ts`.
 */
const LIST_TITLE = 'Empleados'; // es.ts:753
const EDIT_TITLE = 'Editar Empleado'; // es.ts:755
const DEACTIVATE_TEXT = 'Desactivar'; // es.ts:771
const ACTIVATE_TEXT = 'Activar'; // es.ts:770
const EDIT_TEXT = 'Editar'; // es.ts:775

test.use({ persona: 'owner-admin' });

test.describe.configure({ mode: 'serial', timeout: 120_000 });

/**
 * Helper: create a StoreUser via the real API from the owner's authenticated
 * session. POST /v1/storeusers has no rate limit (design.md §2).
 */
async function createStoreUserViaApi(
  page: import('@playwright/test').Page,
  storeId: string
): Promise<TestIdentity> {
  const token = await readBearerToken(page);
  const identity = newTestIdentity();
  const response = await page.request.post(`${E2E_API_URL}/v1/storeusers`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      storeId,
      fullName: identity.fullName,
      login: identity.login,
      password: identity.password,
      cellPhone: identity.cellPhone,
      email: identity.email,
      roleIds: [3], // ERoles.StoreUser (hardcoded, user-create.tsx:49)
    },
  });
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `createStoreUserViaApi: POST /v1/storeusers returned ${response.status()}: ${body}`
    );
  }
  return identity;
}

/**
 * Find the action menu button for a user card identified by its login.
 * UserCardList renders Card with title={user.login} → <h3>login</h3>.
 * Card root has data-slot="card" (card.tsx:50). The gear button lives
 * inside the same Card div.
 */
function userCardActionMenu(page: import('@playwright/test').Page, login: string) {
  return page
    .locator('[data-slot="card"]', { hasText: login })
    .getByRole('button', { name: 'Acciones' });
}

// ── Test 1: List + Edit ───────────────────────────────────────────────

test('listar muestra usuarios, editar modifica y guarda', async ({ signedInPage }) => {
  const { page, selectedStoreId } = signedInPage;

  const storeUser = await createStoreUserViaApi(page, selectedStoreId);

  // Aserción 1: navigate to /management/users — mount-only fetch
  // GET /v1/users/all/true (user-list.tsx:38-41).
  await page.goto('/management/users');

  // Aserción 2: page title is "Empleados" (es.ts:753).
  await expect(page.getByRole('heading', { level: 1, name: LIST_TITLE })).toBeVisible();

  // Aserción 3: the newly created user appears in the list.
  // Card renders title as <h3> (card.tsx:63).
  await expect(page.getByRole('heading', { level: 3, name: storeUser.login })).toBeVisible();

  // Aserción 4+5: card has ActionMenu with "Editar" (user-card-list.tsx:55-56).
  await userCardActionMenu(page, storeUser.login).click();
  const editMenuItem = page.getByRole('menuitem', { name: EDIT_TEXT });
  await expect(editMenuItem).toBeVisible();

  // Aserción 6: clicking "Editar" navigates to /management/users/edit/:id.
  await editMenuItem.click();

  // Aserción 7: edit page title is "Editar Empleado" (es.ts:755).
  await expect(page.getByRole('heading', { level: 1, name: EDIT_TITLE })).toBeVisible();

  // Aserción 8: form is pre-filled with the user's data.
  const fullNameInput = page.locator('#fullName');
  await expect(fullNameInput).toHaveValue(storeUser.fullName);

  // Aserción 9: modify fullName and submit.
  const updatedName = `Updated ${storeUser.fullName}`;
  await fullNameInput.fill(updatedName);
  await page.getByRole('button', { name: 'Actualizar' }).click();

  // Aserción 10: navigates back to /management/users (user-edit.tsx:59).
  await expect(page).toHaveURL(/\/management\/users$/);

  // Aserción 11: updated name visible in list.
  await expect(page.getByText(updatedName)).toBeVisible();
});

// ── Test 2: Activate / Deactivate lifecycle ───────────────────────────

test('activar y desactivar usuario desde la lista', async ({ signedInPage }) => {
  const { page, selectedStoreId } = signedInPage;

  const storeUser = await createStoreUserViaApi(page, selectedStoreId);

  await page.goto('/management/users');
  await expect(page.getByRole('heading', { level: 3, name: storeUser.login })).toBeVisible();

  // Aserción 12: active user shows "Desactivar" (user-card-list.tsx:63-64).
  await userCardActionMenu(page, storeUser.login).click();
  await expect(page.getByRole('menuitem', { name: DEACTIVATE_TEXT })).toBeVisible();

  // Aserción 13: "desactivar" emite DELETE /v1/users/{id} (H-6).
  const capturedRequests: Array<{ method: string; url: string }> = [];
  await page.route('**/v1/users/**', (route) => {
    capturedRequests.push({ method: route.request().method(), url: route.request().url() });
    route.continue();
  });

  const preActionCount = capturedRequests.length;
  await page.getByRole('menuitem', { name: DEACTIVATE_TEXT }).click();

  await expect
    .poll(
      () =>
        capturedRequests
          .slice(preActionCount)
          .some((r) => r.method === 'DELETE' && r.url.includes('/v1/users/')),
      { timeout: 10_000, message: 'Expected DELETE /v1/users/{id} after clicking Desactivar' }
    )
    .toBe(true);

  // Verify NO POST /v1/users/activate was emitted (user-list.tsx:72).
  const activatePosts = capturedRequests
    .slice(preActionCount)
    .filter((r) => r.method === 'POST' && r.url.includes('/v1/users/activate'));
  expect(activatePosts).toHaveLength(0);

  // Aserción 14: after deactivation, list reloads, card shows "Activar".
  await userCardActionMenu(page, storeUser.login).click();
  await expect(page.getByRole('menuitem', { name: ACTIVATE_TEXT })).toBeVisible();

  // Aserción 15: reactivate — POST /v1/users/activate with isActive: true.
  const preReactivateCount = capturedRequests.length;
  await page.getByRole('menuitem', { name: ACTIVATE_TEXT }).click();

  await expect
    .poll(
      () =>
        capturedRequests
          .slice(preReactivateCount)
          .some(
            (r) =>
              r.method === 'POST' &&
              r.url.includes('/v1/users/activate')
          ),
      { timeout: 10_000, message: 'Expected POST /v1/users/activate after clicking Activar' }
    )
    .toBe(true);

  // After reactivation, card shows "Desactivar" again.
  await userCardActionMenu(page, storeUser.login).click();
  await expect(page.getByRole('menuitem', { name: DEACTIVATE_TEXT })).toBeVisible();
});

// ── Test 3: Offline — actions are no-ops ──────────────────────────────

test('offline: las acciones de ciclo de vida no emiten peticiones', async ({ signedInPage }) => {
  const { page, selectedStoreId } = signedInPage;

  const storeUser = await createStoreUserViaApi(page, selectedStoreId);

  await page.goto('/management/users');
  await expect(page.getByRole('heading', { level: 3, name: storeUser.login })).toBeVisible();

  // Simulate offline by aborting all API calls. The user-list.tsx checks
  // `isOnline` (useOnlineStatus) and returns early from handleLifecycleAction
  // (user-list.tsx:47).
  await page.route('**/v1/**', (route) => route.abort());

  await userCardActionMenu(page, storeUser.login).click();
  await page.getByRole('menuitem', { name: DEACTIVATE_TEXT }).click();

  // The click handler returns early — card is still visible, list not reloaded.
  await expect(page.getByRole('heading', { level: 3, name: storeUser.login })).toBeVisible();
  await expect(userCardActionMenu(page, storeUser.login)).toBeVisible();
});
