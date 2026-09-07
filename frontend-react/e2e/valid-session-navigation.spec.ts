import type { Browser, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { RegisterPage } from './support/register-page';
import { LoginPage } from './support/login-page';
import { newTestIdentity, type TestIdentity } from './support/identity';
import { plantRoster, KAT_PASSWORD } from './support/roster-fixture';

/**
 * Sesión válida OwnerAdmin (online y offline): ir a /login o /register debe
 * redirigir al home del rol, y recargar una vista autenticada debe mantener
 * la sesión en esa vista.
 *
 * 12 tests = {online, offline} × {dispositivo intacto, sin clave de
 * dispositivo} × {reload, /login, /register}. "Sin clave de dispositivo" =
 * IndexedDB destruido con la tabla de wraps en localStorage intacta — el
 * estado que dispara el par de síntomas reportado.
 */

const HOME_URL = /\/sales\/products$/;
const USER_MENU = 'Menú de usuario';
const DEVICE_KEY_DB = 'lizoft-device-key';

interface SnapshotEntries {
  origin: string;
  localStorage: Array<{ name: string; value: string }>;
}

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

/** Registro real + login real por UI; termina en /sales/products. */
async function registerAndLoginOnline(page: Page): Promise<TestIdentity> {
  const identity = newTestIdentity();
  const registerPage = new RegisterPage(page);
  await registerPage.goto();
  await registerPage.fillValidForm(identity);
  await registerPage.acceptTerms.check();
  await registerPage.submit();
  await page.waitForURL(/\/login$/);

  const loginPage = new LoginPage(page);
  await loginPage.fill(identity);
  await loginPage.submit();
  await page.waitForURL(HOME_URL);
  return identity;
}

/** Login offline por roster (cero HTTP); termina en /sales/products. */
async function loginOfflineByRoster(page: Page): Promise<void> {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  const login = `e2e-nav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await plantRoster(page, { users: [{ login, wrap: 'kat' }] });
  await loginPage.fill({ login, password: KAT_PASSWORD });
  await loginPage.submit();
  await page.waitForURL(HOME_URL);
}

/** Sesión autenticada + provisionada, lista para restaurar en un contexto
 * nuevo (IndexedDB vacío = sin clave de dispositivo). Se acuña UNA vez por
 * worker; los reintentos no gastan logins. */
const localTest = test.extend<{}, { onlineLockedSnapshot: SnapshotEntries }>({
  onlineLockedSnapshot: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await registerAndLoginOnline(page);
      const origin = new URL(page.url()).origin;
      const state = await context.storageState();
      const localStorage =
        state.origins.find((o) => o.origin === origin)?.localStorage ?? [];
      await context.close();
      await use({ origin, localStorage });
    },
    { scope: 'worker' },
  ],
});

// ---------------------------------------------------------------------
// ONLINE — dispositivo intacto
// ---------------------------------------------------------------------

test.describe.serial('online — dispositivo intacto', () => {
  test.describe.configure({ timeout: 120_000 });
  let page: Page;

  test('1. online/intacto: recargar la vista mantiene la sesión', async ({ browser }) => {
    page = await browser.newPage();
    await registerAndLoginOnline(page);

    await page.reload();
    await expect(page.getByRole('button', { name: USER_MENU })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(HOME_URL);
  });

  test('2. online/intacto: ir a /login redirige al home del rol', async () => {
    await page.goto('/login');
    await page.waitForURL(HOME_URL);
  });

  test('3. online/intacto: ir a /register redirige al home del rol', async () => {
    await page.goto('/register');
    await page.waitForURL(HOME_URL);
  });
});

// ---------------------------------------------------------------------
// ONLINE — sin clave de dispositivo
// ---------------------------------------------------------------------

localTest.describe('online — sin clave de dispositivo', () => {
  localTest.describe.configure({ timeout: 120_000 });

  localTest(
    '4. online/sin clave: ir a /login redirige al home del rol',
    async ({ browser, onlineLockedSnapshot }) => {
      const context = await browser.newContext({
        storageState: {
          origins: [
            {
              origin: onlineLockedSnapshot.origin,
              localStorage: onlineLockedSnapshot.localStorage,
            },
          ],
        },
      });
      const page = await context.newPage();
      await page.goto('/login');
      await page.waitForURL(HOME_URL, { timeout: 15_000 });
      await context.close();
    }
  );

  localTest(
    '5. online/sin clave: ir a /register redirige al home del rol',
    async ({ browser, onlineLockedSnapshot }) => {
      const context = await browser.newContext({
        storageState: {
          origins: [
            {
              origin: onlineLockedSnapshot.origin,
              localStorage: onlineLockedSnapshot.localStorage,
            },
          ],
        },
      });
      const page = await context.newPage();
      await page.goto('/register');
      await page.waitForURL(HOME_URL, { timeout: 15_000 });
      await context.close();
    }
  );

  localTest('6. online/sin clave: recargar la vista mantiene la sesión', async ({ browser }) => {
    const page = await browser.newPage();
    await registerAndLoginOnline(page);
    await deleteDeviceKeyDatabase(page);

    await page.reload();
    await expect(page.getByRole('button', { name: USER_MENU })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(HOME_URL);
  });
});

// ---------------------------------------------------------------------
// OFFLINE — dispositivo intacto
// ---------------------------------------------------------------------

test.describe.serial('offline — dispositivo intacto', () => {
  test.describe.configure({ timeout: 120_000 });
  let page: Page;

  test('7. offline/intacto: recargar la vista mantiene la sesión', async ({ browser }) => {
    page = await browser.newPage();
    await loginOfflineByRoster(page);

    await page.reload();
    await expect(page.getByRole('button', { name: USER_MENU })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(HOME_URL);
  });

  test('8. offline/intacto: ir a /login redirige al home del rol', async () => {
    await page.goto('/login');
    await page.waitForURL(HOME_URL);
  });

  test('9. offline/intacto: ir a /register redirige al home del rol', async () => {
    await page.goto('/register');
    await page.waitForURL(HOME_URL);
  });
});

// ---------------------------------------------------------------------
// OFFLINE — sin clave de dispositivo
// ---------------------------------------------------------------------

test.describe('offline — sin clave de dispositivo', () => {
  test.describe.configure({ timeout: 120_000 });

  test('10. offline/sin clave: ir a /login redirige al home del rol', async ({ browser }) => {
    const page = await browser.newPage();
    await loginOfflineByRoster(page);
    await deleteDeviceKeyDatabase(page);

    await page.goto('/login');
    await page.waitForURL(HOME_URL, { timeout: 15_000 });
  });

  test('11. offline/sin clave: ir a /register redirige al home del rol', async ({ browser }) => {
    const page = await browser.newPage();
    await loginOfflineByRoster(page);
    await deleteDeviceKeyDatabase(page);

    await page.goto('/register');
    await page.waitForURL(HOME_URL, { timeout: 15_000 });
  });

  test('12. offline/sin clave: recargar la vista mantiene la sesión', async ({ browser }) => {
    const page = await browser.newPage();
    await loginOfflineByRoster(page);
    await deleteDeviceKeyDatabase(page);

    await page.reload();
    await expect(page.getByRole('button', { name: USER_MENU })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(HOME_URL);
  });
});
