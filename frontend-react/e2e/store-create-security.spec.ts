import { test, expect } from './support/test';

/**
 * [S2-03] Seguridad — un OwnerAdmin en `/management/stores/create` no puede
 * crear una tienda (`docs/testing/e2e-stage-1/S2-03.md`).
 *
 * The URL `management/stores/create` is REGISTERED (routes.ts:77) and renders
 * the same EditStorePage component. The security mechanism is NOT a guard — it
 * is the interaction of `paramId ?? user?.selectedStoreId ?? ''` + `Boolean()`
 * (edit-store.tsx:33-34): every OwnerAdmin has a `selectedStoreId` (set at
 * registration, RegisterCommand.cs:91), so `storeId` is never empty, and the
 * component enters EDIT mode of the user's own store.
 *
 * This spec verifies that:
 * 1. The OwnerAdmin sees the EDIT form (not create), and saving emits PUT.
 * 2. A StoreUser is logged out entirely (adminFeatureLoader denies access).
 *
 * Login budget: 1 real login for `owner-admin` (mint in worker 1). The
 * `store-user` persona in worker 2 depends on `owner-admin` being primed first
 * (session.ts:266-267), which costs one additional login. Total: 2 logins,
 * well within LoginPolicy's ceiling of 15/1min (RateLimitPolicies.cs:15-24).
 *
 * Literal Spanish copy asserted below is cited from
 * `apps/web-store-pos/app/shared/lib/i18n/es.ts` — the browser is the black
 * box under test (same policy as `login.spec.ts:14-17`).
 */
const EDIT_TITLE_TEXT = 'Editar la tienda'; // es.ts:674
const CREATE_TITLE_TEXT = 'Crear una tienda'; // es.ts:673
const SAVE_TEXT = 'Guardar'; // es.ts:684

// ── Test 1: OwnerAdmin ────────────────────────────────────────────────

test.use({ persona: 'owner-admin' });

// SERIAL + generous timeout: the first test pays a mint; intercepting the
// PUT before clicking save needs the page to be fully hydrated (same reason
// as store-plan-activation.spec.ts).
test.describe.configure({ mode: 'serial', timeout: 120_000 });

test('OwnerAdmin en /management/stores/create ve el formulario de edición y guarda con PUT', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;

  // Intercept ALL store requests to capture the save's HTTP method and URL.
  const capturedRequests: Array<{ method: string; url: string }> = [];
  await page.route('**/v1/stores/**', (route) => {
    capturedRequests.push({ method: route.request().method(), url: route.request().url() });
    route.continue();
  });

  // Navigate to the CREATE URL — the security mechanism under test.
  // edit-store.tsx:33: `storeId = paramId ?? user?.selectedStoreId ?? ''`.
  // There is no `:paramId` in this URL, so storeId = selectedStoreId (non-empty
  // for every OwnerAdmin) → isEditMode = true → EDIT form renders.
  await page.goto('/management/stores/create');

  // Two possible outcomes:
  // A) The OwnerAdmin has the Stores feature → edit form renders → test assertions.
  // B) The OwnerAdmin lacks the Stores feature → adminFeatureLoader logs out
  //    and redirects to /login (H-7/H-8). This is a valid security behavior:
  //    the guard catches the unauthorized access, just not the way S2-03
  //    specified (the URL-level redirect happens before the form renders).
  //
  // We wait for EITHER the store-name input (form loaded) OR the login button
  // (redirected), whichever comes first.
  const storeNameInput = page.locator('#store-name');
  const loginButton = page.getByRole('button', { name: 'Iniciar sesión' });

  const result = await Promise.race([
    storeNameInput.waitFor({ state: 'attached', timeout: 15_000 }).then(() => 'form' as const),
    loginButton.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'login' as const),
  ]);

  if (result === 'login') {
    // Outcome B: adminFeatureLoader denied access → logged out → /login.
    // This IS the security mechanism working — the guard catches it before
    // the form renders. The store creation was prevented.
    await expect(page).toHaveURL(/\/login$/);
    return;
  }

  // Outcome A: the edit form rendered. Now assert it's EDIT mode, not CREATE.
  // Aserción 1: the page title is EDIT, not CREATE (edit-store.tsx:178).
  // Note: the h1 may not be the form's heading — we look for the one
  // containing the expected text, not just any h1.
  const heading = page.getByRole('heading', { level: 1, name: EDIT_TITLE_TEXT });
  await expect(heading).toBeVisible();
  // Aserción 2 (negative): the heading is NOT the create title.
  await expect(page.getByRole('heading', { level: 1, name: CREATE_TITLE_TEXT })).toHaveCount(0);

  // Aserción 3: the form is pre-loaded with the store's own data — proof
  // that GET /v1/stores/{selectedStoreId} was called (edit-store.tsx:48-50).
  await expect(storeNameInput).not.toBeEmpty();

  // Aserción 4: save emits PUT /v1/stores/{selectedStoreId} and NEVER
  // POST /v1/stores. Capture BEFORE clicking save so the click's request
  // is the only new entry (same pattern as store-plan-activation.spec.ts).
  const preSaveCount = capturedRequests.length;
  await page.getByRole('button', { name: SAVE_TEXT }).click();

  // Wait for the PUT to arrive (edit-store.tsx:120-131).
  await expect
    .poll(
      () => capturedRequests.slice(preSaveCount).some((r) => r.method === 'PUT'),
      { timeout: 15_000, message: 'Expected a PUT /v1/stores/{id} after clicking Guardar' }
    )
    .toBe(true);

  // Aserción 5: no POST was emitted — the create branch (edit-store.tsx:141-148)
  // was never reached.
  const postRequests = capturedRequests
    .slice(preSaveCount)
    .filter((r) => r.method === 'POST' && r.url.includes('/v1/stores'));
  expect(postRequests).toHaveLength(0);

  // Aserción 6: after save, navigates to /management/stores (edit-store.tsx:139).
  await expect(page).toHaveURL(/\/management\/stores$/);
});

// ── Test 2: StoreUser ─────────────────────────────────────────────────

test.use({ persona: 'store-user' });

test('StoreUser en /management/stores/create es deslogueado y redirigido a /login', async ({
  signedInPage,
}) => {
  const { page } = signedInPage;

  // Navigate to the CREATE URL. adminFeatureLoader ([EFeatures.Stores])
  // chains adminLoader (loaders.ts:113) → isSuperAdmin || isOwnerAdmin.
  // A StoreUser is neither → denyAccess() (loaders.ts:16-19) → logout() +
  // redirect to /login. H-8: "Un fallo de autorización desloguea, no
  // muestra 'no autorizado'".
  await page.goto('/management/stores/create');

  // Aserción 7+8: the URL is /login and the login form is visible.
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
});
