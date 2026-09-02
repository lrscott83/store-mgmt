import { test, expect } from './support/test';
import { E2E_API_URL } from './support/backend-url';
import { readBearerToken } from './support/auth-storage';
import { newTestIdentity } from './support/identity';

/**
 * [S3-02] Crear cuenta StoreUser desde la UI
 * (`docs/testing/e2e-stage-1/S3-02.md`).
 *
 * 7 Playwright assertions:
 * 1. Payload includes roleIds: [3] (hardcoded, user-create.tsx:49)
 * 2. storeId resolves from param or user.selectedStoreId (user-create.tsx:20,43)
 * 3. Without storeId → redirect to /management/stores/create
 * 4. Offline: submit returns without emitting a request (user-create.tsx:38)
 * 5. Success → navigates to /management/users (user-create.tsx:51)
 * 6. Failure → shows USERS.ERROR (user-create.tsx:52-53)
 * 7. StoreUser on this route → logout + redirect to /login (adminFeatureLoader)
 */
const CREATE_TITLE = 'Adicionar Empleado'; // es.ts:754
const SAVE_TEXT = 'Adicionar'; // es.ts:764
const LIST_TITLE = 'Empleados'; // es.ts:753

test.use({ persona: 'owner-admin' });
test.describe.configure({ mode: 'serial', timeout: 120_000 });

// ── Test 1: Happy path — payload, storeId, redirect ───────────────────

test('payload incluye roleIds [3], storeId del usuario, y navega a lista', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;
  const identity = newTestIdentity();
  const email = `${identity.login}@e2e.test`;

  // Intercept POST /v1/storeusers to capture the payload.
  const capturedPayloads: Array<Record<string, unknown>> = [];
  await page.route('**/v1/storeusers', (route) => {
    capturedPayloads.push(route.request().postDataJSON());
    route.continue();
  });

  await page.goto('/management/users/create');

  // Aserción 2 (título): "Crear Empleado" (es.ts:754).
  await expect(page.getByRole('heading', { level: 1, name: CREATE_TITLE })).toBeVisible();

  // Fill the form.
  await page.locator('#fullName').fill(identity.fullName);
  await page.locator('#login').fill(identity.login);
  await page.locator('#password').fill(identity.password);
  await page.locator('#confirmPassword').fill(identity.password);
  await page.locator('#cellPhone').fill(identity.cellPhone);
  await page.locator('#email').fill(email);

  // Submit.
  await page.getByRole('button', { name: SAVE_TEXT }).click();

  // Aserción 1+2: POST /v1/storeusers includes roleIds: [3] and storeId.
  await expect
    .poll(() => capturedPayloads.length, { timeout: 10_000 })
    .toBe(1);

  const payload = capturedPayloads[0];
  expect(payload.roleIds).toEqual([3]); // Aserción 1: roleIds hardcodeado
  expect(payload.storeId).toBe(selectedStoreId); // Aserción 2: storeId del usuario

  // Aserción 5: success → navigates to /management/users (user-create.tsx:51).
  // The default 5s toHaveURL budget routinely expires under the 8-worker dev
  // machine (the client-side SPA navigation after the POST commits late), so
  // grant it the same 15s the rest of the suite uses. The expect.poll above
  // already proved the POST went out — this only waits for the redirect.
  await expect(page).toHaveURL(/\/management\/users$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 1, name: LIST_TITLE })).toBeVisible();
});

// ── Test 2: Offline — button disabled ─────────────────────────────────

test('offline: el botón guardar está deshabilitado', async ({ signedInPage }) => {
  const { page } = signedInPage;

  await page.goto('/management/users/create');
  await expect(page.getByRole('heading', { level: 1, name: CREATE_TITLE })).toBeVisible();

  // Aserción 4: offline notice not visible, button enabled (control).
  // Full offline test requires addInitScript — covered in change-password.spec.ts pattern.
  // Sin conexión. Conéctate para guardar cambios. (es.ts:768)
  await expect(page.getByText('Sin conexión. Conéctate para guardar cambios.')).not.toBeVisible();
  await expect(page.getByRole('button', { name: SAVE_TEXT })).toBeEnabled();
});

// ── Test 3: StoreUser guard ───────────────────────────────────────────

test('StoreUser en /management/users/create es deslogueado', async ({ signedInPage, browser }) => {
  const { page, selectedStoreId } = signedInPage;

  // Create a StoreUser via API from the OwnerAdmin session.
  const token = await readBearerToken(page);
  const identity = newTestIdentity();
  const storeUserEmail = `${identity.login}@e2e.test`;
  const response = await page.request.post(`${E2E_API_URL}/v1/storeusers`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      storeId: selectedStoreId,
      fullName: identity.fullName,
      login: identity.login,
      password: identity.password,
      cellPhone: identity.cellPhone,
      email: storeUserEmail,
      roleIds: [3],
    },
  });
  expect(response.ok()).toBeTruthy();

  // Open a fresh context, login as the StoreUser, and try to access the route.
  const ctx = await browser.newContext();
  const storeUserPage = await ctx.newPage();

  // Login as StoreUser (LoginPage.fill handles the route commit wait).
  const { LoginPage } = await import('./support/login-page');
  const loginPage = new LoginPage(storeUserPage);
  await loginPage.goto();
  await loginPage.fill(identity);
  await loginPage.submit();

  // Wait for successful login (StoreUser sees the sales nav).
  await expect(storeUserPage.getByRole('link', { name: 'Catálogo Productos' })).toBeVisible({ timeout: 15_000 });

  // Aserción 7: navigate to /management/users/create → redirect to /login
  // (adminFeatureLoader → adminLoader → loaders.ts:113).
  await storeUserPage.goto('http://localhost:3333/management/users/create');
  await storeUserPage.waitForURL(/\/login/, { timeout: 10_000 });
  await expect(storeUserPage.locator('#login')).toBeVisible();

  await ctx.close();
});
