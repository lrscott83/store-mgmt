import { test, expect } from './support/test';
import { LoginPage } from './support/login-page';
import { RegisterPage } from './support/register-page';
import { newTestIdentity, type TestIdentity } from './support/identity';

/**
 * [S4-02] Cambiar la contraseña propia
 * (`docs/testing/e2e-stage-1/S4-02.md`).
 *
 * Covers the 7 UI assertions of that scenario: successful change triggers
 * logout + redirect to /login, old password no longer works, new password
 * works, failure shows error without logout, offline disables submit.
 *
 * NEVER uses a shared persona (`signedInPage`). This spec mutates the
 * password SERVER-SIDE: doing that on the shared `owner-admin` persona
 * poisons the worker-scoped personaCache's memoized snapshot for every later
 * spec file in the same worker (the snapshot keeps the OLD password while
 * the backend already expects the new one) — the login.spec REQ-9 flaky,
 * root-caused 2026-09-03. State-mutating specs mint their OWN identity in
 * vivo (see e2e/README.md "specs que mutan estado server-side").
 *
 * Login budget: 1 registration + 4 real logins (test 1: initial login,
 * old-password rejection, new-password re-login; test 2: its own login with
 * the new password) — well within LoginPolicy's ceiling of 40/1min
 * (RateLimitPolicies.cs:15-29).
 *
 * Literal Spanish copy asserted below is cited from
 * `apps/web-store-pos/app/shared/lib/i18n/es.ts`.
 */
const CHANGE_PASSWORD_TITLE = 'Cambiar contraseña'; // es.ts:648
const SUBMIT_TEXT = 'Cambiar contraseña'; // es.ts:659
const UPDATE_ERROR = 'No se pudo actualizar el perfil. Intentá de nuevo.'; // es.ts:655

// Shared across the serial tests: test 2 logs in with the password test 1 set.
let identity: TestIdentity;
let newPass: string;

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test('cambiar contraseña cierra sesión y la nueva funciona', async ({ page }) => {
  identity = newTestIdentity();
  newPass = 'E2E-NewPass1';

  // Mint a PRIVATE identity in vivo — never the shared `owner-admin` persona.
  const registerPage = new RegisterPage(page);
  await registerPage.goto();
  await registerPage.fillValidForm(identity);
  await registerPage.acceptTerms.check();
  await registerPage.submit();
  await page.waitForURL(/\/login$/);

  const loginPage = new LoginPage(page);
  await loginPage.fill(identity);
  await loginPage.submit();
  await page.waitForURL(/\/sales\/products$/); // fresh owner's home (no products)

  // Navigate to change password page.
  await page.goto('/profile/change-password');

  // Aserción 1: page title is "Cambiar contraseña" (es.ts:648).
  await expect(page.getByRole('heading', { name: CHANGE_PASSWORD_TITLE })).toBeVisible();

  // Aserción 2: form has the three required fields.
  await expect(page.locator('#oldPassword')).toBeVisible();
  await expect(page.locator('#newPassword')).toBeVisible();
  await expect(page.locator('#confirmPassword')).toBeVisible();

  // Fill the form with the current password and a new one.
  await page.locator('#oldPassword').fill(identity.password);
  await page.locator('#newPassword').fill(newPass);
  await page.locator('#confirmPassword').fill(newPass);

  // Intercept the change-password request to verify the payload.
  const capturedRequests: Array<{ method: string; url: string; body: string }> = [];
  await page.route('**/v1/users/change-password/**', (route) => {
    capturedRequests.push({
      method: route.request().method(),
      url: route.request().url(),
      body: route.request().postData() ?? '',
    });
    route.continue();
  });

  // Submit the form.
  await page.getByRole('button', { name: SUBMIT_TEXT }).click();

  // Aserción 3: the POST payload is exactly { oldPassword, newPassword }
  // (profile-http-service.ts:11-14).
  await expect
    .poll(
      () => capturedRequests.some((r) => r.method === 'POST'),
      { timeout: 10_000, message: 'Expected POST /v1/users/change-password/{id}' }
    )
    .toBe(true);

  const postBody = JSON.parse(capturedRequests.find((r) => r.method === 'POST')!.body);
  expect(postBody).toHaveProperty('oldPassword', identity.password);
  expect(postBody).toHaveProperty('newPassword', newPass);

  // Aserción 4: successful change triggers logout → redirect to /login
  // (change-password.tsx:28; auth-store.ts:303-321).
  await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });

  // Aserción 5: AUTH_MODEL removed from localStorage (auth-store.ts:307).
  const authModel = await page.evaluate(() => localStorage.getItem('AUTH_MODEL'));
  expect(authModel).toBeNull();

  // Aserción 6: old password no longer works.
  await loginPage.fill({ login: identity.login, password: identity.password });
  await loginPage.submit();

  // Should stay on /login (invalid credentials → 401).
  await expect(page).toHaveURL(/\/login$/);
  // The error message is rendered in a red div (login.tsx:247-251).
  await expect(page.locator('.text-red-700')).toBeVisible();

  // Aserción 7: new password works — re-login succeeds.
  await loginPage.fill({ login: identity.login, password: newPass });
  await loginPage.submit();

  // Should navigate away from /login to the home path.
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 10_000 });
});

test('offline: el botón de envío está deshabilitado', async ({ page }) => {
  // Private identity, same rule: a live login with the password test 1 just
  // set — never the shared persona cache.
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.fill({ login: identity.login, password: newPass });
  await loginPage.submit();
  await page.waitForURL(/\/sales\/products$/);

  // Override navigator.onLine before React mounts — useOnlineStatus reads
  // it in useState(navigator.onLine). addInitScript runs before any page JS.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', {
      get: () => false,
      configurable: true,
    });
  });

  await page.goto('/profile/change-password');

  // The form disables the submit button when offline (change-password.tsx:39).
  const submitButton = page.getByRole('button', { name: SUBMIT_TEXT });
  await expect(submitButton).toBeDisabled();
});
