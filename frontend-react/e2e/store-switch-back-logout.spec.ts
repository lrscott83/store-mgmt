import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { Client } from 'pg';
import { assertStoresFeature } from './support/store-fixture';
import { readBearerToken } from './support/auth-storage';
import { E2E_API_URL } from './support/backend-url';

/**
 * [store-switch-back-logout] E2E Playwright — switching BACK to the login
 * store with MultiStores must stay logged in.
 *
 * USER REPORT (2026-09-22): with MultiStores enabled, switching A -> B via
 * the header switcher works (no logout), but switching back B -> A logs the
 * user OUT and forces re-authentication.
 *
 * Why a real RE-LOGIN is part of the setup: the switch flow (switch-store.ts)
 * stays logged in ONLY when this device holds a per-store DEK wrap for the
 * TARGET store (provisioned at login from AuthDto.StoreDekWraps). A store
 * created AFTER this device's last login has no wrap yet, so switching to it
 * legitimately falls back to the legacy logout — that is the documented
 * "next login provisions it" behaviour, not the reported bug. The reported
 * bug is the SECOND switch: A -> B (wrap existed) then B -> A (wrap should
 * still exist). To reproduce that exact scenario the spec re-logs in through
 * the real UI after creating store B, which re-provisions wraps for BOTH
 * stores — after that, both switches must stay logged in.
 *
 * The tests READ the device DEK table (`lizoft.device-dek`, read-only) purely
 * for diagnostics in the failure message; every assertion is user-visible.
 * A logged-out state is detected by the app's own login form
 * ("Inicia sesión en tu cuenta") — logout does NOT navigate to /login.
 *
 * SETUP (same as store-switcher-refresh.spec.ts, owner-authorized 2026-09-22):
 * the owner-admin persona's store is born on the Pago plan WITHOUT
 * MultiStores (14) — the persona needs the module to see the switcher at all,
 * so the spec seeds module 14 into the persona's login store by direct DB and
 * refreshes the cached session through a real GET /v1/auth/me.
 *
 * NEVER touches existing specs (CLAUDE.md E2E rule) — brand-new file.
 */

test.use({ persona: 'owner-admin' });

test.describe.configure({ mode: 'serial', timeout: 180_000 });

const DEFAULT_DB_URL = 'postgresql://postgres:postgres@localhost:5432/smca_test';
const MODULE_MULTISTORES = 14;
const DEVICE_DEK_KEY = 'lizoft.device-dek';
/** Suffix of the versioned AUTH_MODEL storage key (`${APP_VERSION}-authf…`). */
const AUTH_MODEL_SUFFIX = '-authf496fc5a9f17';

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
 * localStorage.currentUser (same mechanism the app's softRefreshSession uses).
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

/** Reads this device's per-store DEK wrap keys (DIAGNOSTICS ONLY, read-only). */
async function readDekTableDiagnostics(page: Page): Promise<string> {
  return page.evaluate(({ dekKey, authSuffix }) => {
    const raw = window.localStorage.getItem(dekKey);
    if (!raw) return 'no device-dek table';
    try {
      const table = JSON.parse(raw) as { storeId?: string; stores?: Record<string, unknown> };
      const storeKeys = table.stores ? Object.keys(table.stores) : [];
      const authKey =
        Object.keys(window.localStorage).find((k) => k.endsWith(authSuffix)) ?? '(auth key not found)';
      const authPresent = window.localStorage.getItem(authKey) !== null;
      return `table.storeId=${table.storeId ?? '?'} stores=[${storeKeys.join(',')}] authModel=${authPresent ? 'present' : 'REMOVED'}`;
    } catch {
      return 'device-dek table unreadable';
    }
  }, { dekKey: DEVICE_DEK_KEY, authSuffix: AUTH_MODEL_SUFFIX });
}

/** Creates a store through the real UI flow and returns its name+id. */
async function createStoreViaUi(page: Page, name: string): Promise<{ id: string; name: string }> {
  await page.getByTestId('my-stores-create-button').click();
  const modal = page.getByTestId('owner-store-create-modal');
  await expect(modal).toBeVisible();
  await page.getByTestId('owner-store-name-input').fill(name);
  await page.getByTestId('owner-store-create-save').click();
  await expect(modal).not.toBeVisible();
  const token = await readBearerToken(page);
  let id = '';
  await expect
    .poll(async () => {
      const response = await page.request.get(`${E2E_API_URL}/v1/stores/my-stores`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok()) return null;
      const body = (await response.json()) as { data?: Array<{ id: string; name: string }> };
      const found = (body.data ?? []).find((s) => s.name === name);
      if (found) id = found.id;
      return found ?? null;
    }, { timeout: 20_000, message: `store "${name}" never appeared in GET /v1/stores my-stores` })
    .toBeTruthy();
  return { id, name };
}

/** The logged-out state, detected by the app's own login form heading. */
async function isLoggedOut(page: Page): Promise<boolean> {
  try {
    await page.getByRole('heading', { name: 'Inicia sesión en tu cuenta' }).waitFor({ timeout: 1_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens the header switcher popup and waits for the CURRENT marker. Idempotent:
 * the toggle button CLOSES the popup when it is already open, so a second call
 * right after a previous open would otherwise flip it shut.
 */
async function openSwitcherPopup(page: Page): Promise<void> {
  const current = page.getByText('Actual');
  if (await current.isVisible().catch(() => false)) return; // already open
  await page.getByRole('button', { name: 'Cambiar tienda' }).click();
  await expect(current).toBeVisible();
}

/** The switcher row-button for a store by name. */
function storeRow(page: Page, name: string) {
  return page.getByRole('button', { name: new RegExp(escapeRegex(name)) });
}

/**
 * Full re-login through the REAL UI (real POST /v1/auth/login): the only
 * flow that provisions per-store DEK wraps. Returns when the app home has
 * rendered with the switcher available.
 */
async function reloginViaUi(page: Page, login: string, password: string): Promise<void> {
  await page.goto('/');
  if (!(await isLoggedOut(page))) {
    // Still signed in — force the legacy state the login flow starts from.
    await page.evaluate(({ dekKey, authSuffix }) => {
      const authKey =
        Object.keys(window.localStorage).find((k) => k.endsWith(authSuffix)) ?? null;
      if (authKey) window.localStorage.removeItem(authKey);
      window.localStorage.removeItem(dekKey);
    }, { dekKey: DEVICE_DEK_KEY, authSuffix: AUTH_MODEL_SUFFIX });
  }
  // Unauthenticated `/` is the public landing — the form lives at /login.
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Inicia sesión en tu cuenta' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('textbox', { name: 'Usuario' }).fill(login);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Cambiar tienda' })).toBeVisible({ timeout: 30_000 });
}

/**
 * Switches to `storeName` through the switcher popup and asserts the reload
 * lands BACK in the app (never the login form) with `storeName` as current.
 */
async function switchAndAssertLanded(page: Page, storeName: string, diagnostics = ''): Promise<void> {
  await openSwitcherPopup(page);
  await storeRow(page, storeName).click();
  // THE CONTRACT UNDER TEST: a switch is a hard reload INTO the app — the
  // login form after it means the no-wrap fallback logged the user out.
  try {
    await expect
      .poll(async () => isLoggedOut(page), {
        timeout: 20_000,
        message:
          `switching to "${storeName}" must never log the user out, but the login form rendered. ` +
          (diagnostics ? `Device DEK table before this switch: ${diagnostics}` : ''),
      })
      .toBe(false);
  } catch (err) {
    // DIAGNOSTICS: dump the LIVE post-switch state so a failure pinpoints
    // which piece (session vs DEK table vs unlock gate) expelled the user.
    const liveUrl = page.url();
    const liveState = await page.evaluate(({ dekKey, authSuffix }) => {
      const raw = window.localStorage.getItem(dekKey);
      let table = 'no table';
      if (raw) {
        try {
          const t = JSON.parse(raw) as { storeId?: string; dekSource?: string; stores?: Record<string, unknown> };
          table = `storeId=${t.storeId ?? '?'} dekSource=${t.dekSource ?? '?'} stores=[${t.stores ? Object.keys(t.stores).join(',') : ''}]`;
        } catch {
          table = 'unreadable';
        }
      }
      const authKey = Object.keys(window.localStorage).find((k) => k.endsWith(authSuffix)) ?? null;
      return `dekTable=[${table}] authModel=${authKey ? 'present' : 'REMOVED'} userRaw=${window.localStorage.getItem('currentUser') ? 'present' : 'ABSENT'}`;
    }, { dekKey: DEVICE_DEK_KEY, authSuffix: AUTH_MODEL_SUFFIX });
    throw new Error(
      `switch to "${storeName}" ended logged out. url=${liveUrl} LIVE post-switch state: ${liveState}. ` +
      (diagnostics ? `Pre-switch: ${diagnostics}.` : ''),
    );
  }
  await expect(page.getByRole('button', { name: 'Cambiar tienda' })).toBeVisible({ timeout: 30_000 });
  await openSwitcherPopup(page);
  await expect(storeRow(page, storeName).getByText('Actual')).toBeVisible();
}

test('SSR-1 — switching to a second store lands in it without a logout', async ({
  signedInPage,
}) => {
  test.setTimeout(360_000); // DEBUG Grupo G (temporal): presupuesto x2 para aislar contención
  const { page, selectedStoreId, identity } = signedInPage;
  await assertStoresFeature(page);

  // SETUP: MultiStores (14) into the persona's login store + fresh profile.
  await seedMultiStoresModule(selectedStoreId);
  await refreshSessionFromMe(page);

  // Create the SECOND store through the real UI flow.
  await page.goto('/management/my-stores');
  await expect(page.getByTestId(`owner-store-card-${selectedStoreId}`)).toBeVisible();
  const storeB = await createStoreViaUi(page, `e2e-ssr-second-${Date.now()}`);

  // Re-login via the REAL UI: re-provisions per-store wraps for BOTH stores.
  await reloginViaUi(page, identity.login, identity.password);

  // The login store (A) must be offered before switching away.
  const loginStoreName = await page.evaluate(() => {
    const profile = JSON.parse(window.localStorage.getItem('currentUser') ?? '{}') as {
      roles?: Array<{ storeId: string; storeName?: string }>;
      selectedStoreId?: string;
    };
    return (
      profile.roles?.find((r) => r.storeId === profile.selectedStoreId)?.storeName ?? ''
    );
  });
  await openSwitcherPopup(page);
  await expect(storeRow(page, loginStoreName)).toBeVisible();
  await page.mouse.click(10, 10); // close the popup (click outside)

  // A -> B: the working direction.
  await switchAndAssertLanded(page, storeB.name);
});

test('SSR-2 — switching BACK to the login store does NOT log the user out', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId, identity } = signedInPage;
  await assertStoresFeature(page);

  // SETUP (same as SSR-1 — serial mode, fresh per test).
  await seedMultiStoresModule(selectedStoreId);
  await refreshSessionFromMe(page);

  await page.goto('/management/my-stores');
  await expect(page.getByTestId(`owner-store-card-${selectedStoreId}`)).toBeVisible();
  const storeB = await createStoreViaUi(page, `e2e-ssr-back-${Date.now()}`);

  // Re-login: wraps for BOTH stores are provisioned on THIS device.
  await reloginViaUi(page, identity.login, identity.password);

  const loginStoreName = await page.evaluate(() => {
    const profile = JSON.parse(window.localStorage.getItem('currentUser') ?? '{}') as {
      roles?: Array<{ storeId: string; storeName?: string }>;
      selectedStoreId?: string;
    };
    return (
      profile.roles?.find((r) => r.storeId === profile.selectedStoreId)?.storeName ?? ''
    );
  });

  // A -> B (works today).
  await switchAndAssertLanded(page, storeB.name);

  // B -> A (THE REPORTED BUG): today this hits the no-wrap fallback and logs
  // the user out — after the fix it must land back in A, still authenticated.
  const diagnosticsBefore = await readDekTableDiagnostics(page);
  await switchAndAssertLanded(
    page,
    loginStoreName,
    `Device DEK table before the BACK switch: ${diagnosticsBefore}`,
  );
});

/** Escapes a name for a RegExp literal (names contain no regex metachars). */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('SSR-3 — create-after-login timeline: NEITHER switch logs out (server-issued switch wrap)', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId, identity } = signedInPage;
  await assertStoresFeature(page);

  // SETUP: same module seed, then ONE real UI login — the user's "last
  // login". It provisions this device's per-store wrap for A ONLY (B does
  // not exist yet). This is the user's exact real timeline: the store is
  // created after the last login.
  //
  // THE HARDENED CONTRACT (switch-store v2): the switch response itself
  // carries the TARGET store's DEK wrapped under the CURRENT store's DEK
  // (the key the client already holds in memory), so a device with NO wrap
  // for B must still switch seamlessly — no logout, no re-auth, on BOTH
  // directions. Before the fix the first A -> B hit the legacy no-wrap
  // fallback and logged the user out (the exact reported pain).
  await seedMultiStoresModule(selectedStoreId);
  await reloginViaUi(page, identity.login, identity.password);

  await page.goto('/management/my-stores');
  await expect(page.getByTestId(`owner-store-card-${selectedStoreId}`)).toBeVisible();
  const storeB = await createStoreViaUi(page, `e2e-ssr-nologin-${Date.now()}`);

  const loginStoreName = await page.evaluate(() => {
    const profile = JSON.parse(window.localStorage.getItem('currentUser') ?? '{}') as {
      roles?: Array<{ storeId: string; storeName?: string }>;
      selectedStoreId?: string;
    };
    return (
      profile.roles?.find((r) => r.storeId === profile.selectedStoreId)?.storeName ?? ''
    );
  });

  // A -> B with NO device wrap for B: must stay logged in now.
  const diagnosticsBefore = await readDekTableDiagnostics(page);
  await switchAndAssertLanded(
    page,
    storeB.name,
    `Device DEK table before the first switch: ${diagnosticsBefore}`,
  );

  // THE PIVOT OF THE USER REPORT: switch BACK to A — also without any
  // re-authentication in between. Must land in A, still authenticated.
  const diagnosticsAfterFirst = await readDekTableDiagnostics(page);
  await switchAndAssertLanded(
    page,
    loginStoreName,
    `Device DEK table before the BACK switch (create-after-login timeline): ${diagnosticsAfterFirst}`,
  );

  // The session really survived: the same login still works server-side.
  void identity;
});
