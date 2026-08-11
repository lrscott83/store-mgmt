import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { LoginPage } from './support/login-page';
import { plantRoster, KAT_PASSWORD } from './support/roster-fixture';
import { installAnyRequestObserver, type AnyRequestObserver } from './support/any-request-observer';
import { seedCategoryAndProduct } from './support/store-seed';
import { readAuthModel } from './support/auth-storage';

/**
 * [S1-03] Login offline en dispositivo aprovisionado
 * (docs/testing/e2e-stage-1/S1-03.md). Zero HTTP on the success path — the
 * roster FILE decides the mode, never connectivity (login.tsx:109-110,123,
 * before the `ConnectivityService.isOnline()` check at :128).
 *
 * `installAnyRequestObserver` is installed HERE, inside each test, once at
 * the start, without cutting the network — never wired into
 * `support/test.ts` as an `auto` fixture (design.md D2 "alternativa
 * rechazada"): that file is outside this change's authorization boundary,
 * and adding a third always-on listener there would affect all 31
 * preexisting tests for a need only this spec has.
 *
 * Every test here plants its own roster via `plantRoster()` — writing
 * straight to `localStorage` (REQ-13), never `importRoster()`, never the
 * `provision.tsx` round-trip (S3-01's scope, not this one). T8 is the ONLY
 * test in this file that lets a request leave the browser, and it is
 * intercepted by `page.route()` before it can reach a real backend — this
 * spec spends zero real logins against `LoginPolicy` (REQ-13).
 */

// Literal Spanish copy asserted below, cited from
// apps/web-store-pos/app/shared/lib/i18n/es.ts — the browser is the black
// box under test, the app's own source is not (same policy as
// login.spec.ts:14-17).
const INVALID_CREDENTIALS_TEXT = 'Usuario o contraseña inválidos'; // es.ts:82
const ACCOUNT_INACTIVE_TEXT = 'Tu cuenta está inactiva. Contactá soporte.'; // es.ts:83
const SERVER_ERROR_TEXT = 'Algo salió mal. Intentá de nuevo.'; // es.ts:84
const TOO_MANY_ATTEMPTS_TEXT = 'Demasiados intentos. Esperá un momento antes de volver a intentar.'; // es.ts:85
const OFFLINE_LOGIN_TEXT = 'Estás offline. Se requiere conexión para iniciar sesión.'; // es.ts:87
const UNLOCK_REQUIRED_TEXT = 'Ingresá tu contraseña para desbloquear los datos de este dispositivo.'; // es.ts:90
const UNLOCK_FAILED_TEXT =
  'No se pudieron desbloquear los datos de este dispositivo. Si cambiaste tu contraseña, pedí una nueva activación.'; // es.ts:91-92

/**
 * A unique-enough roster login per test — no real registration happens here
 * (unlike `identity.ts`'s `newTestIdentity()`, which is for the real-backend
 * suites), so uniqueness only needs to avoid same-run collisions, not
 * survive a shared database.
 */
function uniqueLogin(prefix: string): string {
  return `e2e-offline-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Verified discovery (not in design.md, found while running this spec):
 * `login.tsx` calls `armTracking()` in BOTH its success branches — offline
 * (:114) AND online (:140) — and `use-store-usage-tracker.ts`'s route-change
 * effect then fires a fire-and-forget `POST .../v1/usages/store-daily-usage`
 * (`store-usage-tracker.ts`'s `flushUsage`) on the very next route render,
 * completely orthogonal to authentication. It fires identically after an
 * ONLINE login too — `login.spec.ts` (S1-02) never asserts a blanket "zero
 * ANY request" for exactly this reason, only the scoped
 * `expectNoProductApiCall()`, and the original `login-network-observer.ts`
 * already carried a comment anticipating it (preserved verbatim in this
 * refactor, see `PRODUCT_API_PATTERN`'s doc comment in
 * `support/login-network-observer.ts`). Since there is no real backend in
 * this run, the POST always fails and `flushUsage` never marks the day
 * `saved`, so it can retry on every subsequent route change too — this
 * tolerates ANY number of these specific requests, never any other kind.
 */
const USAGE_TRACKER_PATH = '/v1/usages/store-daily-usage';

function expectOnlyKnownTelemetry(anyRequest: AnyRequestObserver, context: string): void {
  const unexpected = anyRequest.requests().filter((r) => !r.url.includes(USAGE_TRACKER_PATH));
  if (unexpected.length > 0) {
    throw new Error(
      `Expected zero HTTP requests other than the known store-usage telemetry POST (${context}), ` +
        `but observed ${unexpected.length}: ` +
        unexpected.map((r) => `${r.method} ${r.url} (${r.resourceType})`).join('; ') +
        '.'
    );
  }
}

/**
 * device-wrapped-dek (WU9). Two literals mirrored here from production
 * source, never imported — same "the browser is the black box under test"
 * policy the Spanish copy constants above already follow:
 *   - `ENTITY_ENVELOPE_PREFIX` (entity-crypto.ts:23) — the on-disk ciphertext
 *     marker; a stored entity value begins with this iff `encryptEntity` ran
 *     with a non-null DEK.
 *   - the entity storage key shape (storage-keys.ts:8-9,
 *     `StorageKeys.entityKey`) — `lizoft.store-{entity}-{storeId}`, no
 *     `APP_VERSION` prefix (unlike `AUTH_MODEL`, see `auth-storage.ts:19-22`).
 */
const ENTITY_ENVELOPE_PREFIX = 'enc:v1:';

/** Raw (still-serialized) localStorage value for the `products` entity of
 * `storeId`, or `null` if absent. Used to prove an entity write actually
 * produced ciphertext (`enc:v1:` prefix), not merely that no UI error
 * appeared. */
async function readProductsEntityRaw(page: Page, storeId: string): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), `lizoft.store-products-${storeId}`);
}

/**
 * Polls (not a one-shot read) until the `products` entity for `storeId` is
 * present AND `enc:v1:`-prefixed. `seedCategoryAndProduct`'s own `await`
 * only resolves once its LAST click settles, which is a UI event, not a
 * guarantee that the underlying localStorage write has landed yet — polling
 * here removes that race instead of assuming it away.
 */
async function expectProductsEntityEncrypted(page: Page, storeId: string): Promise<void> {
  await expect
    .poll(async () => {
      const raw = await readProductsEntityRaw(page, storeId);
      return raw?.startsWith(ENTITY_ENVELOPE_PREFIX) ?? false;
    })
    .toBe(true);
}

// device-key-store.ts:24 (`DEVICE_KEY_DB`) — the ONE IndexedDB database this
// change adds, mirrored here as a literal for the same reason as the two
// constants above.
const DEVICE_KEY_DB = 'lizoft-device-key';

/** Destroys ONLY the device-key IndexedDB database — the localStorage wrap
 * table (`device-dek-table.ts`, `lizoft.device-dek`) is untouched (F4,
 * design §6: "device key destroyed after prior provisioning recovers via
 * this user's own password wrap"). `onblocked` resolves rather than hangs —
 * same bounded-wait discipline `device-key-store.ts`'s own `openDb()`
 * follows for `DEVICE_KEY_OPEN_TIMEOUT_MS`, applied here so a stray open
 * connection can never stall the test indefinitely. */
async function deleteDeviceKeyDatabase(page: Page): Promise<void> {
  await page.evaluate(
    (dbName) =>
      new Promise<void>((resolve, reject) => {
        const request = window.indexedDB.deleteDatabase(dbName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => resolve();
      }),
    DEVICE_KEY_DB
  );
}

/** Adds one product to the category that ALREADY exists in this store.
 *
 * `seedCategoryAndProduct` cannot be called twice against the same store:
 * its own contract (store-seed.ts:36-39) is that "exactly one category
 * exists in this fresh store", which is what makes its
 * `[data-testid^="category-actions-toggle-"]` prefix locator unambiguous. A
 * second call creates a second category and the locator then resolves to two
 * elements (Playwright strict mode violation).
 *
 * T10's post-reload proof does not need a second category — it needs a fresh
 * PRODUCT write, since `expectProductsEntityEncrypted` reads the products
 * entity. So this mirrors store-seed.ts:40-46 only, leaving the single
 * seeded category in place and the prefix locator unambiguous. Local to this
 * spec on purpose: store-seed.ts is shared with other specs and outside this
 * change's authorization boundary. */
async function addProductToExistingCategory(page: Page, name: string): Promise<void> {
  await page.locator('[data-testid^="category-actions-toggle-"]').click();
  await page.getByTestId('add-product-button').click();
  await page.getByTestId('product-name-input').fill(name);
  await page.getByTestId('product-price-input').fill('10');
  await page.getByTestId('create-product-submit').click();
}

test.describe('login offline — dispositivo aprovisionado (S1-03)', () => {
  test('T1: golden path — cero HTTP, online-igual-offline, localStorage hidratado, destino sin productos', async ({
    page,
    loginNetwork,
  }) => {
    const anyRequest = installAnyRequestObserver(page);
    const loginPage = new LoginPage(page);
    const login = uniqueLogin('t1');

    // D4: goto (online) -> plant -> fill -> submit, no network cut at all —
    // the navigator stays online the whole test (REQ-2).
    await loginPage.goto();
    await plantRoster(page, { users: [{ login }] });
    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();

    // Fresh store, never seeded -> resolveUserHomePath resolves "no
    // products" (REQ-11).
    await page.waitForURL(/\/sales\/products$/);

    const authModel = await readAuthModel(page);
    expect(authModel?.authToken).toBeTruthy();
    expect(authModel?.expiresIn).toBeTruthy();

    expectOnlyKnownTelemetry(anyRequest, 'T1 golden path');
    loginNetwork.expectNoLoginAttempt();
  });

  test('T2: destino con productos — siembra por UI, logout y 2º submit offline', async ({ page }) => {
    const anyRequest = installAnyRequestObserver(page);
    const loginPage = new LoginPage(page);
    const login = uniqueLogin('t2');

    await loginPage.goto();
    await plantRoster(page, { users: [{ login }] });
    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();
    await page.waitForURL(/\/sales\/products$/);

    // Zero API requests: GlobalConfig.USE_ONLINE_SERVICE = false routes this
    // through the offline (localStorage) product/category services
    // (store-seed.ts's own doc comment).
    await seedCategoryAndProduct(page, `E2E Offline Product ${login}`);

    // logout() (auth-store.ts:352-370) removes only AUTH_MODEL — the roster
    // and the seeded entities survive, so the 2nd submit below still takes
    // the offline branch against the same, now-stocked store.
    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('button', { name: 'Salir' }).click();
    await page.waitForURL(/\/login$/);

    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();
    await page.waitForURL(/\/sales\/new$/);

    expectOnlyKnownTelemetry(anyRequest, 'T2 destino con productos');
  });

  test('T3: login ausente y contraseña incorrecta muestran el mismo AUTH.INVALID_CREDENTIALS', async ({
    page,
    loginNetwork,
  }) => {
    const anyRequest = installAnyRequestObserver(page);
    const loginPage = new LoginPage(page);
    const existingLogin = uniqueLogin('t3-existing');
    const missingLogin = uniqueLogin('t3-missing');

    await loginPage.goto();
    await plantRoster(page, { users: [{ login: existingLogin }] });

    // Sub-scenario A: a login absent from bundle.users entirely.
    await loginPage.fill({ login: missingLogin, password: KAT_PASSWORD });
    await loginPage.submit();
    await expect(page.getByText(INVALID_CREDENTIALS_TEXT)).toBeVisible();

    // Sub-scenario B: an existing login, wrong password — same text,
    // indistinguishable for an attacker (REQ-3).
    await loginPage.fill({ login: existingLogin, password: 'WrongPassword123' });
    await loginPage.submit();
    await expect(page.getByText(INVALID_CREDENTIALS_TEXT)).toBeVisible();

    anyRequest.expectNoRequests('T3 credenciales inválidas');
    loginNetwork.expectNoLoginAttempt();
  });

  test('T4: usuario inactivo con contraseña correcta muestra AUTH.ACCOUNT_INACTIVE', async ({
    page,
    loginNetwork,
  }) => {
    const anyRequest = installAnyRequestObserver(page);
    const loginPage = new LoginPage(page);
    const login = uniqueLogin('t4');

    await loginPage.goto();
    await plantRoster(page, { users: [{ login, isActive: false }] });
    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();

    await expect(page.getByText(ACCOUNT_INACTIVE_TEXT)).toBeVisible();
    anyRequest.expectNoRequests('T4 cuenta inactiva');
    loginNetwork.expectNoLoginAttempt();
  });

  test('T5: inactivo con contraseña incorrecta ve credenciales inválidas, no cuenta inactiva (orden verifier→password→isActive)', async ({
    page,
    loginNetwork,
  }) => {
    const anyRequest = installAnyRequestObserver(page);
    const loginPage = new LoginPage(page);
    const login = uniqueLogin('t5');

    await loginPage.goto();
    await plantRoster(page, { users: [{ login, isActive: false }] });
    await loginPage.fill({ login, password: 'WrongPassword123' });
    await loginPage.submit();

    await expect(page.getByText(INVALID_CREDENTIALS_TEXT)).toBeVisible();
    await expect(page.getByText(ACCOUNT_INACTIVE_TEXT)).not.toBeVisible();
    anyRequest.expectNoRequests('T5 orden de verificación');
    loginNetwork.expectNoLoginAttempt();
  });

  test('T6: verifier malformado muestra AUTH.SERVER_ERROR', async ({ page, loginNetwork }) => {
    const anyRequest = installAnyRequestObserver(page);
    const loginPage = new LoginPage(page);
    const login = uniqueLogin('t6');

    await loginPage.goto();
    await plantRoster(page, { users: [{ login, verifier: 'malformed' }] });
    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();

    await expect(page.getByText(SERVER_ERROR_TEXT)).toBeVisible();
    anyRequest.expectNoRequests('T6 verifier malformado');
    loginNetwork.expectNoLoginAttempt();
  });

  test('T7: DEK corrupta con contraseña correcta muestra AUTH.UNLOCK_FAILED, nunca credenciales inválidas', async ({
    page,
    loginNetwork,
  }) => {
    const anyRequest = installAnyRequestObserver(page);
    const loginPage = new LoginPage(page);
    const login = uniqueLogin('t7');

    // wrap: 'tampered' — the verifier still passes (password is untouched),
    // so unwrapDek() runs and its AES-GCM tag check fails (DekUnwrapError),
    // AFTER the password has already been confirmed correct (REQ-6).
    await loginPage.goto();
    await plantRoster(page, { users: [{ login, wrap: 'tampered' }] });
    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();

    await expect(page.getByText(UNLOCK_FAILED_TEXT)).toBeVisible();
    await expect(page.getByText(INVALID_CREDENTIALS_TEXT)).not.toBeVisible();
    anyRequest.expectNoRequests('T7 DekUnwrapError');
    loginNetwork.expectNoLoginAttempt();
  });

  test('T8: bundle vencido cae a la vía online — interceptada, sin gastar cupo de LoginPolicy', async ({
    page,
  }) => {
    const anyRequest = installAnyRequestObserver(page);
    const loginPage = new LoginPage(page);
    const login = uniqueLogin('t8');

    // D5: the ONLY network request in this entire spec. Intercepted before
    // it ever reaches a real backend — 0 of the 5/min LoginPolicy quota is
    // spent (REQ-13).
    let interceptCount = 0;
    await page.route('**/v1/auth/login', (route) => {
      interceptCount += 1;
      return route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ succeeded: false, errors: [{ description: 'rate limited' }] }),
      });
    });

    await loginPage.goto();
    // Already-expired bundle -> isRosterProvisioned() is false ->
    // login.tsx falls to the ONLINE branch (roster-store.ts:148).
    await plantRoster(page, { users: [{ login }], expiresInMs: -1_000 });
    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();

    // The 429 the intercepted route answers with — reachable from the
    // ONLINE branch only; offlineErrorMessageId() never produces this id
    // (login.tsx:37-53), so the banner itself is proof the online branch
    // ran, not just the interception count.
    await expect(page.getByText(TOO_MANY_ATTEMPTS_TEXT)).toBeVisible();

    // Double proof (design.md D5): the handler ran exactly once, AND the
    // generic observer independently saw exactly one request, to the login
    // endpoint, and nothing else.
    expect(interceptCount).toBe(1);
    const requests = anyRequest.requests();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain('/v1/auth/login');
  });

  test('T9: bundle vencido + navegador offline muestra el banner AUTH.OFFLINE_LOGIN', async ({
    page,
    loginNetwork,
  }) => {
    const anyRequest = installAnyRequestObserver(page);
    const loginPage = new LoginPage(page);
    const login = uniqueLogin('t9');

    await loginPage.goto();
    await plantRoster(page, { users: [{ login }], expiresInMs: -1_000 });
    await loginPage.fill({ login, password: KAT_PASSWORD });
    // Order matters (D4 step 6, same reasoning as login.spec.ts REQ-5): go
    // online first so the SPA bundle actually loads, fill, THEN flip
    // offline, THEN submit — never navigate again after this point.
    await page.context().setOffline(true);
    await loginPage.submit();

    await expect(page.getByText(OFFLINE_LOGIN_TEXT)).toBeVisible();
    anyRequest.expectNoRequests('T9 vencido + offline');
    loginNetwork.expectNoLoginAttempt();
  });

  // T10 REWRITTEN (device-wrapped-dek, WU9 — AUTHORIZED test modification
  // #3 of 3). The OLD assertion (`/login?unlock=1` + AUTH.UNLOCK_REQUIRED
  // after any reload) pinned the pre-device-wrap world: the DEK lived only
  // in a module-level `let` (data-key-store.ts), so any reload lost it and
  // forced a password prompt. That is exactly the behavior this whole
  // change replaces — WU8's own checkpoint made "reload recovers silently"
  // observable end to end, and this is its only E2E proof. Preserved
  // verbatim below (git history) for anyone auditing what changed and why.
  test('T10: recarga con roster v2 recupera el DEK del wrap de dispositivo, sigue en /sales/products, sin AUTH.UNLOCK_REQUIRED', async ({
    page,
    loginNetwork,
  }) => {
    const anyRequest = installAnyRequestObserver(page);
    const loginPage = new LoginPage(page);
    const login = uniqueLogin('t10');

    await loginPage.goto();
    const bundle = await plantRoster(page, { users: [{ login, wrap: 'kat' }] });
    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();
    await page.waitForURL(/\/sales\/products$/);

    // Precondition (repo discipline: pin the state a test's later assertion
    // depends on, before acting): an entity written under THIS login's DEK,
    // BEFORE the reload — the reload's whole claim is that this same data
    // is still transparently readable afterwards, under the SAME device DEK
    // recovered silently, not a different one.
    const beforeName = `E2E T10 antes del reload ${login}`;
    await seedCategoryAndProduct(page, beforeName);
    await expect(page.getByText(beforeName)).toBeVisible();
    await expectProductsEntityEncrypted(page, bundle.storeId);

    // The DEK lives only in a module-level `let` (data-key-store.ts) — ANY
    // reload loses it FROM MEMORY. This reload runs ONLINE on purpose
    // (design.md D6, unchanged from the old test): getUserByToken()'s
    // cached-profile branch (auth-store.ts:126-140) still costs zero HTTP,
    // so this is not combined with a network cut.
    await page.reload();

    // No redirect, no unlock prompt — the working device-key wrap
    // (design §3/§5) recovers the DEK silently.
    await page.waitForURL(/\/sales\/products$/);
    await expect(page.getByText(UNLOCK_REQUIRED_TEXT)).not.toBeVisible();

    // Same-DEK proof #1: data encrypted BEFORE the reload is still
    // transparently readable NOW. `decryptEntity` throws
    // `MissingDataKeyError` on a null DEK, and an AES-GCM tag mismatch on
    // any OTHER key — rendering this back out is what a byte-for-byte
    // identical recovered DEK looks like from the outside, stronger proof
    // than "no prompt appeared" alone.
    await expect(page.getByText(beforeName)).toBeVisible();

    // Same-DEK proof #2: a FRESH entity write after the reload still
    // produces ciphertext (`enc:v1:`), not plaintext — the recovered DEK is
    // live and functional for new writes, not merely cached for old reads.
    const afterName = `E2E T10 después del reload ${login}`;
    await addProductToExistingCategory(page, afterName);
    await expect(page.getByText(afterName)).toBeVisible();
    await expectProductsEntityEncrypted(page, bundle.storeId);

    expectOnlyKnownTelemetry(anyRequest, 'T10 reload con recuperación silenciosa del DEK');
    loginNetwork.expectNoLoginAttempt();
  });

  // F4 (design §6, NEW test — WU9): "device key gone, password wrap
  // intact → /login?unlock=1 → recovers". The unlock path T10 used to
  // exercise unconditionally does NOT vanish with this change — it narrows
  // to exactly this failure mode (device-key/IndexedDB loss), proven here
  // end to end: destroy only the IndexedDB half, keep the localStorage wrap
  // table, and confirm the app degrades to a password prompt (never to
  // plaintext, never a crash) and recovers the SAME data afterwards.
  test('F4: clave de dispositivo destruida con wrap de contraseña intacto exige contraseña en /login?unlock=1 y recupera los mismos datos', async ({
    page,
    loginNetwork,
  }) => {
    const anyRequest = installAnyRequestObserver(page);
    const loginPage = new LoginPage(page);
    const login = uniqueLogin('f4');

    await loginPage.goto();
    const bundle = await plantRoster(page, { users: [{ login }] });
    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();
    await page.waitForURL(/\/sales\/products$/);

    const name = `E2E F4 ${login}`;
    await seedCategoryAndProduct(page, name);
    await expect(page.getByText(name)).toBeVisible();
    await expectProductsEntityEncrypted(page, bundle.storeId);

    // F4's precondition: destroy ONLY the device key (IndexedDB) — the
    // localStorage wrap table stays intact, including this login's own
    // password wrap (design §5 step 5 / Q2: every provisioned login gets
    // one, roster-adopted or locally-minted alike).
    await deleteDeviceKeyDatabase(page);

    await page.reload();

    // Device-key recovery fails (F1: no key) -> unlock-gate's device-wrap
    // branch still sees the localStorage table -> degrades to a password
    // prompt, never to plaintext, never a crash (design §6 F1/F4).
    await page.waitForURL(/\/login\?unlock=1$/);
    await expect(page.getByText(UNLOCK_REQUIRED_TEXT)).toBeVisible();

    // Recovers via this login's OWN password wrap (step 3a's "own" branch).
    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();

    // NOT `/sales/products` — unlike the first login above, the store now
    // holds a sellable product (seeded before the device key was destroyed),
    // so `resolveUserHomePath` (user-home.ts:24-25) resolves to the sale
    // screen instead. Landing here is itself evidence the DEK came back: that
    // branch calls `hasAnyAvailableToSaleProduct()`, which has to DECRYPT the
    // products entity to answer.
    await page.waitForURL(/\/sales\/new$/);

    // Same DEK bytes recovered -> the data seeded before the device key was
    // destroyed is still transparently readable, not corrupted. Asserted on
    // the products screen, which is where that copy renders.
    await page.goto('/sales/products');
    await page.waitForURL(/\/sales\/products$/);
    await expect(page.getByText(name)).toBeVisible();
    await expectProductsEntityEncrypted(page, bundle.storeId);

    expectOnlyKnownTelemetry(anyRequest, 'F4 clave de dispositivo destruida, wrap de contraseña intacto');
    loginNetwork.expectNoLoginAttempt();
  });

  test('T11: sin conexión aterriza en la misma ruta que con conexión', async ({ page, loginNetwork }) => {
    const anyRequest = installAnyRequestObserver(page);
    const loginPage = new LoginPage(page);
    const login = uniqueLogin('t11');

    await loginPage.goto();
    await plantRoster(page, { users: [{ login }] });

    // Verified gotcha (not in design.md): the Vite dev server serves route
    // chunks as on-demand ES module HTTP fetches (playwright.config.ts's own
    // `webServer`, service worker blocked). Cutting the network BEFORE the
    // very first navigation to a route this browser context has never
    // visited stalls that fetch forever — a test-environment artifact only
    // (a bundled production build ships every route's code), not something
    // REQ-12 is about. So: warm `/sales/products` with a first ONLINE
    // submit, exactly like the connected run REQ-12 compares against, THEN
    // repeat the submit offline for the real assertion — same pattern T2
    // uses to reach its own second submit.
    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();
    await page.waitForURL(/\/sales\/products$/);

    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('button', { name: 'Salir' }).click();
    await page.waitForURL(/\/login$/);

    // The REQ-12 assertion proper: same user, same store state (no
    // products), second submit with the network cut beforehand — destino
    // idéntico al observado arriba con conexión.
    await loginPage.fill({ login, password: KAT_PASSWORD });
    await page.context().setOffline(true);
    await loginPage.submit();
    await page.waitForURL(/\/sales\/products$/);

    expectOnlyKnownTelemetry(anyRequest, 'T11 sin conexión');
    loginNetwork.expectNoLoginAttempt();
  });
});
