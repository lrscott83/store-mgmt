import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { LoginPage } from './support/login-page';
import { RegisterPage } from './support/register-page';
import { newTestIdentity, type TestIdentity } from './support/identity';
import { restoreSignedInSession, createStoreUserViaUi } from './support/session';
import { mutateAuthModel, readRawAuthModel, writeRawAuthModel } from './support/auth-storage';

// Literal Spanish copy asserted below, cited from
// apps/web-store-pos/app/shared/lib/i18n/es.ts (design.md §5, §7). Hardcoded
// rather than imported: the browser is the black box under test, the app's
// own source is not — same policy as register.spec.ts.
const EMAIL_REQUIRED_TEXT = 'El email es requerido'; // es.ts:67
const PASSWORD_REQUIRED_TEXT = 'La contraseña es requerida'; // es.ts:69
const OFFLINE_LOGIN_TEXT = 'Estás offline. Se requiere conexión para iniciar sesión.'; // es.ts:85
// The 401 branch's text (login.tsx:172). REQ-3's control negative must prove
// the banner is NOT this — that would mean the body-level (200 +
// succeeded:false) branch never ran.
const INVALID_CREDENTIALS_TEXT = 'Email o contraseña inválidos'; // es.ts:80

// Verified trap #3 (storage-keys.ts:5): AUTH_MODEL's key is
// `${APP_VERSION}-authf496fc5a9f17`, version-prefixed. Never hardcode the
// full key — scan for the stable suffix instead.
const AUTH_MODEL_KEY_SUFFIX = '-authf496fc5a9f17';

interface AuthModel {
  authToken?: string;
  expiresIn?: number;
}

async function readAuthModel(page: Page): Promise<AuthModel | null> {
  return page.evaluate((suffix) => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.endsWith(suffix)) continue;
      try {
        return JSON.parse(window.localStorage.getItem(key) ?? 'null') as AuthModel | null;
      } catch {
        return null;
      }
    }
    return null;
  }, AUTH_MODEL_KEY_SUFFIX);
}

// A4/A5 consume no login and use no `signedInPage` — they live in their own
// parallel `describe`, same as register.spec.ts's own client-validation
// block (design.md §2).
test.describe('login — client-side validation, no session (A4, A5)', () => {
  test('REQ-4: empty fields block the submit client-side', async ({ page, loginNetwork }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.submit();

    // Wait for the UI effect BEFORE asserting zero requests (same reasoning
    // as register.spec.ts REQ-2): login.tsx's validation branch (:94-98)
    // returns before ever calling `login()`.
    await expect(page.getByText(EMAIL_REQUIRED_TEXT)).toBeVisible();
    await expect(page.getByText(PASSWORD_REQUIRED_TEXT)).toBeVisible();
    loginNetwork.expectNoLoginAttempt();
  });

  test('REQ-5: offline without a roster blocks before the network and shows the offline banner', async ({
    page,
    loginNetwork,
  }) => {
    const identity = newTestIdentity();
    const loginPage = new LoginPage(page);
    // Order matters (design.md H3, same reasoning as register.spec.ts's own
    // REQ-7): go online first so the SPA bundle actually loads, THEN fill,
    // THEN flip offline, THEN submit.
    await loginPage.goto();
    await loginPage.fill(identity);
    await page.context().setOffline(true);
    await loginPage.submit();

    await expect(page.getByText(OFFLINE_LOGIN_TEXT)).toBeVisible();
    loginNetwork.expectNoLoginAttempt();
  });
});

// Everything below consumes a real login and therefore MUST run serially in
// ONE worker (design.md §2 H2): the persona cache is scoped per-worker, and
// serializing this block is what guarantees the persona chain mints exactly
// once per run instead of once per worker under `fullyParallel`. Declaration
// order below is load-bearing: the FIRST test primes `owner-admin`, "REQ-11"
// primes `store-user` and is the first to actually trigger the chain
// (`owner-admin-with-products`/`store-user-with-products`), and everything
// after reuses that single cached mint (design.md §2, exactly 4 real logins
// for the whole file).
test.describe.serial('login — authenticated flows (A1-A3, A6-A7, D1, D3-D6)', () => {
  // The 30s default is a per-test budget sized for ONE flow. Every test in this
  // block spends several: the first pays a full registration AND a full login
  // before its first assertion; REQ-11 creates a StoreUser through the UI; REQ-9
  // seeds a category and a product and then logs in again. That density is not
  // incidental — the 4-login ceiling (design.md §2) is what forced 13 REQs into
  // 8 tests, and fat tests are the price of a thin login budget. Raise the
  // budget to match; do NOT split these tests to fit 30s, because splitting
  // them is exactly what would spend a login the ceiling does not have.
  test.describe.configure({ timeout: 120_000 });

  let ownerIdentity: TestIdentity;
  // Captured for REQ-14 (D6): the guard-rebound destinations asserted later
  // must agree with these two explicit-login destinations.
  let ownerNoProductsDestination: string;
  let ownerWithProductsDestination: string;

  test(
    'REQ-1, REQ-2, REQ-6, REQ-10, REQ-13: a live login shows only the overlay in causal network ' +
      'order, persists the token, and lands on /sales/products with no product API traffic',
    async ({ page, loginNetwork, personaCache }) => {
      ownerIdentity = newTestIdentity();

      const registerPage = new RegisterPage(page);
      await registerPage.goto();
      await registerPage.fillValidForm(ownerIdentity);
      await registerPage.acceptTerms.check();
      await registerPage.submit();
      await page.waitForURL(/\/login$/);

      const loginPage = new LoginPage(page);
      await loginPage.fill(ownerIdentity);
      const submitted = loginPage.submit();

      // REQ-1 (A1), sample 1 — anchored to the login request going out, not
      // a timeout (design.md §7 A1).
      await loginNetwork.waitForLoginRequest();
      await expect(page.locator('#email')).toHaveCount(0);
      await expect(loginPage.loadingOverlay).toBeVisible();

      // REQ-1 (A1), sample 2 — anchored to the /me request starting,
      // bracketing the second gap the assertion names.
      await loginNetwork.waitForMeRequest();
      await expect(page.locator('#email')).toHaveCount(0);
      await expect(loginPage.loadingOverlay).toBeVisible();

      await submitted;
      await page.waitForURL(/\/sales\/products$/); // REQ-10 (D2)
      ownerNoProductsDestination = new URL(page.url()).pathname;

      // REQ-2 (A2): the causal claim (/me starts AFTER the login response),
      // not merely "both occurred".
      loginNetwork.expectLoginThenMe();

      // REQ-6 (A6): AUTH_MODEL persisted with a non-empty token and a
      // future expiry.
      const authModel = await readAuthModel(page);
      expect(typeof authModel?.authToken).toBe('string');
      expect(authModel?.authToken).not.toBe('');
      expect(typeof authModel?.expiresIn).toBe('number');
      expect(authModel?.expiresIn as number).toBeGreaterThan(Date.now());

      // REQ-13 (D5): resolveUserHomePath resolved from local data — zero
      // product API traffic during this flow.
      loginNetwork.expectNoProductApiCall();

      // REQ-12 (D4), partial: this branch is never the reseller/superadmin one.
      expect(page.url()).not.toMatch(/\/admin\/owners$/);

      // Feed this exact, already-observed session into the persona cache —
      // everything derived from `owner-admin` below reuses it instead of
      // paying for a second, invisible login (design.md §2).
      await personaCache.primeOwnerAdmin(page, ownerIdentity);
    }
  );

  test('REQ-3: a wrong password against the account just registered shows the literal backend text', async ({
    page,
    loginNetwork,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.fill({ ...ownerIdentity, password: `${ownerIdentity.password}-wrong` });
    await loginPage.submit();

    const response = await loginNetwork.waitForLoginResponse();
    // 401, not 200: LoginCommand.MapErrorToStatusCode maps Auth.InvalidCredentials
    // to Unauthorized. The envelope is the same either way, so the assertion that
    // matters is the one below — the painted text is the server's own.
    expect(response.status).toBe(401);

    const body = JSON.parse(response.bodyText) as { errors: Array<{ description: string }> };
    const banner = page.getByText(
      `La autenticación no es válida por el siguiente error: ${body.errors[0].description}`,
      { exact: true }
    );

    // Two assertions, both required (same provenance logic as
    // register.spec.ts REQ-6): the painted text is byte-for-byte the
    // server's own text, AND it is not the 401 branch's generic string.
    await expect(banner).toBeVisible();
    await expect(banner).not.toHaveText(INVALID_CREDENTIALS_TEXT);
  });

  test('REQ-11: a StoreUser follows the same branch as an OwnerAdmin, with and without products', async ({
    page,
    personaCache,
  }) => {
    // "sin productos" half (design.md §7 D3): create + LIVE-login a fresh
    // StoreUser, from the owner's restored (zero-network) session.
    await restoreSignedInSession(page, personaCache, 'owner-admin');

    const storeUserIdentity = newTestIdentity();
    await createStoreUserViaUi(page, storeUserIdentity);

    // The owner is still authenticated on this same page — log out via the
    // real UI (identical mechanism to REQ-9/D1 below) so the StoreUser's own
    // login form becomes reachable.
    await page.goto('/sales/products');
    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('button', { name: 'Salir' }).click();
    await page.waitForURL(/\/login$/);

    const loginPage = new LoginPage(page);
    await loginPage.fill(storeUserIdentity);
    await loginPage.submit();
    await page.waitForURL(/\/sales\/products$/);
    expect(page.url()).not.toMatch(/\/admin\/owners$/); // REQ-12 (D4), partial

    // Feed this exact session in — the merge that produces
    // `store-user-with-products` (design.md §3 step 7) waits for it.
    await personaCache.primeStoreUser(page, storeUserIdentity);

    // "con productos" half (design.md §7 D3): restore the MERGED snapshot,
    // then let the guard resolve the destination — legitimate because it is
    // the SAME `resolveUserHomePath` function that governs REQ-7/REQ-14
    // elsewhere (design.md §7 D3's own justification).
    await restoreSignedInSession(page, personaCache, 'store-user-with-products');
    await page.goto('/login');
    await page.waitForURL(/\/sales\/new$/);
    expect(page.url()).not.toMatch(/\/admin\/owners$/); // REQ-12 (D4), partial
  });

  test('REQ-9: an OwnerAdmin whose store has products lands on /sales/new after a real re-login', async ({
    page,
    personaCache,
    loginNetwork,
  }) => {
    const session = await restoreSignedInSession(page, personaCache, 'owner-admin-with-products');

    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('button', { name: 'Salir' }).click();
    await page.waitForURL(/\/login$/);

    // logout() removes ONLY AUTH_MODEL (auth-store.ts:303-307) — the seeded
    // categories/products survive, so this REAL re-login lands on
    // /sales/new, not /sales/products.
    const loginPage = new LoginPage(page);
    await loginPage.fill(session.identity);
    await loginPage.submit();
    await page.waitForURL(/\/sales\/new$/);
    ownerWithProductsDestination = new URL(page.url()).pathname;

    expect(page.url()).not.toMatch(/\/admin\/owners$/); // REQ-12 (D4), partial
    loginNetwork.expectNoProductApiCall(); // REQ-13 (D5), D1 half
  });

  test('REQ-7: an already-authenticated OwnerAdmin visiting /login is redirected to their own home, never to /', async ({
    page,
    personaCache,
  }) => {
    await restoreSignedInSession(page, personaCache, 'owner-admin');
    await page.goto('/login');
    await page.waitForURL(/\/sales\/products$/);
    expect(new URL(page.url()).pathname).not.toBe('/');
  });

  test(
    'REQ-12, REQ-14: no OwnerAdmin/StoreUser ever lands on /admin/owners, and the guard rebound ' +
      'always agrees with the matching explicit-login destination',
    async ({ page, personaCache }) => {
      // REQ-14 (D6), pair 1: owner-admin (no products) — guard rebound vs
      // the earlier live login's explicit destination (D2).
      await restoreSignedInSession(page, personaCache, 'owner-admin');
      await page.goto('/login');
      await page.waitForURL(/\/sales\/products$/);
      expect(new URL(page.url()).pathname).toBe(ownerNoProductsDestination);
      expect(page.url()).not.toMatch(/\/admin\/owners$/); // REQ-12

      // REQ-14 (D6), pair 2: store-user-with-products — guard rebound vs
      // D1's explicit-login destination, same seeded store, different account.
      await restoreSignedInSession(page, personaCache, 'store-user-with-products');
      await page.goto('/login');
      await page.waitForURL(/\/sales\/new$/);
      expect(new URL(page.url()).pathname).toBe(ownerWithProductsDestination);
      expect(page.url()).not.toMatch(/\/admin\/owners$/); // REQ-12

      // REQ-12, remaining persona (bare store-user, already exercised live
      // in REQ-11) — re-checked here cheaply via restore.
      await restoreSignedInSession(page, personaCache, 'store-user');
      expect(page.url()).not.toMatch(/\/admin\/owners$/);
    }
  );

  // S1-04 (e2e-session-hydration): T1-T11, appended after the live-login
  // block above. Every test below restores an ALREADY-MINTED persona
  // (design.md D1, spec's R8 note) — none of them acuña a new one, so this
  // block spends zero additional real logins against the 4-login ceiling
  // (design.md §2).

  test('REQ-1: a reload with a valid cache makes zero /me requests (T1)', async ({
    page,
    personaCache,
    loginNetwork,
  }) => {
    await restoreSignedInSession(page, personaCache, 'owner-admin');
    // D1: restoreSignedInSession's own navigation already costs 0 /me
    // (currentUser.authToken === AUTH_MODEL.authToken from the real login) —
    // this reload re-checks the SAME cache-valid branch (auth-store.ts:125).
    await page.reload();
    await page.waitForURL(/\/sales\/products$/);
    loginNetwork.expectMeRequestCount(0);
  });

  test('REQ-2: a cache mismatch fires exactly one /me and keeps the session (T2)', async ({
    page,
    personaCache,
    loginNetwork,
  }) => {
    await restoreSignedInSession(page, personaCache, 'owner-admin');
    // D3: mutating ONLY AUTH_MODEL.authToken desyncs it from
    // currentUser.authToken (mismatch branch, auth-store.ts:140-149) while
    // the `token` key — what api-client.ts:37 actually sends — stays the
    // real, valid bearer, so the real backend answers /me with 200.
    await mutateAuthModel(page, { authToken: 'e2e-mismatched-auth-model-token-t2' });
    await page.reload();
    await loginNetwork.waitForMeRequest();
    await page.waitForLoadState('networkidle');

    loginNetwork.expectMeRequestCount(1);
    await expect(page.getByRole('button', { name: 'Menú de usuario' })).toBeVisible();
    expect(new URL(page.url()).pathname).not.toBe('/login');
  });

  test('REQ-3: /me unreachable without a usable cache retains the session (T3)', async ({
    page,
    personaCache,
    loginNetwork,
  }) => {
    await restoreSignedInSession(page, personaCache, 'owner-admin');
    await mutateAuthModel(page, { authToken: 'e2e-mismatched-auth-model-token-t3' });
    // D4's sibling for the cold-boot half: the honest simulation of "the
    // server is not there" is cutting the request at the origin, not
    // reloading offline (that traps the browser's own error page, not the
    // app — same pitfall as login.spec.ts:68-71 for a plain reload).
    await page.route('**/v1/auth/me', (route) => route.abort());
    await page.reload();
    await loginNetwork.waitForMeRequest();
    await page.waitForLoadState('networkidle');

    const authModel = await readRawAuthModel(page);
    expect(authModel).not.toBeNull();
    expect(new URL(page.url()).pathname).not.toBe('/login');
    await expect(page.getByRole('button', { name: 'Menú de usuario' })).toBeVisible();
  });

  test('REQ-5: a 500 from /me shows the blocking dialog but keeps the session (T5)', async ({
    page,
    personaCache,
    loginNetwork,
  }) => {
    await restoreSignedInSession(page, personaCache, 'owner-admin');
    await mutateAuthModel(page, { authToken: 'e2e-mismatched-auth-model-token-t5' });
    await page.route('**/v1/auth/me', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
    );
    await page.reload();
    await loginNetwork.waitForMeRequest();

    // D5: the dialog is part of the assertion, not an obstacle —
    // api-client.ts:88-95 opens a blocking Swal on every 500.
    await expect(page.getByRole('heading', { name: 'Error' })).toBeVisible();
    await expect(
      page.getByText(
        'Por favor, vuelva a intentarlo y si persiste el error contacte al equipo de soporte técnico.'
      )
    ).toBeVisible();
    await page.getByRole('button', { name: 'OK' }).click();

    const authModel = await readRawAuthModel(page);
    expect(authModel).not.toBeNull();
    await expect(page.getByRole('button', { name: 'Menú de usuario' })).toBeVisible();
  });

  test('REQ-10: an internal navigation while offline keeps the session alive (T10)', async ({
    page,
    personaCache,
  }) => {
    await restoreSignedInSession(page, personaCache, 'owner-admin');
    // D4: no reload while offline — the document would never be served and
    // the assertion would run against the browser's own error page, not the
    // app. A client-side <Link> navigation costs zero network requests.
    await page.context().setOffline(true);
    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('link', { name: 'Editar Perfil' }).click();
    await page.waitForURL(/\/profile\/edit$/);

    const authModel = await readRawAuthModel(page);
    expect(authModel).not.toBeNull();
    expect(new URL(page.url()).pathname).not.toBe('/login');
  });

  test('REQ-11: a parseable non-AUTH_MODEL payload is never removed nor triggers logout() (T11)', async ({
    page,
    personaCache,
  }) => {
    await restoreSignedInSession(page, personaCache, 'owner-admin');
    await writeRawAuthModel(page, '{"foo":1}');

    // Reloading from /login (guestOnlyLoader), not a protected route, on
    // purpose: authLoader's denyAccess() (loaders.ts:16-19) ALSO calls
    // logout() when unauthenticated, which WOULD remove AUTH_MODEL — but
    // that is a DIFFERENT code path than the one REQ-11 pins
    // (auth-store.ts:110-113, getUserByToken()'s own malformed-but-parseable
    // branch). Reloading from /login isolates the claim under test.
    await page.goto('/login');

    const raw = await readRawAuthModel(page);
    expect(raw).toBe('{"foo":1}');
  });
});
